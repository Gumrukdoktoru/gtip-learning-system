import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createTestContext,
  type TestContext,
} from './helpers/test-app.js';
import {
  buildAtomFeed,
  createFakeYouTubeFetch,
} from './helpers/youtube-fixture.js';

const BASE = '/api/v1/media';
const POST_URL = 'https://www.instagram.com/p/CzQ1x8Zx1Zx/';

async function withYouTube(
  env: Record<string, string> = {},
  fake = createFakeYouTubeFetch(),
): Promise<{ ctx: TestContext; fake: ReturnType<typeof createFakeYouTubeFetch> }> {
  const ctx = await createTestContext({
    env: { YOUTUBE_CHANNEL: '@gumrukdoktoru', ...env },
    youtubeFetch: fake.fetchImpl,
  });

  return { ctx, fake };
}

describe('YouTube sync', () => {
  it('resolves a handle and stores the channel videos', async () => {
    const { ctx, fake } = await withYouTube();

    const response = await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      channelId: 'UCgumrukdoktoru000000000',
      channelTitle: 'Gümrük Doktoru',
      fetched: 2,
      created: 2,
      updated: 0,
    });

    // One page fetch to resolve the handle, one feed fetch.
    expect(fake.calls[0]).toContain('/@gumrukdoktoru');
    expect(fake.calls[1]).toContain(
      'channel_id=UCgumrukdoktoru000000000',
    );
  });

  it('maps feed entries onto media items', async () => {
    const { ctx } = await withYouTube();

    await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    const response = await request(ctx.app).get(`${BASE}?source=youtube`);
    const [newest] = response.body.data.items;

    expect(response.body.data.items).toHaveLength(2);
    // Newest first.
    expect(newest).toMatchObject({
      source: 'youtube',
      externalId: 'bbbbbbbbbbb',
      title: 'Gözetim Belgesi Nasıl Alınır?',
      url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
      thumbnailUrl: 'https://i.ytimg.com/vi/bbbbbbbbbbb/hqdefault.jpg',
      isPinned: false,
    });
    expect(newest.publishedAt).toBe('2024-08-25T09:00:00.000Z');
  });

  it('updates existing videos instead of duplicating them', async () => {
    const { ctx } = await withYouTube();

    await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);
    const second = await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(second.body.data).toMatchObject({ created: 0, updated: 2 });

    const list = await request(ctx.app).get(`${BASE}?source=youtube`);

    expect(list.body.data.pagination.total).toBe(2);
  });

  it('keeps the admin pin when a video is re-synced', async () => {
    const { ctx } = await withYouTube();

    await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    const list = await request(ctx.app).get(`${BASE}?source=youtube`);
    const oldest = list.body.data.items[1];

    await request(ctx.app)
      .patch(`${BASE}/${oldest.id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ isPinned: true });

    await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    const after = await request(ctx.app).get(`${BASE}?source=youtube`);

    expect(after.body.data.items[0].id).toBe(oldest.id);
    expect(after.body.data.items[0].isPinned).toBe(true);
  });

  it('encodes a Turkish handle exactly once when resolving it', async () => {
    const { ctx, fake } = await withYouTube({
      YOUTUBE_CHANNEL: 'https://www.youtube.com/@GumrukKo%C3%A7unuz',
    });

    const response = await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(response.status).toBe(200);
    // Not GumrukKo%25C3%25A7unuz, which is what a double encode would send.
    expect(fake.calls[0]).toBe('https://www.youtube.com/@GumrukKo%C3%A7unuz');
  });

  it('exposes a Turkish handle as an encoded channel link', async () => {
    const ctx = await createTestContext({
      env: { YOUTUBE_CHANNEL: '@GumrukKoçunuz' },
    });

    const response = await request(ctx.app).get('/api/v1/site');

    expect(response.body.data.youtubeChannelUrl).toBe(
      'https://www.youtube.com/@GumrukKo%C3%A7unuz',
    );
  });

  it('accepts a bare channel id without a page lookup', async () => {
    const { ctx, fake } = await withYouTube({
      YOUTUBE_CHANNEL: 'UCgumrukdoktoru000000000',
    });

    await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toContain('/feeds/videos.xml');
  });

  it('refuses to sync when no channel is configured', async () => {
    const ctx = await createTestContext();

    const response = await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('YOUTUBE_CHANNEL');
  });

  it('refuses sync for non-admins', async () => {
    const { ctx } = await withYouTube();

    const response = await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.studentToken}`);

    expect(response.status).toBe(403);
  });

  it('reports a YouTube outage as a 400 on an explicit sync', async () => {
    const { ctx } = await withYouTube(
      {},
      createFakeYouTubeFetch({ feedStatus: 503 }),
    );

    const response = await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(response.status).toBe(400);
  });

  it('still serves the list when YouTube is down', async () => {
    const { ctx } = await withYouTube(
      {},
      createFakeYouTubeFetch({ feedStatus: 503 }),
    );

    const response = await request(ctx.app).get(BASE);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([]);
  });

  it('syncs lazily on a public read, then serves from cache', async () => {
    const { ctx, fake } = await withYouTube();

    const first = await request(ctx.app).get(BASE);

    expect(first.body.data.items).toHaveLength(2);

    const callsAfterFirst = fake.calls.length;

    await request(ctx.app).get(BASE);

    expect(fake.calls).toHaveLength(callsAfterFirst);
  });

  it('re-syncs once the interval has passed', async () => {
    const { ctx, fake } = await withYouTube({
      YOUTUBE_SYNC_INTERVAL_MINUTES: '1',
      YOUTUBE_CHANNEL: 'UCgumrukdoktoru000000000',
    });

    await request(ctx.app).get(BASE);
    expect(fake.calls).toHaveLength(1);

    // Reach past the cache without waiting a real minute.
    (
      ctx.container.mediaService as unknown as { lastSyncedAt: number }
    ).lastSyncedAt = Date.now() - 120_000;

    await request(ctx.app).get(BASE);
    expect(fake.calls).toHaveLength(2);
  });

  it('handles a feed with a single entry', async () => {
    const { ctx } = await withYouTube(
      {},
      createFakeYouTubeFetch({
        feedXml: buildAtomFeed([
          {
            videoId: 'ccccccccccc',
            title: 'Tek video',
            description: 'Tek girişli akış.',
            published: '2024-01-01T00:00:00+00:00',
          },
        ]),
      }),
    );

    const response = await request(ctx.app).get(BASE);

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].title).toBe('Tek video');
  });

  it('handles an empty channel', async () => {
    const { ctx } = await withYouTube(
      {},
      createFakeYouTubeFetch({ feedXml: buildAtomFeed([]) }),
    );

    const response = await request(ctx.app).get(BASE);

    expect(response.body.data.items).toEqual([]);
  });
});

describe('Instagram items', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  async function addPost(
    url = POST_URL,
    title = 'Beyanname tescil ipucu',
  ): Promise<request.Response> {
    return request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        url,
        title,
        description: '30 saniyede özet.',
      });
  }

  it('stores the shortcode and canonical URL', async () => {
    const response = await addPost();

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      source: 'instagram',
      externalId: 'CzQ1x8Zx1Zx',
      url: 'https://www.instagram.com/p/CzQ1x8Zx1Zx/',
      title: 'Beyanname tescil ipucu',
    });
  });

  it('accepts a reel URL with tracking parameters', async () => {
    const response = await addPost(
      'https://www.instagram.com/reel/CzQ1x8Zx1Zx/?igsh=abc123',
    );

    expect(response.status).toBe(201);
    expect(response.body.data.externalId).toBe('CzQ1x8Zx1Zx');
  });

  it('rejects a profile URL', async () => {
    const response = await addPost('https://www.instagram.com/gumrukdoktoru/');

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Instagram gönderi adresi');
  });

  it('refuses the same post twice', async () => {
    await addPost();

    const duplicate = await addPost();

    expect(duplicate.status).toBe(409);
  });

  it('refuses non-admin callers', async () => {
    const response = await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.studentToken}`)
      .send({ url: POST_URL, title: 'Öğrenci gönderisi', description: '' });

    expect(response.status).toBe(403);
  });

  it('updates and deletes', async () => {
    const created = await addPost();
    const id = created.body.data.id;

    const updated = await request(ctx.app)
      .patch(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ title: 'Güncellenmiş başlık', isPinned: true });

    expect(updated.body.data).toMatchObject({
      title: 'Güncellenmiş başlık',
      isPinned: true,
    });

    const removed = await request(ctx.app)
      .delete(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(removed.status).toBe(200);
    expect((await request(ctx.app).get(BASE)).body.data.items).toEqual([]);
  });
});

describe('Instagram cover images', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  /** A one-pixel PNG; enough to exercise the real content-type path. */
  function samplePng(): Buffer {
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
  }

  it('stores a cover under the public prefix and links to it', async () => {
    const response = await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .field('url', POST_URL)
      .field('title', 'Beyanname tescil ipucu')
      .field('description', '30 saniyede özet.')
      .attach('cover', samplePng(), {
        filename: 'kapak.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.thumbnailUrl).toBe(
      `http://localhost:3000/api/v1/media/${response.body.data.id}/cover`,
    );
    // The object key follows the documented public layout.
    expect(ctx.storage.keys()).toEqual([
      expect.stringMatching(/^69655\/public\/uploads\/\d+-kapak\.png$/),
    ]);
    // The bucket key itself never reaches the reader.
    expect(response.body.data).not.toHaveProperty('coverStorageKey');
  });

  it('serves the cover with its own content type', async () => {
    const created = await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .field('url', POST_URL)
      .field('title', 'Kapaklı gönderi')
      .field('description', '')
      .attach('cover', samplePng(), {
        filename: 'kapak.png',
        contentType: 'image/png',
      });

    const cover = await request(ctx.app).get(
      `${BASE}/${created.body.data.id}/cover`,
    );

    expect(cover.status).toBe(200);
    expect(cover.headers['content-type']).toContain('image/png');
    expect(cover.body).toEqual(samplePng());
  });

  it('works without a cover and reports none', async () => {
    const response = await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ url: POST_URL, title: 'Kapaksız gönderi', description: '' });

    expect(response.status).toBe(201);
    expect(response.body.data.thumbnailUrl).toBeUndefined();

    const cover = await request(ctx.app).get(
      `${BASE}/${response.body.data.id}/cover`,
    );

    expect(cover.status).toBe(404);
  });

  it('rejects a non-image cover', async () => {
    const response = await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .field('url', POST_URL)
      .field('title', 'Kötü kapak')
      .field('description', '')
      .attach('cover', Buffer.from('%PDF-1.4'), {
        filename: 'belge.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('JPG, PNG veya WEBP');
    expect(ctx.storage.keys()).toHaveLength(0);
  });

  it('leaves no orphan when the post is a duplicate', async () => {
    const first = await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ url: POST_URL, title: 'İlk kayıt', description: '' });

    expect(first.status).toBe(201);

    const duplicate = await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .field('url', POST_URL)
      .field('title', 'Aynı gönderi')
      .field('description', '')
      .attach('cover', samplePng(), {
        filename: 'kapak.png',
        contentType: 'image/png',
      });

    expect(duplicate.status).toBe(409);
    // Rejected before the cover was written.
    expect(ctx.storage.keys()).toHaveLength(0);
  });

  it('replaces a cover and removes the old object', async () => {
    const created = await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .field('url', POST_URL)
      .field('title', 'Kapaklı gönderi')
      .field('description', '')
      .attach('cover', samplePng(), {
        filename: 'eski.png',
        contentType: 'image/png',
      });

    const replaced = await request(ctx.app)
      .post(`${BASE}/${created.body.data.id}/cover`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .attach('cover', samplePng(), {
        filename: 'yeni.png',
        contentType: 'image/png',
      });

    expect(replaced.status).toBe(200);
    expect(ctx.storage.keys()).toHaveLength(1);
    expect(ctx.storage.keys()[0]).toContain('yeni.png');
  });

  it('deletes the cover object with the item', async () => {
    const created = await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .field('url', POST_URL)
      .field('title', 'Silinecek gönderi')
      .field('description', '')
      .attach('cover', samplePng(), {
        filename: 'kapak.png',
        contentType: 'image/png',
      });

    await request(ctx.app)
      .delete(`${BASE}/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(ctx.storage.keys()).toHaveLength(0);
  });

  it('refuses a cover upload from a non-admin', async () => {
    const created = await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ url: POST_URL, title: 'Kapaksız gönderi', description: '' });

    const response = await request(ctx.app)
      .post(`${BASE}/${created.body.data.id}/cover`)
      .set('Authorization', `Bearer ${ctx.studentToken}`)
      .attach('cover', samplePng(), {
        filename: 'kapak.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(403);
  });
});

describe('media listing', () => {
  it('filters by source and searches Turkish text case-insensitively', async () => {
    const { ctx } = await withYouTube();

    await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        url: POST_URL,
        title: 'Kısa ipucu',
        description: 'Gönderi açıklaması.',
      });
    await request(ctx.app)
      .post(`${BASE}/youtube/sync`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    const all = await request(ctx.app).get(BASE);

    expect(all.body.data.pagination.total).toBe(3);

    const instagramOnly = await request(ctx.app).get(`${BASE}?source=instagram`);

    expect(instagramOnly.body.data.items).toHaveLength(1);

    const search = await request(ctx.app).get(`${BASE}?search=KISA`);

    expect(search.body.data.items).toHaveLength(1);
    expect(search.body.data.items[0].title).toBe('Kısa ipucu');
  });

  it('rejects an unknown source', async () => {
    const ctx = await createTestContext();
    const response = await request(ctx.app).get(`${BASE}?source=tiktok`);

    expect(response.status).toBe(422);
  });
});

describe('GET /api/v1/site', () => {
  it('exposes the channel and profile links', async () => {
    const ctx = await createTestContext({
      env: {
        SITE_TITLE: 'Gümrük Doktoru Akademi',
        YOUTUBE_CHANNEL: '@gumrukdoktoru',
        INSTAGRAM_PROFILE_URL: 'https://www.instagram.com/gumrukdoktoru/',
      },
    });

    const response = await request(ctx.app).get('/api/v1/site');

    expect(response.body.data).toMatchObject({
      title: 'Gümrük Doktoru Akademi',
      youtubeChannelUrl: 'https://www.youtube.com/@gumrukdoktoru',
      instagramProfileUrl: 'https://www.instagram.com/gumrukdoktoru/',
      youtubeConnected: true,
    });
  });

  it('reports an unconfigured channel', async () => {
    const ctx = await createTestContext();
    const response = await request(ctx.app).get('/api/v1/site');

    expect(response.body.data.youtubeConnected).toBe(false);
    expect(response.body.data.youtubeChannelUrl).toBeUndefined();
  });
});
