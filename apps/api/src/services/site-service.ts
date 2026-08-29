import {
  buildYouTubeChannelUrl,
  parseYouTubeChannelInput,
} from '@gtip/shared';
import type { SiteConfig } from '@gtip/shared';

export interface SiteServiceOptions {
  title: string;
  tagline: string;
  youtubeChannel: string;
  instagramProfileUrl?: string;
  instagramAccessToken?: string;
}

/** Turns the raw YOUTUBE_CHANNEL value into a link a visitor can click. */
export function buildYouTubeProfileUrl(
  youtubeChannel: string,
): string | undefined {
  const parsed = parseYouTubeChannelInput(youtubeChannel);

  if (!parsed) {
    return undefined;
  }

  return parsed.kind === 'channelId'
    ? buildYouTubeChannelUrl(parsed.channelId)
    : `https://www.youtube.com/@${encodeURIComponent(parsed.handle)}`;
}

/** Public, non-secret site metadata for the learning hub header. */
export function buildSiteConfig({
  title,
  tagline,
  youtubeChannel,
  instagramProfileUrl,
  instagramAccessToken,
}: SiteServiceOptions): SiteConfig {
  const youtubeChannelUrl = buildYouTubeProfileUrl(youtubeChannel);

  return {
    title,
    tagline,
    ...(youtubeChannelUrl ? { youtubeChannelUrl } : {}),
    ...(instagramProfileUrl ? { instagramProfileUrl } : {}),
    youtubeConnected: youtubeChannel.trim().length > 0,
    instagramConnected: (instagramAccessToken ?? '').trim().length > 0,
  };
}
