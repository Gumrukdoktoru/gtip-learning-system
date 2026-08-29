import { BadRequestError } from '../errors/app-error.js';

/** One post as the Graph API returns it, already normalised. */
export interface InstagramPost {
  /** Graph media id. */
  mediaId: string;
  permalink: string;
  caption: string;
  mediaType: string;
  /** Best still image for the post, when Instagram exposes one. */
  imageUrl?: string;
  timestamp: string;
}

export interface InstagramGraphClientOptions {
  accessToken: string;
  /** `me`, or the IG user id when the token came from Facebook Login. */
  userId: string;
  host: string;
  version: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface GraphMediaNode {
  id?: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
  children?: { data?: { media_url?: string; thumbnail_url?: string }[] };
}

interface GraphMediaResponse {
  data?: GraphMediaNode[];
  error?: { message?: string; type?: string; code?: number };
}

interface GraphRefreshResponse {
  access_token?: string;
  expires_in?: number;
  error?: { message?: string };
}

const MEDIA_FIELDS = [
  'id',
  'caption',
  'media_type',
  'media_url',
  'permalink',
  'thumbnail_url',
  'timestamp',
  'children{media_url,thumbnail_url}',
].join(',');

/**
 * Picks the still image for a post.
 *
 * `media_url` is the photo for an IMAGE, but the video file for a VIDEO or
 * REEL — there `thumbnail_url` is the frame. A CAROUSEL_ALBUM carries neither
 * and the first child has to stand in.
 */
function pickImageUrl(node: GraphMediaNode): string | undefined {
  if (node.media_type === 'VIDEO' || node.media_type === 'REELS') {
    return node.thumbnail_url ?? node.media_url;
  }

  if (node.media_type === 'CAROUSEL_ALBUM') {
    const first = node.children?.data?.[0];

    return first?.media_url ?? first?.thumbnail_url ?? node.media_url;
  }

  return node.media_url ?? node.thumbnail_url;
}

/**
 * Reads the account's own posts through Meta's Graph API.
 *
 * Host and version come from configuration because the two supported login
 * flows live on different hosts (`graph.instagram.com` for Instagram Login,
 * `graph.facebook.com` for Facebook Login) and Meta retires versions on its
 * own schedule. `fetchImpl` is injectable so tests never touch the network.
 */
export class InstagramGraphClient {
  private readonly userId: string;
  /** Scheme + host, e.g. `https://graph.instagram.com`. */
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  private accessToken: string;

  constructor({
    accessToken,
    userId,
    host,
    version,
    fetchImpl,
    timeoutMs = 15_000,
  }: InstagramGraphClientOptions) {
    this.accessToken = accessToken;
    this.userId = userId;
    // An explicit scheme is honoured so the host can be pointed at a proxy or
    // a stub; a bare host name defaults to https.
    const trimmed = host.trim().replace(/\/+$/, '');

    this.baseUrl = /^https?:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    this.version = version;
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
    this.timeoutMs = timeoutMs;
  }

  public get token(): string {
    return this.accessToken;
  }

  public setToken(token: string): void {
    this.accessToken = token;
  }

  private async getJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => null)) as
        | (T & { error?: { message?: string } })
        | null;

      if (!response.ok || payload?.error) {
        throw new BadRequestError(
          payload?.error?.message ??
            `Instagram isteği ${response.status} ile sonuçlandı.`,
          { status: response.status },
        );
      }

      if (!payload) {
        throw new BadRequestError('Instagram yanıtı okunamadı.');
      }

      return payload;
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }

      throw new BadRequestError(
        'Instagram Graph API’ye ulaşılamadı. Bağlantıyı ve erişim anahtarını kontrol edin.',
        { cause: error instanceof Error ? error.message : String(error) },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Most recent posts, newest first. */
  public async fetchMedia(limit: number): Promise<InstagramPost[]> {
    const url =
      `${this.baseUrl}/${this.version}/${encodeURIComponent(this.userId)}/media` +
      `?fields=${encodeURIComponent(MEDIA_FIELDS)}` +
      `&limit=${limit}` +
      `&access_token=${encodeURIComponent(this.accessToken)}`;

    const payload = await this.getJson<GraphMediaResponse>(url);

    return (payload.data ?? [])
      .filter((node): node is GraphMediaNode & { id: string; permalink: string } =>
        typeof node.id === 'string' && typeof node.permalink === 'string',
      )
      .map((node) => {
        const imageUrl = pickImageUrl(node);

        return {
          mediaId: node.id,
          permalink: node.permalink,
          caption: node.caption ?? '',
          mediaType: node.media_type ?? 'IMAGE',
          ...(imageUrl ? { imageUrl } : {}),
          timestamp: new Date(node.timestamp ?? Date.now()).toISOString(),
        };
      });
  }

  /**
   * Exchanges the current long-lived token for a fresh 60-day one.
   *
   * Only Instagram-Login tokens support this; a Facebook-Login page token is
   * renewed through a different flow, so the caller checks the host first.
   */
  public async refreshAccessToken(): Promise<{ token: string; expiresIn: number }> {
    const url =
      `${this.baseUrl}/refresh_access_token` +
      `?grant_type=ig_refresh_token` +
      `&access_token=${encodeURIComponent(this.accessToken)}`;

    const payload = await this.getJson<GraphRefreshResponse>(url);

    if (!payload.access_token) {
      throw new BadRequestError('Instagram erişim anahtarı yenilenemedi.');
    }

    this.accessToken = payload.access_token;

    return {
      token: payload.access_token,
      expiresIn: payload.expires_in ?? 0,
    };
  }

  /** Downloads a CDN image so the page never depends on an expiring URL. */
  public async downloadImage(
    url: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });

      if (!response.ok) {
        return null;
      }

      const mimeType = (
        response.headers.get('content-type') ?? 'image/jpeg'
      ).split(';')[0]!.trim();

      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        mimeType,
      };
    } catch {
      // A missing cover is cosmetic; the card falls back to a branded panel.
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
