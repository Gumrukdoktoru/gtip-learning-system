import type {
  CreateResourceInput,
  PaginatedData,
  PublicResource,
  Resource,
  ResourceDownloadTicket,
  ResourceListQuery,
} from '@gtip/shared';

import { apiRequest, buildApiUrl, buildQueryString } from './api-client';

export type ResourceListItem = Resource | PublicResource;

export function fetchResources(
  query: ResourceListQuery = {},
  signal?: AbortSignal,
): Promise<PaginatedData<ResourceListItem>> {
  const search = buildQueryString({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    category: query.category,
    visibility: query.visibility,
  });

  return apiRequest<PaginatedData<ResourceListItem>>(
    `/resources${search}`,
    signal ? { signal } : {},
  );
}

export function fetchResource(id: string): Promise<ResourceListItem> {
  return apiRequest<ResourceListItem>(`/resources/${id}`);
}

export function fetchDownloadTicket(
  id: string,
): Promise<ResourceDownloadTicket> {
  return apiRequest<ResourceDownloadTicket>(`/resources/${id}/download-url`);
}

/** URL of the API's own streaming endpoint, used as the anchor href. */
export function resourceDownloadUrl(id: string): string {
  return buildApiUrl(`/resources/${id}/download`);
}

export function uploadResource(
  input: CreateResourceInput,
  file: File,
): Promise<Resource> {
  const formData = new FormData();

  formData.append('title', input.title);
  formData.append('description', input.description);
  formData.append('category', input.category);
  formData.append('visibility', input.visibility);
  formData.append('file', file);

  return apiRequest<Resource>('/resources', { method: 'POST', formData });
}

export function updateResource(
  id: string,
  input: Partial<CreateResourceInput>,
): Promise<Resource> {
  return apiRequest<Resource>(`/resources/${id}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteResource(id: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/resources/${id}`, { method: 'DELETE' });
}

/** Narrows a list item to the admin shape, which carries storage metadata. */
export function isAdminResource(
  resource: ResourceListItem,
): resource is Resource {
  return 'storageKey' in resource;
}
