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
  InstagramSyncResult,
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
import type { TokenRepository } from '../repositories/token-repository.js';
import type { StorageDriver } from '../storage/storage-driver.js';
import { logger } from '../utils/logger.js';
import type { InstagramGraphClient } from './instagram-graph.js';
import type { UploadedFile } from './resource-service.js';
import type { YouTubeFeedClient } from './youtube-feed.js';

/** Maps a downloaded image's content type onto a file extension. */
function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/png') {
    return '.png';
  }

  if (mimeType === 'image/webp') {
    return '.webp';
  }

  return '.jpg';
}

/** Token id under which the rotated Instagram token is stored. */
const INSTAGRAM_TOKEN_ID = 'instagram';

/** Meta issues 60-day tokens; refresh with a week to spare. */
const TOKEN_REFRESH_AFTER_MS = 53 * 24 * 60 * 60 * 1000;

/** Longest title derived from a caption before it is cut at a word break. */
const MAX_DERIVED_TITLE_LENGTH = 120;

export interface CaptionParts {
  title: string;
  description: string;
}

/**
 * Splits a caption into a card title and the rest of the text.
 *
 * Instagram posts have no title field, so the first line — or the first
 * sentence of a single-line caption — stands in until an admin writes one.
 * The title is then removed from the description so a short caption does not
 * appear twice on the same card. A truncated title keeps the whole caption,
 * since the cut sentence is still worth reading in full.
 */
export function splitCaption(caption: string): CaptionParts {
  const trimmed = caption.trim();
  const firstLine = trimmed
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return { title: 'Instagram gönderisi', description: '' };
  }

  const firstSentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;

  if (firstSentence.length > MAX_DERIVED_TITLE_LENGTH) {
    const cut = firstSentence.slice(0, MAX_DERIVED_TITLE_LENGTH);
    const lastSpace = cut.lastIndexOf(' ');
    const title = `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;

    return { title, description: trimmed };
  }

  const remainder = trimmed.startsWith(firstSentence)
    ? trimmed.slice(firstSentence.length).trim()
    : trimmed;

  return { title: firstSentence, description: remainder };
}

export interface MediaServiceOptions {
  media: MediaRepository;
  youtube: YouTubeFeedClient;
  /** Handle, URL or channel id from YOUTUBE_CHANNEL; empty disables sync. */
  youtubeChannel: string;
  /** How long a sync result stays fresh before a read triggers another. */
  syncIntervalMs: number;
  /** Null when INSTAGRAM_ACCESS_TOKEN is unset; posts stay hand-curated. */
  instagram: InstagramGraphClient | null;
  instagramSyncIntervalMs: number;
  instagramSyncLimit: number;
  /** Only Instagram-Login tokens can be refreshed in place. */
  instagramTokenRefreshable: boolean;
  tokens: TokenRepository;
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
  private readonly instagram: InstagramGraphClient | null;
  private readonly instagramSyncIntervalMs: number;
  private readonly instagramSyncLimit: number;
  private readonly instagramTokenRefreshable: boolean;
  private readonly tokens: TokenRepository;
  private readonly storage: StorageDriver;
  private readonly folderPrefix: string;
  private readonly apiBaseUrl: string;

  private resolvedChannelId: string | null = null;
  private lastSyncedAt: number | null = null;
  private lastInstagramSyncedAt: number | null = null;
  private pendingInstagramSync: Promise<InstagramSyncResult | null> | null = null;
  private tokenLoaded = false;
  /** In-flight sync, so concurrent readers share one fetch. */
  private pendingSync: Promise<YouTubeSyncResult | null> | null = null;

  constructor({
    media,
    youtube,
    youtubeChannel,
    syncIntervalMs,
    instagram,
    instagramSyncIntervalMs,
    instagramSyncLimit,
    instagramTokenRefreshable,
    tokens,
    storage,
    folderPrefix,
    apiBaseUrl,
  }: MediaServiceOptions) {
    this.media = media;
    this.youtube = youtube;
    this.youtubeChannel = youtubeChannel.trim();
    this.syncIntervalMs = syncIntervalMs;
    this.instagram = instagram;
    this.instagramSyncIntervalMs = instagramSyncIntervalMs;
    this.instagramSyncLimit = instagramSyncLimit;
    this.instagramTokenRefreshable = instagramTokenRefreshable;
    this.tokens = tokens;
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

  public get isInstagramConfigured(): boolean {
    return this.instagram !== null;
  }

  /**
   * Loads the rotated token once, then refreshes it when it is nearly due.
   *
   * A refresh failure is not fatal: the current token is still valid for days,
   * and the next sync will try again.
   */
  private async ensureFreshToken(): Promise<void> {
    if (!this.instagram) {
      return;
    }

    if (!this.tokenLoaded) {
      const stored = await this.tokens.read(INSTAGRAM_TOKEN_ID);

      if (stored) {
        this.instagram.setToken(stored.accessToken);
      }

      this.tokenLoaded = true;
    }

    if (!this.instagramTokenRefreshable) {
      return;
    }

    const stored = await this.tokens.read(INSTAGRAM_TOKEN_ID);
    const refreshedAt = stored ? Date.parse(stored.refreshedAt) : 0;

    if (Number.isFinite(refreshedAt) && Date.now() - refreshedAt < TOKEN_REFRESH_AFTER_MS) {
      return;
    }

    try {
      const { token } = await this.instagram.refreshAccessToken();

      await this.tokens.write(INSTAGRAM_TOKEN_ID, token);
      logger.info('Instagram access token refreshed');
    } catch (error) {
      logger.warn('Instagram token refresh failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Pulls the account's own posts and upserts them by shortcode.
   *
   * Matching on the shortcode — not the Graph media id — means a post the
   * coach already added by hand is updated in place rather than duplicated.
   * Copy an admin wrote is never overwritten, and a cover is only filled in
   * when the card has none, so sync is always additive to curated work.
   */
  public async syncInstagram(): Promise<InstagramSyncResult> {
    if (!this.instagram) {
      throw new BadRequestError(
        'Instagram bağlı değil. .env dosyasında INSTAGRAM_ACCESS_TOKEN değerini ayarlayın.',
      );
    }

    await this.ensureFreshToken();

    const posts = await this.instagram.fetchMedia(this.instagramSyncLimit);
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    let skippedCurated = 0;
    let coversStored = 0;

    for (const post of posts) {
      const shortcode = parseInstagramShortcode(post.permalink);

      if (!shortcode) {
        logger.warn('Instagram post skipped: unreadable permalink', {
          permalink: post.permalink,
        });
        continue;
      }

      const existing = await this.media.findByExternalId('instagram', shortcode);
      const needsCover = !existing?.coverStorageKey;
      // Instagram's CDN URLs are signed and expire, so the image is copied
      // into our own storage once and served from there afterwards.
      const cover =
        needsCover && post.imageUrl
          ? await this.instagram.downloadImage(post.imageUrl)
          : null;
      const storedCover = cover
        ? await this.storeCover({
            originalName: `${shortcode}${extensionForMimeType(cover.mimeType)}`,
            buffer: cover.buffer,
            mimeType: cover.mimeType,
            sizeBytes: cover.buffer.byteLength,
          }).catch((error: unknown) => {
            logger.warn('Instagram cover could not be stored', {
              shortcode,
              message: error instanceof Error ? error.message : String(error),
            });

            return null;
          })
        : null;

      if (storedCover) {
        coversStored += 1;
      }

      if (existing) {
        if (existing.isCurated) {
          skippedCurated += 1;
        }

        await this.media.update(existing.id, {
          url: buildInstagramPostUrl(shortcode),
          publishedAt: post.timestamp,
          updatedAt: now,
          ...(existing.isCurated ? {} : splitCaption(post.caption)),
          ...(storedCover
            ? {
                coverStorageKey: storedCover.storageKey,
                coverMimeType: storedCover.mimeType,
              }
            : {}),
        });
        updated += 1;
        continue;
      }

      await this.media.create({
        id: randomUUID(),
        source: 'instagram',
        externalId: shortcode,
        url: buildInstagramPostUrl(shortcode),
        ...splitCaption(post.caption),
        publishedAt: post.timestamp,
        isPinned: false,
        isCurated: false,
        createdAt: now,
        updatedAt: now,
        ...(storedCover
          ? {
              coverStorageKey: storedCover.storageKey,
              coverMimeType: storedCover.mimeType,
            }
          : {}),
      });
      created += 1;
    }

    this.lastInstagramSyncedAt = Date.now();

    return {
      fetched: posts.length,
      created,
      updated,
      skippedCurated,
      coversStored,
      syncedAt: now,
    };
  }

  /**
   * Refreshes the Instagram shelf when the last sync has gone stale.
   *
   * Mirrors the YouTube path: called on public reads, and a failure is logged
   * and swallowed so an expired token never takes the page down.
   */
  public async syncInstagramIfStale(): Promise<InstagramSyncResult | null> {
    if (!this.instagram) {
      return null;
    }

    const isFresh =
      this.lastInstagramSyncedAt !== null &&
      Date.now() - this.lastInstagramSyncedAt < this.instagramSyncIntervalMs;

    if (isFresh) {
      return null;
    }

    this.pendingInstagramSync ??= this.syncInstagram()
      .catch((error: unknown) => {
        // Back off for a full interval so a bad token is not retried on every
        // single request.
        this.lastInstagramSyncedAt = Date.now();
        logger.warn('Instagram sync failed', {
          message: error instanceof Error ? error.message : String(error),
        });

        return null;
      })
      .finally(() => {
        this.pendingInstagramSync = null;
      });

    return this.pendingInstagramSync;
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
        // Hand-written copy: sync must never overwrite it.
        isCurated: true,
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
      // Editing the words marks the card as curated, so a later sync leaves
      // them alone. Pinning alone is not an edit to the copy.
      ...(input.title === undefined && input.description === undefined
        ? {}
        : { isCurated: true }),
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
