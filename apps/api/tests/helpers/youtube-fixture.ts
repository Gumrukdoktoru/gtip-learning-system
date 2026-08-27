/** Minimal but faithful copy of a channel's Atom feed. */
export function buildAtomFeed(
  videos: Array<{
    videoId: string;
    title: string;
    description: string;
    published: string;
  }>,
  channelTitle = 'Gümrük Doktoru',
): string {
  const entries = videos
    .map(
      (video) => `
  <entry>
    <id>yt:video:${video.videoId}</id>
    <yt:videoId>${video.videoId}</yt:videoId>
    <yt:channelId>UCgumrukdoktoru000000000</yt:channelId>
    <title>${video.title}</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=${video.videoId}"/>
    <published>${video.published}</published>
    <updated>${video.published}</updated>
    <media:group>
      <media:title>${video.title}</media:title>
      <media:thumbnail url="https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg" width="480" height="360"/>
      <media:description>${video.description}</media:description>
    </media:group>
  </entry>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <id>yt:channel:gumrukdoktoru000000000</id>
  <!-- YouTube really does drop the leading "UC" here. -->
  <yt:channelId>gumrukdoktoru000000000</yt:channelId>
  <title>${channelTitle}</title>${entries}
</feed>`;
}

export interface FakeYouTubeOptions {
  feedXml?: string;
  /** HTML returned for a channel page when a handle has to be resolved. */
  channelPageHtml?: string;
  feedStatus?: number;
}

export interface FakeYouTube {
  fetchImpl: typeof fetch;
  calls: string[];
}

/**
 * Stands in for global fetch: serves the channel page for handle resolution
 * and the Atom feed, and records every URL it was asked for.
 */
export function createFakeYouTubeFetch({
  feedXml = buildAtomFeed([
    {
      videoId: 'aaaaaaaaaaa',
      title: 'GTİP Sınıflandırma Dersi 1',
      description: 'Armonize Sistem mantığı ve genel yorum kuralları.',
      published: '2024-08-20T09:00:00+00:00',
    },
    {
      videoId: 'bbbbbbbbbbb',
      title: 'Gözetim Belgesi Nasıl Alınır?',
      description: 'İthalatta gözetim uygulaması adım adım.',
      published: '2024-08-25T09:00:00+00:00',
    },
  ]),
  channelPageHtml = '<link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCgumrukdoktoru000000000">',
  feedStatus = 200,
}: FakeYouTubeOptions = {}): FakeYouTube {
  const calls: string[] = [];

  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);

    calls.push(url);

    if (url.includes('/feeds/videos.xml')) {
      return new Response(feedXml, {
        status: feedStatus,
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    return new Response(channelPageHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  };

  return { fetchImpl, calls };
}
