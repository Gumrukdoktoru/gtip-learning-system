/**
 * URL helpers for the two external platforms.
 *
 * Everything here is pure string work so the API and the frontend agree on
 * what a "video id" or "shortcode" is without either of them calling out.
 */

/** Matches a YouTube channel id: `UC` plus 22 url-safe characters. */
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
]);

/** Instagram post paths that carry a shortcode. */
const INSTAGRAM_POST_SEGMENTS = new Set(['p', 'reel', 'reels', 'tv']);

export function isYouTubeChannelId(value: string): boolean {
  return CHANNEL_ID_PATTERN.test(value.trim());
}

/**
 * Percent-decodes one path segment.
 *
 * `URL` keeps the pathname percent-encoded, so a handle carrying a Turkish
 * letter arrives as `GumrukKo%C3%A7unuz`. Decoding here means callers always
 * hold the real handle and can encode it once when they build a request.
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape sequence is not a handle we can use.
    return segment;
  }
}

/**
 * Normalises whatever the admin put in `YOUTUBE_CHANNEL`.
 *
 * Accepts a bare channel id, an `@handle`, or any channel URL, and reports
 * which of the two it is so the caller knows whether a lookup is still needed.
 */
export function parseYouTubeChannelInput(
  value: string,
): { kind: 'channelId'; channelId: string } | { kind: 'handle'; handle: string } | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (isYouTubeChannelId(trimmed)) {
    return { kind: 'channelId', channelId: trimmed };
  }

  if (trimmed.startsWith('@')) {
    return { kind: 'handle', handle: trimmed.slice(1) };
  }

  // A bare word is a handle. This is checked before URL parsing because
  // `new URL('https://gumrukdoktoru')` happily parses it as a hostname.
  // Letters outside ASCII are allowed (`@GumrukKoçunuz` is a real handle);
  // a dot is not, since that is what separates a bare word from a host name.
  if (/^[\p{L}\p{N}_-]+$/u.test(trimmed)) {
    return { kind: 'handle', handle: trimmed };
  }

  let url: URL;

  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (!YOUTUBE_HOSTS.has(url.hostname)) {
    return null;
  }

  const feedChannelId = url.searchParams.get('channel_id');

  if (feedChannelId && isYouTubeChannelId(feedChannelId)) {
    return { kind: 'channelId', channelId: feedChannelId };
  }

  const segments = url.pathname.split('/').filter((part) => part.length > 0);
  const [first, second] = segments;

  if (first === 'channel' && second && isYouTubeChannelId(second)) {
    return { kind: 'channelId', channelId: second };
  }

  if (first?.startsWith('@')) {
    return { kind: 'handle', handle: decodeSegment(first.slice(1)) };
  }

  if ((first === 'c' || first === 'user') && second) {
    return { kind: 'handle', handle: decodeSegment(second) };
  }

  return null;
}

export function buildYouTubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

export function buildYouTubeChannelUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}`;
}

export function buildYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** Privacy-enhanced embed, so a visitor who never plays is not cookied. */
export function buildYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`;
}

export function buildYouTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

/** Pulls the video id out of a watch, share, shorts or embed URL. */
export function parseYouTubeVideoId(value: string): string | null {
  const trimmed = value.trim();

  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  let url: URL;

  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (!YOUTUBE_HOSTS.has(url.hostname)) {
    return null;
  }

  const fromQuery = url.searchParams.get('v');

  if (fromQuery && /^[A-Za-z0-9_-]{11}$/.test(fromQuery)) {
    return fromQuery;
  }

  const segments = url.pathname.split('/').filter((part) => part.length > 0);
  const candidate =
    url.hostname.endsWith('youtu.be') ||
    segments[0] === 'shorts' ||
    segments[0] === 'embed' ||
    segments[0] === 'live'
      ? segments[segments.length - 1]
      : undefined;

  return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

/** Pulls the shortcode out of a post, reel or IGTV URL. */
export function parseInstagramShortcode(value: string): string | null {
  const trimmed = value.trim();

  let url: URL;

  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (!INSTAGRAM_HOSTS.has(url.hostname)) {
    return null;
  }

  const segments = url.pathname.split('/').filter((part) => part.length > 0);
  const postIndex = segments.findIndex((segment) =>
    INSTAGRAM_POST_SEGMENTS.has(segment),
  );

  if (postIndex === -1) {
    return null;
  }

  const shortcode = segments[postIndex + 1];

  return shortcode && /^[A-Za-z0-9_-]{5,30}$/.test(shortcode) ? shortcode : null;
}

export function buildInstagramPostUrl(shortcode: string): string {
  return `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/`;
}

/** Official embed frame; works without an access token. */
export function buildInstagramEmbedUrl(shortcode: string): string {
  return `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/embed/captioned`;
}
