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

export function addInstagramItem(
  input: CreateInstagramItemInput,
): Promise<MediaItem> {
  return apiRequest<MediaItem>('/media/instagram', {
    method: 'POST',
    body: input,
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
