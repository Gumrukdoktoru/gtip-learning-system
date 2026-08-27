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
