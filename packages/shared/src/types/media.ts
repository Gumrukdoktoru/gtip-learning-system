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
}
