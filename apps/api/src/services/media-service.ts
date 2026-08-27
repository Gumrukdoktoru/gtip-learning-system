import { randomUUID } from 'node:crypto';

import {
  buildInstagramPostUrl,
  parseInstagramShortcode,
} from '@gtip/shared';
import type {
  CreateInstagramItemInput,
  MediaItem,
  PaginatedData,
  UpdateMediaItemInput,
  YouTubeSyncResult,
} from '@gtip/shared';

import { BadRequestError, ConflictError, NotFoundError } from '../errors/app-error.js';
import type {
  MediaQuery,
  MediaRepository,
} from '../repositories/media-repository.js';
import { logger } from '../utils/logger.js';
import type { YouTubeFeedClient } from './youtube-feed.js';

export interface MediaServiceOptions {
  media: MediaRepository;
  youtube: YouTubeFeedClient;
  /** Handle, URL or channel id from YOUTUBE_CHANNEL; empty disables sync. */
  youtubeChannel: string;
  /** How long a sync result stays fresh before a read triggers another. */
  syncIntervalMs: number;
}

export class MediaService {
  private readonly media: MediaRepository;
  private readonly youtube: YouTubeFeedClient;
  private readonly youtubeChannel: string;
  private readonly syncIntervalMs: number;

  private resolvedChannelId: string | null = null;
  private lastSyncedAt: number | null = null;
  /** In-flight sync, so concurrent readers share one fetch. */
  private pendingSync: Promise<YouTubeSyncResult | null> | null = null;

  constructor({
    media,
    youtube,
    youtubeChannel,
    syncIntervalMs,
  }: MediaServiceOptions) {
    this.media = media;
    this.youtube = youtube;
    this.youtubeChannel = youtubeChannel.trim();
    this.syncIntervalMs = syncIntervalMs;
  }

  public get isYouTubeConfigured(): boolean {
    return this.youtubeChannel.length > 0;
  }

  public async listMedia(query: MediaQuery): Promise<PaginatedData<MediaItem>> {
    const { items, total } = await this.media.list(query);

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  /**
   * Pulls the channel feed and upserts every video by its YouTube id.
   *
   * Videos are matched on `externalId`, so a re-sync updates titles in place
   * instead of duplicating the shelf. Admin-authored fields (`isPinned`) are
   * left alone.
   */
  public async syncYouTube(): Promise<YouTubeSyncResult> {
    if (!this.isYouTubeConfigured) {
      throw new BadRequestError(
        'YouTube kanalı yapılandırılmamış. .env dosyasında YOUTUBE_CHANNEL değerini ayarlayın.',
      );
    }

    this.resolvedChannelId ??= await this.youtube.resolveChannelId(
      this.youtubeChannel,
    );

    const feed = await this.youtube.fetchFeed(this.resolvedChannelId);
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;

    for (const video of feed.videos) {
      const existing = await this.media.findByExternalId(
        'youtube',
        video.videoId,
      );

      if (existing) {
        await this.media.update(existing.id, {
          title: video.title,
          description: video.description,
          thumbnailUrl: video.thumbnailUrl,
          publishedAt: video.publishedAt,
          url: video.url,
          updatedAt: now,
        });
        updated += 1;
        continue;
      }

      await this.media.create({
        id: randomUUID(),
        source: 'youtube',
        externalId: video.videoId,
        url: video.url,
        title: video.title,
        description: video.description,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt,
        isPinned: false,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
    }

    this.lastSyncedAt = Date.now();

    return {
      channelId: feed.channelId,
      channelTitle: feed.channelTitle,
      fetched: feed.videos.length,
      created,
      updated,
      syncedAt: now,
    };
  }

  /**
   * Refreshes the shelf if the last sync is older than the interval.
   *
   * Called on public reads so students always see recent uploads without a
   * cron job. A failure here is logged and swallowed: a YouTube outage must
   * not take the page down.
   */
  public async syncYouTubeIfStale(): Promise<YouTubeSyncResult | null> {
    if (!this.isYouTubeConfigured) {
      return null;
    }

    const isFresh =
      this.lastSyncedAt !== null &&
      Date.now() - this.lastSyncedAt < this.syncIntervalMs;

    if (isFresh) {
      return null;
    }

    this.pendingSync ??= this.syncYouTube()
      .catch((error: unknown) => {
        // Back off for a full interval so a broken channel is not retried on
        // every single request.
        this.lastSyncedAt = Date.now();
        logger.warn('YouTube sync failed', {
          message: error instanceof Error ? error.message : String(error),
        });

        return null;
      })
      .finally(() => {
        this.pendingSync = null;
      });

    return this.pendingSync;
  }

  /** Adds an Instagram post by URL; the copy is written by the admin. */
  public async addInstagramItem(
    input: CreateInstagramItemInput,
  ): Promise<MediaItem> {
    const shortcode = parseInstagramShortcode(input.url);

    if (!shortcode) {
      throw new BadRequestError(
        'Geçerli bir Instagram gönderi adresi girin (örn. https://www.instagram.com/p/XXXX/).',
      );
    }

    const existing = await this.media.findByExternalId('instagram', shortcode);

    if (existing) {
      throw new ConflictError('Bu Instagram gönderisi zaten eklenmiş.', {
        id: existing.id,
      });
    }

    const now = new Date().toISOString();

    return this.media.create({
      id: randomUUID(),
      source: 'instagram',
      externalId: shortcode,
      url: buildInstagramPostUrl(shortcode),
      title: input.title,
      description: input.description,
      publishedAt: input.publishedAt ?? now,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  public async getMediaItemOrFail(id: string): Promise<MediaItem> {
    const item = await this.media.findById(id);

    if (!item) {
      throw new NotFoundError('İçerik bulunamadı.');
    }

    return item;
  }

  public async updateMediaItem(
    id: string,
    input: UpdateMediaItemInput,
  ): Promise<MediaItem> {
    await this.getMediaItemOrFail(id);

    const updated = await this.media.update(id, {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.isPinned === undefined ? {} : { isPinned: input.isPinned }),
      updatedAt: new Date().toISOString(),
    });

    if (!updated) {
      throw new NotFoundError('İçerik bulunamadı.');
    }

    return updated;
  }

  public async deleteMediaItem(id: string): Promise<void> {
    await this.getMediaItemOrFail(id);
    await this.media.delete(id);
  }
}
