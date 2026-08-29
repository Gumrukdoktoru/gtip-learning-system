import type { SiteConfig } from '@gtip/shared';
import { useEffect, useState } from 'react';

import { fetchSiteConfig } from '../services/media-service';

const FALLBACK: SiteConfig = {
  title: 'Gümrük Mevzuatı Kaynakları',
  tagline: 'Videolar, gönderiler ve belgeler tek sayfada.',
  youtubeConnected: false,
  instagramConnected: false,
};

/**
 * Loads the public site metadata.
 *
 * A failure falls back to neutral copy rather than blocking the page: the
 * header is decoration, the content below it is the point.
 */
export function useSiteConfig(): SiteConfig {
  const [config, setConfig] = useState<SiteConfig>(FALLBACK);

  useEffect(() => {
    const controller = new AbortController();

    fetchSiteConfig(controller.signal)
      .then(setConfig)
      .catch(() => {
        // Keep the fallback copy.
      });

    return () => controller.abort();
  }, []);

  return config;
}
