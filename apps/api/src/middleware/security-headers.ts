import type { HelmetOptions } from 'helmet';

import type { AppConfig } from '../config/env.js';

/** Hosts the two platforms serve their images and embeds from. */
const YOUTUBE_IMAGE_HOSTS = ['https://*.ytimg.com', 'https://i.ytimg.com'];
const INSTAGRAM_IMAGE_HOSTS = [
  'https://*.cdninstagram.com',
  'https://*.fbcdn.net',
];
const EMBED_HOSTS = [
  'https://www.youtube-nocookie.com',
  'https://www.youtube.com',
  'https://www.instagram.com',
];

function originOf(url: string | undefined): string[] {
  if (!url) {
    return [];
  }

  try {
    return [new URL(url).origin];
  } catch {
    return [];
  }
}

/**
 * Builds the Content Security Policy for the served page.
 *
 * The defaults helmet ships are stricter than this app can live with: the
 * video shelf loads thumbnails from YouTube's CDN and the players open in
 * iframes, both of which `img-src 'self'` and `frame-src 'none'` would block.
 * Everything else stays closed, and only the hosts the app actually uses are
 * named — including the bucket URL when public files are served from one.
 */
export function buildHelmetOptions(config: AppConfig): HelmetOptions {
  const bucketOrigin = originOf(config.AWS_S3_PUBLIC_BASE_URL);

  return {
    // Downloads are served from this origin, so the default cross-origin
    // resource policy would block the frontend from embedding PDFs.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // The YouTube player sets its own cross-origin state; isolating the page
    // would keep it from loading.
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        // The bundle ships one stylesheet; inline styles come from React.
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': [
          "'self'",
          'data:',
          'blob:',
          ...YOUTUBE_IMAGE_HOSTS,
          ...INSTAGRAM_IMAGE_HOSTS,
          ...bucketOrigin,
        ],
        'media-src': ["'self'", ...bucketOrigin],
        'frame-src': EMBED_HOSTS,
        'connect-src': ["'self'", ...bucketOrigin],
        'object-src': ["'none'"],
        'frame-ancestors': ["'self'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
      },
    },
  };
}
