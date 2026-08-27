import {
  buildYouTubeFeedUrl,
  buildYouTubeThumbnailUrl,
  buildYouTubeWatchUrl,
  isYouTubeChannelId,
  parseYouTubeChannelInput,
} from '@gtip/shared';
import { XMLParser } from 'fast-xml-parser';

import { BadRequestError } from '../errors/app-error.js';

export interface YouTubeFeedVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  url: string;
}

export interface YouTubeFeed {
  channelId: string;
  channelTitle: string;
  videos: YouTubeFeedVideo[];
}

export interface YouTubeFeedClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** `channel_id=UC…` as it appears in a channel page's RSS <link>. */
const CHANNEL_ID_IN_PAGE = /channel_id=(UC[A-Za-z0-9_-]{22})/;

interface AtomEntry {
  'yt:videoId'?: string;
  title?: unknown;
  published?: string;
  updated?: string;
  'media:group'?: {
    'media:description'?: unknown;
    'media:title'?: unknown;
    'media:thumbnail'?: { '@_url'?: string } | { '@_url'?: string }[];
  };
}

interface AtomFeed {
  feed?: {
    title?: unknown;
    entry?: AtomEntry | AtomEntry[];
  };
}

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (value && typeof value === 'object' && '#text' in value) {
    return toText((value as { '#text': unknown })['#text']);
  }

  return '';
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

/**
 * Reads a channel's public Atom feed.
 *
 * The feed needs no API key and carries the last ~15 uploads, which is what a
 * "latest videos" shelf wants. `fetchImpl` is injectable so the tests never
 * touch the network.
 */
export class YouTubeFeedClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly parser: XMLParser;

  constructor({ fetchImpl, timeoutMs = 10_000 }: YouTubeFeedClientOptions = {}) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
    this.timeoutMs = timeoutMs;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
    });
  }

  private async get(url: string, accept: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: accept, 'User-Agent': 'gtip-learning-system/0.1' },
      });

      if (!response.ok) {
        throw new BadRequestError(
          `YouTube isteği ${response.status} ile sonuçlandı.`,
          { url },
        );
      }

      return await response.text();
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }

      throw new BadRequestError(
        'YouTube kanalına ulaşılamadı. Bağlantıyı ve kanal adresini kontrol edin.',
        { url, cause: error instanceof Error ? error.message : String(error) },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Turns a handle, URL or id into a channel id.
   *
   * A handle needs one page fetch: the channel page advertises its own feed,
   * and that `<link>` is the only place the id appears unambiguously — the
   * page body also mentions the ids of recommended channels.
   */
  public async resolveChannelId(input: string): Promise<string> {
    const parsed = parseYouTubeChannelInput(input);

    if (!parsed) {
      throw new BadRequestError(
        'YOUTUBE_CHANNEL değeri bir kanal kimliği, @kullanıcıadı veya kanal adresi olmalı.',
        { input },
      );
    }

    if (parsed.kind === 'channelId') {
      return parsed.channelId;
    }

    const html = await this.get(
      `https://www.youtube.com/@${encodeURIComponent(parsed.handle)}`,
      'text/html',
    );
    const match = CHANNEL_ID_IN_PAGE.exec(html);

    if (!match?.[1] || !isYouTubeChannelId(match[1])) {
      throw new BadRequestError(
        `YouTube kanalı bulunamadı: @${parsed.handle}`,
      );
    }

    return match[1];
  }

  public async fetchFeed(channelId: string): Promise<YouTubeFeed> {
    const xml = await this.get(buildYouTubeFeedUrl(channelId), 'application/xml');
    const parsed = this.parser.parse(xml) as AtomFeed;
    const feed = parsed.feed;

    if (!feed) {
      throw new BadRequestError('YouTube akışı okunamadı.', { channelId });
    }

    const videos = toArray(feed.entry)
      .map((entry): YouTubeFeedVideo | null => {
        const videoId = entry['yt:videoId'];

        if (typeof videoId !== 'string' || videoId.length === 0) {
          return null;
        }

        const group = entry['media:group'];
        const thumbnail = toArray(group?.['media:thumbnail'])[0]?.['@_url'];

        return {
          videoId,
          title: toText(entry.title) || toText(group?.['media:title']),
          description: toText(group?.['media:description']),
          publishedAt: new Date(
            entry.published ?? entry.updated ?? Date.now(),
          ).toISOString(),
          thumbnailUrl: thumbnail ?? buildYouTubeThumbnailUrl(videoId),
          url: buildYouTubeWatchUrl(videoId),
        };
      })
      .filter((video): video is YouTubeFeedVideo => video !== null);

    return {
      // The feed-level <yt:channelId> drops the leading "UC" (a long standing
      // YouTube quirk), so the requested id is the one to trust.
      channelId,
      channelTitle: toText(feed.title),
      videos,
    };
  }
}
