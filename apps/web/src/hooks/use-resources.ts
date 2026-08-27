import type {
  PaginatedData,
  ResourceCategory,
  ResourceVisibility,
} from '@gtip/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ResourceFiltersValue } from '../components/resource-filters';
import { ApiRequestError } from '../services/api-client';
import type { ResourceListItem } from '../services/resource-service';
import { fetchResources } from '../services/resource-service';

export interface UseResourcesOptions {
  pageSize?: number;
  visibility?: ResourceVisibility;
}

export interface UseResourcesResult {
  data: PaginatedData<ResourceListItem> | null;
  isLoading: boolean;
  error: string | null;
  filters: ResourceFiltersValue;
  setFilters: (filters: ResourceFiltersValue) => void;
  page: number;
  setPage: (page: number) => void;
  reload: () => void;
}

/**
 * Loads a page of resources and keeps the filter/page state together.
 *
 * Every request is abortable, so a fast typist never sees an older response
 * overwrite a newer one.
 */
export function useResources({
  pageSize = 12,
  visibility,
}: UseResourcesOptions = {}): UseResourcesResult {
  const [filters, setFiltersState] = useState<ResourceFiltersValue>({
    search: '',
    category: '',
  });
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<PaginatedData<ResourceListItem> | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      page,
      pageSize,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.category
        ? { category: filters.category as ResourceCategory }
        : {}),
      ...(visibility ? { visibility } : {}),
    }),
    [page, pageSize, filters.search, filters.category, visibility],
  );

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);
    setError(null);

    fetchResources(query, controller.signal)
      .then((result) => {
        setData(result);
        setIsLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          cause instanceof ApiRequestError
            ? cause.message
            : 'Kaynaklar yüklenemedi.',
        );
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [query, reloadToken]);

  const setFilters = useCallback((next: ResourceFiltersValue) => {
    setFiltersState(next);
    // A new filter set always starts from the first page.
    setPage(1);
  }, []);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    data,
    isLoading,
    error,
    filters,
    setFilters,
    page,
    setPage,
    reload,
  };
}
