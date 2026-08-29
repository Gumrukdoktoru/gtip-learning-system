import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { splitCaption } from '../src/services/media-service.js';
import { createTestContext, type TestContext } from './helpers/test-app.js';
import {
  CDN_IMAGE,
  createFakeInstagramFetch,
  type FakeInstagramOptions,
} from './helpers/instagram-fixture.js';

const BASE = '/api/v1/media';

async function withInstagram(
  fixture: FakeInstagramOptions = {},
  env: Record<string, string> = {},
): Promise<{
  ctx: TestContext;
  fake: ReturnType<typeof createFakeInstagramFetch>;
}> {
  const fake = createFakeInstagramFetch(fixture);
  const ctx = await createTestContext({
    env: { INSTAGRAM_ACCESS_TOKEN: 'uzun-omurlu-token', ...env },
    instagramFetch: fake.fetchImpl,
  });

  return { ctx, fake };
}

function syncAs(ctx: TestContext, token: string): request.Test {
  return request(ctx.app)
    .post(`${BASE}/instagram/sync`)
    .set('Authorization', `Bearer ${token}`);
}

describe('splitCaption', () => {
  it('takes the first line of a multi-line caption', () => {
    expect(
      splitCaption('Gözetim belgesi nedir?\nDetaylar videoda.'),
    ).toEqual({
      title: 'Gözetim belgesi nedir?',
      description: 'Detaylar videoda.',
    });
  });

  it('takes the first sentence of a single-line caption', () => {
    expect(
      splitCaption('Kota nedir? Tarife kontenjanından farkı var.'),
    ).toEqual({
      title: 'Kota nedir?',
      description: 'Tarife kontenjanından farkı var.',
    });
  });

  it('leaves no description when the caption is just the title', () => {
    // Otherwise the same sentence renders twice on one card.
    expect(splitCaption('Antrepoda süre takibi nasıl yapılır?')).toEqual({
      title: 'Antrepoda süre takibi nasıl yapılır?',
      description: '',
    });
  });

  it('keeps the whole caption when the title had to be cut', () => {
    const { title, description } = splitCaption('kelime '.repeat(40).trim());

    expect(title.length).toBeLessThanOrEqual(121);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toContain('kelim…');
    expect(description.length).toBeGreaterThan(title.length);
  });

  it('falls back when the caption is empty', () => {
    expect(splitCaption('   \n  ')).toEqual({
      title: 'Instagram gönderisi',
      description: '',
    });
  });
});

describe('Instagram sync', () => {
  it('imports posts and reports what it did', async () => {
    const { ctx } = await withInstagram();

    const response = await syncAs(ctx, ctx.adminToken);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      fetched: 2,
      created: 2,
      updated: 0,
      skippedCurated: 0,
      coversStored: 2,
    });
  });

  it('keys posts on the shortcode from the permalink', async () => {
    const { ctx } = await withInstagram();

    await syncAs(ctx, ctx.adminToken);

    const list = await request(ctx.app).get(`${BASE}?source=instagram`);
    const [newest, oldest] = list.body.data.items;

    expect(newest).toMatchObject({
      source: 'instagram',
      externalId: 'DAcvhWXNqDF',
      url: 'https://www.instagram.com/p/DAcvhWXNqDF/',
      title: 'Antrepoda süre takibi nasıl yapılır?',
    });
    expect(newest.publishedAt).toBe('2026-06-01T10:00:00.000Z');
    expect(oldest.title).toBe('Beyanname tescilinde en sık yapılan 3 hata');
    expect(oldest.description).toBe('Detayları videoda anlattım.');
  });

  it('copies the CDN image into our own storage', async () => {
    const { ctx } = await withInstagram();

    await syncAs(ctx, ctx.adminToken);

    // Instagram's CDN URLs are signed and expire, so the card must not point
    // at them.
    expect(ctx.storage.keys()).toEqual([
      expect.stringMatching(/^69655\/public\/uploads\/\d+-CzQ1x8Zx1Zx\.png$/),
      expect.stringMatching(/^69655\/public\/uploads\/\d+-DAcvhWXNqDF\.png$/),
    ]);

    const list = await request(ctx.app).get(`${BASE}?source=instagram`);
    const item = list.body.data.items[0];

    expect(item.thumbnailUrl).toBe(
      `http://localhost:3000/api/v1/media/${item.id}/cover`,
    );

    const cover = await request(ctx.app).get(`${BASE}/${item.id}/cover`);

    expect(cover.body).toEqual(CDN_IMAGE);
  });

  it('uses the thumbnail for a video and the first child for an album', async () => {
    const { ctx, fake } = await withInstagram({
      posts: [
        { id: '1', shortcode: 'AAAAAAAAAAA', mediaType: 'VIDEO' },
        { id: '2', shortcode: 'BBBBBBBBBBB', mediaType: 'CAROUSEL_ALBUM' },
      ],
    });

    await syncAs(ctx, ctx.adminToken);

    const imageCalls = fake.calls.filter((url) => url.includes('cdninstagram'));

    // The video's .mp4 is never downloaded; its poster frame is.
    expect(imageCalls.some((url) => url.endsWith('.mp4'))).toBe(false);
    expect(imageCalls).toHaveLength(2);
    expect(ctx.storage.keys()).toHaveLength(2);
  });

  it('re-syncs in place instead of duplicating', async () => {
    const { ctx } = await withInstagram();

    await syncAs(ctx, ctx.adminToken);
    const second = await syncAs(ctx, ctx.adminToken);

    expect(second.body.data).toMatchObject({ created: 0, updated: 2 });

    const list = await request(ctx.app).get(`${BASE}?source=instagram`);

    expect(list.body.data.pagination.total).toBe(2);
  });

  it('does not re-download a cover that is already stored', async () => {
    const { ctx, fake } = await withInstagram();

    await syncAs(ctx, ctx.adminToken);
    const afterFirst = fake.calls.filter((url) =>
      url.includes('cdninstagram'),
    ).length;

    await syncAs(ctx, ctx.adminToken);

    expect(
      fake.calls.filter((url) => url.includes('cdninstagram')),
    ).toHaveLength(afterFirst);
    expect(ctx.storage.keys()).toHaveLength(2);
  });

  it('adopts a hand-added post rather than duplicating it', async () => {
    const { ctx } = await withInstagram();

    const manual = await request(ctx.app)
      .post(`${BASE}/instagram`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        url: 'https://www.instagram.com/reel/CzQ1x8Zx1Zx/?igsh=abc',
        title: 'Elle yazılmış başlık',
        description: 'Elle yazılmış açıklama.',
      });

    const sync = await syncAs(ctx, ctx.adminToken);

    expect(sync.body.data).toMatchObject({
      created: 1,
      updated: 1,
      skippedCurated: 1,
    });

    const list = await request(ctx.app).get(`${BASE}?source=instagram`);

    expect(list.body.data.pagination.total).toBe(2);

    const adopted = list.body.data.items.find(
      (item: { id: string }) => item.id === manual.body.data.id,
    );

    // Curated copy survives the sync; the missing cover is filled in.
    expect(adopted.title).toBe('Elle yazılmış başlık');
    expect(adopted.description).toBe('Elle yazılmış açıklama.');
    expect(adopted.thumbnailUrl).toContain(`/media/${adopted.id}/cover`);
  });

  it('stops overwriting copy once an admin edits it', async () => {
    const { ctx } = await withInstagram();

    await syncAs(ctx, ctx.adminToken);

    const list = await request(ctx.app).get(`${BASE}?source=instagram`);
    const target = list.body.data.items[0];

    await request(ctx.app)
      .patch(`${BASE}/${target.id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ title: 'Koçun yazdığı başlık' });

    const second = await syncAs(ctx, ctx.adminToken);

    expect(second.body.data.skippedCurated).toBe(1);

    const after = await request(ctx.app).get(`${BASE}?source=instagram`);
    const unchanged = after.body.data.items.find(
      (item: { id: string }) => item.id === target.id,
    );

    expect(unchanged.title).toBe('Koçun yazdığı başlık');
  });

  it('treats pinning as curation-neutral', async () => {
    const { ctx } = await withInstagram();

    await syncAs(ctx, ctx.adminToken);

    const list = await request(ctx.app).get(`${BASE}?source=instagram`);
    const target = list.body.data.items[0];

    await request(ctx.app)
      .patch(`${BASE}/${target.id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ isPinned: true });

    const second = await syncAs(ctx, ctx.adminToken);

    expect(second.body.data.skippedCurated).toBe(0);

    const after = await request(ctx.app).get(`${BASE}?source=instagram`);

    expect(after.body.data.items[0].isPinned).toBe(true);
  });

  it('keeps the post when its image cannot be downloaded', async () => {
    const { ctx } = await withInstagram({ imageStatus: 404 });

    const response = await syncAs(ctx, ctx.adminToken);

    expect(response.body.data).toMatchObject({ created: 2, coversStored: 0 });
    expect(ctx.storage.keys()).toHaveLength(0);

    const list = await request(ctx.app).get(`${BASE}?source=instagram`);

    expect(list.body.data.items[0].thumbnailUrl).toBeUndefined();
  });

  it('handles a post Instagram gives no image for', async () => {
    const { ctx } = await withInstagram({
      posts: [{ id: '1', shortcode: 'AAAAAAAAAAA', withImage: false }],
    });

    const response = await syncAs(ctx, ctx.adminToken);

    expect(response.body.data).toMatchObject({ created: 1, coversStored: 0 });
  });

  it('reports an expired token as a 400 on an explicit sync', async () => {
    const { ctx } = await withInstagram({
      errorMessage: 'Error validating access token: Session has expired.',
      status: 400,
    });

    const response = await syncAs(ctx, ctx.adminToken);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Session has expired');
  });

  it('still serves the list when Instagram is down', async () => {
    const { ctx } = await withInstagram({
      errorMessage: 'Application request limit reached',
      status: 429,
    });

    const response = await request(ctx.app).get(BASE);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([]);
  });

  it('syncs lazily on a public read, then serves from cache', async () => {
    const { ctx, fake } = await withInstagram();

    const first = await request(ctx.app).get(BASE);

    expect(first.body.data.items).toHaveLength(2);

    const graphCalls = fake.calls.filter((url) => url.includes('/media?'));

    await request(ctx.app).get(BASE);

    expect(fake.calls.filter((url) => url.includes('/media?'))).toHaveLength(
      graphCalls.length,
    );
  });

  it('refuses to sync when no token is configured', async () => {
    const ctx = await createTestContext();

    const response = await syncAs(ctx, ctx.adminToken);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('INSTAGRAM_ACCESS_TOKEN');
  });

  it('refuses sync for non-admins', async () => {
    const { ctx } = await withInstagram();

    const response = await syncAs(ctx, ctx.studentToken);

    expect(response.status).toBe(403);
  });

  it('reports the connection on /site', async () => {
    const { ctx } = await withInstagram();

    const response = await request(ctx.app).get('/api/v1/site');

    expect(response.body.data.instagramConnected).toBe(true);
    expect((await createTestContext()).config.INSTAGRAM_ACCESS_TOKEN).toBe('');
  });
});

describe('Instagram token refresh', () => {
  it('exchanges the token on first sync and stores the new one', async () => {
    const { ctx, fake } = await withInstagram();

    await syncAs(ctx, ctx.adminToken);

    expect(fake.calls[0]).toContain('refresh_access_token');
    expect(fake.calls[0]).toContain('grant_type=ig_refresh_token');

    const stored = await ctx.container.tokens.read('instagram');

    expect(stored?.accessToken).toBe('yenilenmis-token');
    // The media call rides on the refreshed token, not the configured one.
    expect(
      fake.calls.find((url) => url.includes('/media?')),
    ).toContain('access_token=yenilenmis-token');
  });

  it('does not refresh again while the stored token is young', async () => {
    const { ctx, fake } = await withInstagram();

    await syncAs(ctx, ctx.adminToken);
    const refreshes = fake.calls.filter((url) =>
      url.includes('refresh_access_token'),
    ).length;

    await syncAs(ctx, ctx.adminToken);

    expect(
      fake.calls.filter((url) => url.includes('refresh_access_token')),
    ).toHaveLength(refreshes);
  });

  it('syncs anyway when the refresh call fails', async () => {
    const fake = createFakeInstagramFetch();
    let refreshCalls = 0;
    const flaky: typeof fetch = async (input, init) => {
      if (String(input).includes('refresh_access_token')) {
        refreshCalls += 1;

        return new Response(JSON.stringify({ error: { message: 'nope' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return fake.fetchImpl(input, init);
    };

    const ctx = await createTestContext({
      env: { INSTAGRAM_ACCESS_TOKEN: 'uzun-omurlu-token' },
      instagramFetch: flaky,
    });

    const response = await syncAs(ctx, ctx.adminToken);

    expect(refreshCalls).toBe(1);
    expect(response.status).toBe(200);
    expect(response.body.data.created).toBe(2);
  });

  it('never calls refresh for a Facebook-Login token', async () => {
    const { ctx, fake } = await withInstagram(
      {},
      { INSTAGRAM_GRAPH_HOST: 'graph.facebook.com', INSTAGRAM_USER_ID: '17841400000000000' },
    );

    await syncAs(ctx, ctx.adminToken);

    expect(
      fake.calls.some((url) => url.includes('refresh_access_token')),
    ).toBe(false);
    expect(fake.calls[0]).toContain('graph.facebook.com');
    expect(fake.calls[0]).toContain('17841400000000000/media');
  });
});
