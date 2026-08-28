import { describe, expect, it } from 'vitest';

import {
  buildInstagramEmbedUrl,
  buildYouTubeEmbedUrl,
  buildYouTubeFeedUrl,
  buildYouTubeThumbnailUrl,
  buildYouTubeWatchUrl,
  isYouTubeChannelId,
  parseInstagramShortcode,
  parseYouTubeChannelInput,
  parseYouTubeVideoId,
} from './media-url.js';

const CHANNEL_ID = 'UCBJycsmduvYEL83R_U4JriQ';

describe('parseYouTubeChannelInput', () => {
  it('accepts a bare channel id', () => {
    expect(parseYouTubeChannelInput(CHANNEL_ID)).toEqual({
      kind: 'channelId',
      channelId: CHANNEL_ID,
    });
  });

  it('accepts a channel URL', () => {
    expect(
      parseYouTubeChannelInput(`https://www.youtube.com/channel/${CHANNEL_ID}`),
    ).toEqual({ kind: 'channelId', channelId: CHANNEL_ID });
  });

  it('accepts the feed URL itself', () => {
    expect(parseYouTubeChannelInput(buildYouTubeFeedUrl(CHANNEL_ID))).toEqual({
      kind: 'channelId',
      channelId: CHANNEL_ID,
    });
  });

  it('accepts @handle, handle URLs and legacy /c/ and /user/ paths', () => {
    expect(parseYouTubeChannelInput('@gumrukdoktoru')).toEqual({
      kind: 'handle',
      handle: 'gumrukdoktoru',
    });
    expect(
      parseYouTubeChannelInput('https://youtube.com/@gumrukdoktoru'),
    ).toEqual({ kind: 'handle', handle: 'gumrukdoktoru' });
    expect(parseYouTubeChannelInput('youtube.com/c/GumrukDoktoru')).toEqual({
      kind: 'handle',
      handle: 'GumrukDoktoru',
    });
    expect(parseYouTubeChannelInput('youtube.com/user/GumrukDoktoru')).toEqual({
      kind: 'handle',
      handle: 'GumrukDoktoru',
    });
  });

  it('treats a bare word as a handle', () => {
    expect(parseYouTubeChannelInput('gumrukdoktoru')).toEqual({
      kind: 'handle',
      handle: 'gumrukdoktoru',
    });
  });

  it('decodes a percent-encoded handle out of a URL', () => {
    // How a browser hands back https://www.youtube.com/@GumrukKoçunuz.
    expect(
      parseYouTubeChannelInput('https://www.youtube.com/@GumrukKo%C3%A7unuz'),
    ).toEqual({ kind: 'handle', handle: 'GumrukKoçunuz' });
  });

  it('accepts Turkish letters in a handle, typed or in a URL', () => {
    expect(parseYouTubeChannelInput('@GumrukKoçunuz')).toEqual({
      kind: 'handle',
      handle: 'GumrukKoçunuz',
    });
    expect(parseYouTubeChannelInput('GumrukKoçunuz')).toEqual({
      kind: 'handle',
      handle: 'GumrukKoçunuz',
    });
    expect(
      parseYouTubeChannelInput('https://www.youtube.com/@GumrukKoçunuz'),
    ).toEqual({ kind: 'handle', handle: 'GumrukKoçunuz' });
  });

  it('decodes a legacy /c/ path', () => {
    expect(
      parseYouTubeChannelInput('youtube.com/c/G%C3%BCmr%C3%BCkKocu'),
    ).toEqual({ kind: 'handle', handle: 'GümrükKocu' });
  });

  it('accepts a dotted handle when it is written with the @', () => {
    expect(parseYouTubeChannelInput('@gumruk.kocu')).toEqual({
      kind: 'handle',
      handle: 'gumruk.kocu',
    });
  });

  it('rejects blanks and foreign hosts', () => {
    expect(parseYouTubeChannelInput('   ')).toBeNull();
    expect(parseYouTubeChannelInput('https://vimeo.com/channel/x')).toBeNull();
  });

  it('does not accept a malformed channel id as an id', () => {
    expect(isYouTubeChannelId('UCtooshort')).toBe(false);
    expect(parseYouTubeChannelInput('youtube.com/channel/UCtooshort')).toBeNull();
  });
});

describe('parseYouTubeVideoId', () => {
  it('reads the id from every URL shape', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
    expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
    expect(
      parseYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
    expect(
      parseYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0'),
    ).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for anything else', () => {
    expect(parseYouTubeVideoId('https://vimeo.com/12345')).toBeNull();
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=kisa')).toBeNull();
  });
});

describe('parseInstagramShortcode', () => {
  it('reads posts, reels and IGTV', () => {
    expect(
      parseInstagramShortcode('https://www.instagram.com/p/CzQ1x8Zx1Zx/'),
    ).toBe('CzQ1x8Zx1Zx');
    expect(
      parseInstagramShortcode('https://instagram.com/reel/CzQ1x8Zx1Zx/?igsh=x'),
    ).toBe('CzQ1x8Zx1Zx');
    expect(parseInstagramShortcode('instagram.com/tv/CzQ1x8Zx1Zx')).toBe(
      'CzQ1x8Zx1Zx',
    );
  });

  it('reads a post nested under a profile path', () => {
    expect(
      parseInstagramShortcode(
        'https://www.instagram.com/gumrukdoktoru/p/CzQ1x8Zx1Zx/',
      ),
    ).toBe('CzQ1x8Zx1Zx');
  });

  it('rejects a profile URL and foreign hosts', () => {
    expect(
      parseInstagramShortcode('https://www.instagram.com/gumrukdoktoru/'),
    ).toBeNull();
    expect(parseInstagramShortcode('https://example.com/p/abc/')).toBeNull();
  });
});

describe('URL builders', () => {
  it('builds the YouTube URLs', () => {
    expect(buildYouTubeFeedUrl(CHANNEL_ID)).toBe(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
    );
    expect(buildYouTubeWatchUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(buildYouTubeThumbnailUrl('dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
  });

  it('uses the no-cookie host for embeds', () => {
    expect(buildYouTubeEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0',
    );
  });

  it('builds the Instagram embed frame', () => {
    expect(buildInstagramEmbedUrl('CzQ1x8Zx1Zx')).toBe(
      'https://www.instagram.com/p/CzQ1x8Zx1Zx/embed/captioned',
    );
  });
});
