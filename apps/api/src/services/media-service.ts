import { randomUUID } from 'node:crypto';

import {
  ALLOWED_COVER_EXTENSIONS,
  ALLOWED_COVER_MIME_TYPES,
  buildInstagramPostUrl,
  buildStorageKey,
  buildStoredFileName,
  MAX_COVER_SIZE_BYTES,
  normalizeFolderPrefix,
  parseInstagramShortcode,
} from '@gtip/shared';
import type {
  CreateInstagramItemInput,
  MediaItem,
  PaginatedData,
  UpdateMediaItemInput,
  YouTubeSyncResult,
} from '@gtip/shared';

import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  PayloadTooLargeError,
} from '../errors/app-error.js';
import type {
  MediaQuery,
  MediaRecord,
  MediaRepository,
} from '../repositories/media-repository.js';
import type { StorageDriver } from '../storage/storage-driver.js';
import { logger } from '../utils/logger.js';
import type { UploadedFile } from './resource-service.js';
import type { YouTubeFeedClient } from './youtube-feed.js';

export interface MediaServiceOptions {
  media: MediaRepository;
  youtube: YouTubeFeedClient;
  /** Handle, URL or channel id from YOUTUBE_CHANNEL; empty disables sync. */
  youtubeChannel: string;
  /** How long a sync result stays fresh before a read triggers another. */
  syncIntervalMs: number;
  storage: StorageDriver;
  folderPrefix: string;
  /** e.g. `http://localhost:3000/api/v1`, used to build cover URLs. */
  apiBaseUrl: string;
}

export class MediaService {
  private readonly media: MediaRepository;
  private readonly youtube: YouTubeFeedClient;
  private readonly youtubeChannel: string;
  private readonly syncIntervalMs: number;
  private readonly storage: StorageDriver;
  private readonly folderPrefix: string;
  private readonly apiBaseUrl: string;

  private resolvedChannelId: string | null = null;
  private lastSyncedAt: number | null = null;
  /** In-flight sync, so concurrent readers share one fetch. */
  private pendingSync: Promise<YouTubeSyncResult | null> | null = null;

  constructor({
    media,
    youtube,
    youtubeChannel,
    syncIntervalMs,
    storage,
    folderPrefix,
    apiBaseUrl,
  }: MediaServiceOptions) {
    this.media = media;
    this.youtube = youtube;
    this.youtubeChannel = youtubeChannel.trim();
    this.syncIntervalMs = syncIntervalMs;
    this.storage = storage;
    this.folderPrefix = normalizeFolderPrefix(folderPrefix);
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
  }

  /**
   * Maps a stored record onto what readers get.
   *
   * An uploaded cover wins over a feed thumbnail, and the object key is
   * replaced by a URL the browser can actually fetch.
   */
  private toMediaItem(record: MediaRecord): MediaItem {
    const { coverStorageKey, coverMimeType: _coverMimeType, thumbnailUrl, ...rest } =
      record;
    const coverUrl = coverStorageKey
      ? (this.storage.getPublicUrl(coverStorageKey) ??
        `${this.apiBaseUrl}/media/${record.id}/cover`)
      : thumbnailUrl;

    return { ...rest, ...(coverUrl ? { thumbnailUrl: coverUrl } : {}) };
  }

  public get isYouTubeConfigured(): boolean {
    return this.youtubeChannel.length > 0;
  }

  public async listMedia(query: MediaQuery): Promise<PaginatedData<MediaItem>> {
    const { items, total } = await this.media.list(query);

    return {
      items: items.map((item) => this.toMediaItem(item)),
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

  /**
   * Validates a cover image and writes it to the public upload prefix.
   *
   * Covers share the documented `{prefix}public/uploads/` layout with resource
   * files: they are public images served to every visitor.
   */
  private async storeCover(
    cover: UploadedFile,
  ): Promise<{ storageKey: string; mimeType: string }> {
    if (cover.sizeBytes <= 0) {
      throw new BadRequestError('Boş bir görsel yüklenemez.');
    }

    if (cover.sizeBytes > MAX_COVER_SIZE_BYTES) {
      throw new PayloadTooLargeError(
        `Kapak görseli en fazla ${Math.floor(
          MAX_COVER_SIZE_BYTES / (1024 * 1024),
        )} MB olabilir.`,
      );
    }

    const mimeType = cover.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
    const extension = cover.originalName
      .slice(cover.originalName.lastIndexOf('.'))
      .toLowerCase();

    const mimeAllowed = (
      ALLOWED_COVER_MIME_TYPES as readonly string[]
    ).includes(mimeType);
    const extensionAllowed = (
      ALLOWED_COVER_EXTENSIONS as readonly string[]
    ).includes(extension);

    if (!mimeAllowed || !extensionAllowed) {
      throw new BadRequestError(
        'Kapak görseli JPG, PNG veya WEBP olmalı.',
        { mimeType, extension },
      );
    }

    const storageKey = buildStorageKey({
      folderPrefix: this.folderPrefix,
      visibility: 'public',
      storedFileName: buildStoredFileName(cover.originalName),
    });

    await this.storage.putObject({
      key: storageKey,
      body: cover.buffer,
      contentType: mimeType,
    });

    return { storageKey, mimeType };
  }

  /** Removes a cover object, logging rather than failing the caller. */
  private async discardCover(storageKey: string | undefined): Promise<void> {
    if (!storageKey) {
      return;
    }

    await this.storage.deleteObject(storageKey).catch((error: unknown) => {
      logger.error('Orphaned cover left in storage', {
        storageKey,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /** Adds an Instagram post by URL; the copy is written by the admin. */
  public async addInstagramItem(
    input: CreateInstagramItemInput,
    cover?: UploadedFile,
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

    const storedCover = cover ? await this.storeCover(cover) : undefined;
    const now = new Date().toISOString();

    try {
      const created = await this.media.create({
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
        ...(storedCover
          ? {
              coverStorageKey: storedCover.storageKey,
              coverMimeType: storedCover.mimeType,
            }
          : {}),
      });

      return this.toMediaItem(created);
    } catch (error) {
      await this.discardCover(storedCover?.storageKey);

      throw error;
    }
  }

  /** Attaches or replaces a card's cover image. */
  public async setCover(id: string, cover: UploadedFile): Promise<MediaItem> {
    const existing = await this.getRecordOrFail(id);
    const stored = await this.storeCover(cover);

    const updated = await this.media.update(id, {
      coverStorageKey: stored.storageKey,
      coverMimeType: stored.mimeType,
      updatedAt: new Date().toISOString(),
    });

    if (!updated) {
      await this.discardCover(stored.storageKey);

      throw new NotFoundError('İçerik bulunamadı.');
    }

    // The replaced object is only removed once the record points elsewhere.
    if (
      existing.coverStorageKey &&
      existing.coverStorageKey !== stored.storageKey
    ) {
      await this.discardCover(existing.coverStorageKey);
    }

    return this.toMediaItem(updated);
  }

  /** Streams a card's cover image back. */
  public async readCoverBytes(
    id: string,
  ): Promise<{ body: Buffer; mimeType: string }> {
    const record = await this.getRecordOrFail(id);

    if (!record.coverStorageKey) {
      throw new NotFoundError('Bu içeriğin kapak görseli yok.');
    }

    return {
      body: await this.storage.getObject(record.coverStorageKey),
      mimeType: record.coverMimeType ?? 'application/octet-stream',
    };
  }

  private async getRecordOrFail(id: string): Promise<MediaRecord> {
    const record = await this.media.findById(id);

    if (!record) {
      throw new NotFoundError('İçerik bulunamadı.');
    }

    return record;
  }

  public async getMediaItemOrFail(id: string): Promise<MediaItem> {
    return this.toMediaItem(await this.getRecordOrFail(id));
  }

  public async updateMediaItem(
    id: string,
    input: UpdateMediaItemInput,
  ): Promise<MediaItem> {
    await this.getRecordOrFail(id);

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

    return this.toMediaItem(updated);
  }

  public async deleteMediaItem(id: string): Promise<void> {
    const record = await this.getRecordOrFail(id);

    await this.media.delete(id);
    await this.discardCover(record.coverStorageKey);
  }
}
