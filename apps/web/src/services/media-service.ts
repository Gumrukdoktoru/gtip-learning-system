import type {
  CreateInstagramItemInput,
  MediaItem,
  MediaListQuery,
  PaginatedData,
  SiteConfig,
  UpdateMediaItemInput,
  YouTubeSyncResult,
} from '@gtip/shared';

import { apiRequest, buildQueryString } from './api-client';

export function fetchMedia(
  query: MediaListQuery = {},
  signal?: AbortSignal,
): Promise<PaginatedData<MediaItem>> {
  const search = buildQueryString({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    source: query.source,
  });

  return apiRequest<PaginatedData<MediaItem>>(
    `/media${search}`,
    signal ? { signal } : {},
  );
}

export function fetchSiteConfig(signal?: AbortSignal): Promise<SiteConfig> {
  return apiRequest<SiteConfig>('/site', signal ? { signal } : {});
}

/**
 * Adds an Instagram post, optionally with a cover image.
 *
 * Always sent as multipart so the request shape does not change depending on
 * whether a cover was picked.
 */
export function addInstagramItem(
  input: CreateInstagramItemInput,
  cover?: File | null,
): Promise<MediaItem> {
  const formData = new FormData();

  formData.append('url', input.url);
  formData.append('title', input.title);
  formData.append('description', input.description);

  if (cover) {
    formData.append('cover', cover);
  }

  return apiRequest<MediaItem>('/media/instagram', {
    method: 'POST',
    formData,
  });
}

/** Attaches or replaces a card's cover image. */
export function setMediaCover(id: string, cover: File): Promise<MediaItem> {
  const formData = new FormData();

  formData.append('cover', cover);

  return apiRequest<MediaItem>(`/media/${id}/cover`, {
    method: 'POST',
    formData,
  });
}

export function syncYouTube(): Promise<YouTubeSyncResult> {
  return apiRequest<YouTubeSyncResult>('/media/youtube/sync', {
    method: 'POST',
  });
}

export function updateMediaItem(
  id: string,
  input: UpdateMediaItemInput,
): Promise<MediaItem> {
  return apiRequest<MediaItem>(`/media/${id}`, { method: 'PATCH', body: input });
}

export function deleteMediaItem(id: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/media/${id}`, { method: 'DELETE' });
}
