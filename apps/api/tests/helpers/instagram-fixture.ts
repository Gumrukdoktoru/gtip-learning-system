export interface GraphPostFixture {
  id: string;
  shortcode: string;
  caption?: string;
  mediaType?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  timestamp?: string;
  /** Omitted for a post whose image cannot be resolved. */
  withImage?: boolean;
}

/** A one-pixel PNG served as the CDN image. */
export const CDN_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function toNode(post: GraphPostFixture): Record<string, unknown> {
  const mediaType = post.mediaType ?? 'IMAGE';
  const cdn = `https://scontent.cdninstagram.com/v/${post.shortcode}.jpg?_nc_ht=x&oe=EXPIRES`;
  const base: Record<string, unknown> = {
    id: post.id,
    caption: post.caption ?? '',
    media_type: mediaType,
    permalink: `https://www.instagram.com/p/${post.shortcode}/`,
    timestamp: post.timestamp ?? '2026-05-01T10:00:00+0000',
  };

  if (post.withImage === false) {
    return base;
  }

  if (mediaType === 'VIDEO') {
    // For a video, media_url is the file and thumbnail_url is the frame.
    return {
      ...base,
      media_url: `https://scontent.cdninstagram.com/v/${post.shortcode}.mp4`,
      thumbnail_url: cdn,
    };
  }

  if (mediaType === 'CAROUSEL_ALBUM') {
    // An album carries no media_url of its own; the first child stands in.
    return {
      ...base,
      children: { data: [{ media_url: cdn }, { media_url: `${cdn}&i=2` }] },
    };
  }

  return { ...base, media_url: cdn };
}

export interface FakeInstagramOptions {
  posts?: GraphPostFixture[];
  /** Graph error payload, e.g. an expired token. */
  errorMessage?: string;
  status?: number;
  /** Token returned by refresh_access_token. */
  refreshedToken?: string;
  /** Makes the CDN image request fail. */
  imageStatus?: number;
}

export interface FakeInstagram {
  fetchImpl: typeof fetch;
  calls: string[];
}

/**
 * Stands in for global fetch: serves the media list, the token refresh and the
 * CDN image, and records every URL it was asked for.
 */
export function createFakeInstagramFetch({
  posts = [
    {
      id: '1',
      shortcode: 'CzQ1x8Zx1Zx',
      caption:
        'Beyanname tescilinde en sık yapılan 3 hata\nDetayları videoda anlattım.',
    },
    {
      id: '2',
      shortcode: 'DAcvhWXNqDF',
      caption: 'Antrepoda süre takibi nasıl yapılır?',
      mediaType: 'VIDEO',
      timestamp: '2026-06-01T10:00:00+0000',
    },
  ],
  errorMessage,
  status = 200,
  refreshedToken = 'yenilenmis-token',
  imageStatus = 200,
}: FakeInstagramOptions = {}): FakeInstagram {
  const calls: string[] = [];

  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);

    calls.push(url);

    if (url.includes('scontent.cdninstagram.com')) {
      return new Response(imageStatus === 200 ? CDN_IMAGE : '', {
        status: imageStatus,
        headers: { 'Content-Type': 'image/png' },
      });
    }

    if (url.includes('refresh_access_token')) {
      return new Response(
        JSON.stringify({ access_token: refreshedToken, expires_in: 5183944 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (errorMessage) {
      return new Response(
        JSON.stringify({
          error: { message: errorMessage, type: 'OAuthException', code: 190 },
        }),
        { status, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ data: posts.map(toNode) }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return { fetchImpl, calls };
}
