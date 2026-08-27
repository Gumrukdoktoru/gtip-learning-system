import type { MediaItem, MediaSource, PaginatedData } from '@gtip/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiRequestError } from '../services/api-client';
import { fetchMedia } from '../services/media-service';

export interface UseMediaOptions {
  source?: MediaSource;
  pageSize?: number;
  search?: string;
  /** Skips the request entirely; used when a tab is not visible. */
  enabled?: boolean;
}

export interface UseMediaResult {
  data: PaginatedData<MediaItem> | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  setPage: (page: number) => void;
  reload: () => void;
}

/** Loads a page of external content, aborting superseded requests. */
export function useMedia({
  source,
  pageSize = 12,
  search = '',
  enabled = true,
}: UseMediaOptions = {}): UseMediaResult {
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<PaginatedData<MediaItem> | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      page,
      pageSize,
      ...(search ? { search } : {}),
      ...(source ? { source } : {}),
    }),
    [page, pageSize, search, source],
  );

  // A new search term always restarts at the first page.
  useEffect(() => setPage(1), [search, source]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);

      return;
    }

    const controller = new AbortController();

    setIsLoading(true);
    setError(null);

    fetchMedia(query, controller.signal)
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
            : 'İçerikler yüklenemedi.',
        );
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [query, reloadToken, enabled]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, isLoading, error, page, setPage, reload };
}
