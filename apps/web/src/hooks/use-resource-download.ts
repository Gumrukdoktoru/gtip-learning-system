import { useCallback, useState } from 'react';

import { ApiRequestError } from '../services/api-client';
import type { ResourceListItem } from '../services/resource-service';
import { fetchDownloadTicket } from '../services/resource-service';

export interface UseResourceDownloadResult {
  downloadingId: string | null;
  error: string | null;
  download: (resource: ResourceListItem) => Promise<void>;
}

/**
 * Asks the API where the file lives and sends the browser there.
 *
 * The ticket is a direct bucket URL for public files, a signed URL for private
 * ones, and the API's streaming endpoint when the driver offers neither — the
 * component never has to know which.
 */
export function useResourceDownload(): UseResourceDownloadResult {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async (resource: ResourceListItem) => {
    setDownloadingId(resource.id);
    setError(null);

    try {
      const ticket = await fetchDownloadTicket(resource.id);

      window.open(ticket.url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Dosya indirilemedi. Lütfen tekrar deneyin.',
      );
    } finally {
      setDownloadingId(null);
    }
  }, []);

  return { downloadingId, error, download };
}
