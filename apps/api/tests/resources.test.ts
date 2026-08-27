import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createTestContext,
  sampleHtml,
  samplePdf,
  type TestContext,
} from './helpers/test-app.js';

const BASE = '/api/v1/resources';

async function uploadResource(
  ctx: TestContext,
  overrides: {
    title?: string;
    category?: string;
    visibility?: 'public' | 'private';
    fileName?: string;
    body?: Buffer;
    contentType?: string;
  } = {},
): Promise<request.Response> {
  return request(ctx.app)
    .post(BASE)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .field('title', overrides.title ?? 'Gümrük Genel Tebliği')
    .field('description', 'İthalatta gözetim uygulamasına ilişkin tebliğ.')
    .field('category', overrides.category ?? 'teblig')
    .field('visibility', overrides.visibility ?? 'public')
    .attach(
      'file',
      overrides.body ?? samplePdf(),
      {
        filename: overrides.fileName ?? 'Gümrük Tebliği.pdf',
        contentType: overrides.contentType ?? 'application/pdf',
      },
    );
}

describe('resource upload', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  it('stores a public file under {prefix}public/uploads/', async () => {
    const response = await uploadResource(ctx);

    expect(response.status).toBe(201);

    const resource = response.body.data;

    expect(resource.visibility).toBe('public');
    expect(resource.storageKey).toMatch(
      /^69655\/public\/uploads\/\d+-Gumruk-Tebligi\.pdf$/,
    );
    expect(resource.storedFileName).toMatch(/^\d+-Gumruk-Tebligi\.pdf$/);
    expect(resource.originalFileName).toBe('Gümrük Tebliği.pdf');
    expect(ctx.storage.keys()).toEqual([resource.storageKey]);
  });

  it('stores a private file under {prefix}uploads/', async () => {
    const response = await uploadResource(ctx, { visibility: 'private' });

    expect(response.status).toBe(201);
    expect(response.body.data.storageKey).toMatch(
      /^69655\/uploads\/\d+-Gumruk-Tebligi\.pdf$/,
    );
  });

  it('honours a different AWS_FOLDER_PREFIX', async () => {
    const other = await createTestContext({
      env: { AWS_FOLDER_PREFIX: '12345' },
    });
    const response = await uploadResource(other);

    expect(response.body.data.storageKey).toMatch(
      /^12345\/public\/uploads\//,
    );
  });

  it('accepts HTML resources', async () => {
    const response = await uploadResource(ctx, {
      fileName: 'genelge.html',
      body: sampleHtml(),
      contentType: 'text/html',
      category: 'genelge',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.mimeType).toBe('text/html');
  });

  it('rejects unsupported file types', async () => {
    const response = await uploadResource(ctx, {
      fileName: 'zararli.exe',
      body: Buffer.from('MZ'),
      contentType: 'application/octet-stream',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('PDF ve HTML');
    expect(ctx.storage.keys()).toHaveLength(0);
  });

  it('keeps both uploads when two files share a name in one second', async () => {
    // Freeze only Date, so express and supertest keep their real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2024-08-27T18:30:00.000Z'));

    try {
      const first = await uploadResource(ctx, { title: 'Birinci belge' });
      const second = await uploadResource(ctx, { title: 'İkinci belge' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.data.storageKey).toBe(
        '69655/public/uploads/1724783400-Gumruk-Tebligi.pdf',
      );
      // Same second, same file name: the second key gets a random suffix.
      expect(second.body.data.storageKey).toMatch(
        /^69655\/public\/uploads\/1724783400-Gumruk-Tebligi-[0-9a-f]{6}\.pdf$/,
      );
      expect(ctx.storage.keys()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a request without a file', async () => {
    const response = await request(ctx.app)
      .post(BASE)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .field('title', 'Dosyasız kayıt')
      .field('category', 'mevzuat');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects an invalid category', async () => {
    const response = await uploadResource(ctx, { category: 'olmayan' });

    expect(response.status).toBe(422);
  });

  it('rejects uploads above the size limit', async () => {
    const small = await createTestContext({
      env: { MAX_UPLOAD_SIZE_BYTES: '512' },
    });
    const response = await uploadResource(small, {
      body: Buffer.concat([samplePdf(), Buffer.alloc(2048, 0x20)]),
    });

    expect(response.status).toBe(413);
  });

  it('refuses non-admin callers', async () => {
    const response = await request(ctx.app)
      .post(BASE)
      .set('Authorization', `Bearer ${ctx.studentToken}`)
      .field('title', 'Öğrenci yüklemesi')
      .field('category', 'mevzuat')
      .attach('file', samplePdf(), {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(403);
  });

  it('refuses anonymous callers', async () => {
    const response = await request(ctx.app)
      .post(BASE)
      .field('title', 'Anonim yükleme')
      .field('category', 'mevzuat')
      .attach('file', samplePdf(), {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(401);
  });
});

describe('resource listing', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    await uploadResource(ctx, { title: 'Kamuya açık tebliğ' });
    await uploadResource(ctx, {
      title: 'Gizli iç kılavuz',
      visibility: 'private',
      category: 'kilavuz',
    });
  });

  it('shows only public resources to anonymous visitors', async () => {
    const response = await request(ctx.app).get(BASE);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].title).toBe('Kamuya açık tebliğ');
    // Storage internals stay server side for anonymous callers.
    expect(response.body.data.items[0]).not.toHaveProperty('storageKey');
  });

  it('ignores a visibility filter coming from an anonymous caller', async () => {
    const response = await request(ctx.app).get(`${BASE}?visibility=private`);

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].title).toBe('Kamuya açık tebliğ');
  });

  it('shows every resource to an admin', async () => {
    const response = await request(ctx.app)
      .get(BASE)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.items[0]).toHaveProperty('storageKey');
  });

  it('filters by category', async () => {
    const response = await request(ctx.app)
      .get(`${BASE}?category=kilavuz`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].category).toBe('kilavuz');
  });

  it('searches titles case-insensitively', async () => {
    const response = await request(ctx.app)
      .get(`${BASE}?search=GIZLI`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(response.body.data.items).toHaveLength(1);
  });

  it('paginates', async () => {
    const response = await request(ctx.app)
      .get(`${BASE}?page=1&pageSize=1`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.pagination).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
  });

  it('rejects an out-of-range page size', async () => {
    const response = await request(ctx.app).get(`${BASE}?pageSize=5000`);

    expect(response.status).toBe(422);
  });
});

describe('resource download', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  it('streams a public file to anonymous visitors and counts it', async () => {
    const created = await uploadResource(ctx);
    const id = created.body.data.id;

    const response = await request(ctx.app).get(`${BASE}/${id}/download`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain(
      encodeURIComponent('Gümrük Tebliği.pdf'),
    );
    expect(response.body).toEqual(samplePdf());

    const after = await request(ctx.app).get(`${BASE}/${id}`);

    expect(after.body.data.downloadCount).toBe(1);
  });

  it('hides private files from anonymous visitors', async () => {
    const created = await uploadResource(ctx, { visibility: 'private' });
    const id = created.body.data.id;

    const anonymous = await request(ctx.app).get(`${BASE}/${id}/download`);

    expect(anonymous.status).toBe(404);

    const admin = await request(ctx.app)
      .get(`${BASE}/${id}/download`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(admin.status).toBe(200);
  });

  it('returns a download ticket pointing at the API when unsigned', async () => {
    const created = await uploadResource(ctx);
    const id = created.body.data.id;

    const response = await request(ctx.app).get(`${BASE}/${id}/download-url`);

    expect(response.status).toBe(200);
    expect(response.body.data.url).toBe(
      `http://localhost:3000/api/v1/resources/${id}/download`,
    );
    expect(response.body.data.fileName).toBe('Gümrük Tebliği.pdf');
  });

  it('404s for an unknown id and 422s for a malformed one', async () => {
    const unknown = await request(ctx.app).get(
      `${BASE}/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed`,
    );

    expect(unknown.status).toBe(404);

    const malformed = await request(ctx.app).get(`${BASE}/not-a-uuid`);

    expect(malformed.status).toBe(422);
  });
});

describe('resource update and delete', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  it('updates metadata', async () => {
    const created = await uploadResource(ctx);

    const response = await request(ctx.app)
      .patch(`${BASE}/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ title: 'Güncellenmiş başlık' });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('Güncellenmiş başlık');
    expect(response.body.data.storageKey).toBe(created.body.data.storageKey);
  });

  it('relocates the object when visibility flips', async () => {
    const created = await uploadResource(ctx);
    const originalKey = created.body.data.storageKey;

    const response = await request(ctx.app)
      .patch(`${BASE}/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ visibility: 'private' });

    expect(response.status).toBe(200);
    expect(response.body.data.storageKey).toMatch(/^69655\/uploads\//);
    expect(ctx.storage.keys()).toEqual([response.body.data.storageKey]);
    expect(ctx.storage.keys()).not.toContain(originalKey);

    // The bytes survived the move.
    const download = await request(ctx.app)
      .get(`${BASE}/${created.body.data.id}/download`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(download.body).toEqual(samplePdf());
  });

  it('deletes the record and the stored object together', async () => {
    const created = await uploadResource(ctx);

    const response = await request(ctx.app)
      .delete(`${BASE}/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(response.status).toBe(200);
    expect(ctx.storage.keys()).toHaveLength(0);

    const after = await request(ctx.app).get(`${BASE}/${created.body.data.id}`);

    expect(after.status).toBe(404);
  });

  it('refuses deletion by a student', async () => {
    const created = await uploadResource(ctx);

    const response = await request(ctx.app)
      .delete(`${BASE}/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ctx.studentToken}`);

    expect(response.status).toBe(403);
    expect(ctx.storage.keys()).toHaveLength(1);
  });
});

describe('health endpoint', () => {
  it('reports the active storage driver', async () => {
    const ctx = await createTestContext();
    const response = await request(ctx.app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.data.storageDriver).toBe('memory');
  });

  it('returns the shared error envelope for unknown routes', async () => {
    const ctx = await createTestContext();
    const response = await request(ctx.app).get('/api/v1/olmayan');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND' },
    });
  });
});
