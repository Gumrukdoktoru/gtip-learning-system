/** Where an external item came from. */
export type MediaSource = 'youtube' | 'instagram';

export const MEDIA_SOURCES: MediaSource[] = ['youtube', 'instagram'];

export const MEDIA_SOURCE_LABELS: Record<MediaSource, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
};

/**
 * A video or post published on an external platform.
 *
 * YouTube items are synced from the channel's Atom feed and are replaced on
 * every sync; Instagram items are added by hand from the admin panel, so their
 * `title`/`description` are authored rather than fetched.
 */
export interface MediaItem {
  id: string;
  source: MediaSource;
  /** YouTube video id, or Instagram shortcode. Unique per source. */
  externalId: string;
  url: string;
  title: string;
  description: string;
  /**
   * Card image. For YouTube this is the frame from the feed; for Instagram it
   * is a cover the admin uploaded, served by the API. Absent means the card
   * falls back to a titled placeholder.
   */
  thumbnailUrl?: string;
  publishedAt: string;
  /** Pinned items lead the list regardless of date. */
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MediaListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  source?: MediaSource;
}

export interface CreateInstagramItemInput {
  url: string;
  title: string;
  description: string;
  publishedAt?: string;
}

export interface UpdateMediaItemInput {
  title?: string;
  description?: string;
  isPinned?: boolean;
}

/** Result of attaching or replacing an Instagram card's cover image. */
export interface CoverUploadResult {
  id: string;
  thumbnailUrl: string;
}

export interface InstagramSyncResult {
  fetched: number;
  created: number;
  updated: number;
  /** Posts left untouched because an admin wrote their copy by hand. */
  skippedCurated: number;
  /** Cover images downloaded from Instagram's CDN into our own storage. */
  coversStored: number;
  syncedAt: string;
}

export interface YouTubeSyncResult {
  channelId: string;
  channelTitle: string;
  fetched: number;
  created: number;
  updated: number;
  syncedAt: string;
}

/** Public site metadata shown on the learning hub. */
export interface SiteConfig {
  title: string;
  tagline: string;
  youtubeChannelUrl?: string;
  instagramProfileUrl?: string;
  youtubeConnected: boolean;
  /** True when an Instagram access token is configured. */
  instagramConnected: boolean;
}
