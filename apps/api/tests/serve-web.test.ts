import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestContext, type TestContext } from './helpers/test-app.js';

const INDEX_HTML = '<!doctype html><html lang="tr"><body>hub</body></html>';

describe('serving the built frontend', () => {
  let distPath: string;
  let ctx: TestContext;

  beforeEach(async () => {
    distPath = await fs.mkdtemp(path.join(os.tmpdir(), 'gtip-dist-'));
    await fs.mkdir(path.join(distPath, 'assets'), { recursive: true });
    await fs.writeFile(path.join(distPath, 'index.html'), INDEX_HTML);
    await fs.writeFile(
      path.join(distPath, 'assets', 'index-abc123.js'),
      'console.log(1);',
    );
    await fs.writeFile(path.join(distPath, 'favicon.svg'), '<svg/>');

    ctx = await createTestContext({
      env: { SERVE_WEB: 'true', WEB_DIST_PATH: distPath },
    });
  });

  afterEach(async () => {
    await fs.rm(distPath, { recursive: true, force: true });
  });

  it('serves the app shell at the root', async () => {
    const response = await request(ctx.app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('hub');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('serves a deep link so a refresh on an admin page works', async () => {
    const response = await request(ctx.app).get('/yonetim/sorular');

    expect(response.status).toBe(200);
    expect(response.text).toContain('hub');
  });

  it('caches hashed assets hard and the shell not at all', async () => {
    const asset = await request(ctx.app).get('/assets/index-abc123.js');

    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );

    const shell = await request(ctx.app).get('/index.html');

    expect(shell.headers['cache-control']).toBe('no-cache');
  });

  it('serves other static files as they are', async () => {
    const response = await request(ctx.app).get('/favicon.svg');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
  });

  it('never hides an API route behind the app shell', async () => {
    const known = await request(ctx.app).get('/api/v1/health');

    expect(known.status).toBe(200);
    expect(known.body.success).toBe(true);

    // An unknown API path must still be a JSON 404, not the HTML shell.
    const unknown = await request(ctx.app).get('/api/v1/olmayan');

    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND' },
    });
  });

  it('leaves non-GET requests to the API', async () => {
    const response = await request(ctx.app).post('/yonetim').send({});

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it('stays a JSON API when serving is off', async () => {
    const apiOnly = await createTestContext();
    const response = await request(apiOnly.app).get('/yonetim');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false });
  });

  it('starts without a build instead of crashing', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'gtip-empty-'));

    try {
      const withoutBuild = await createTestContext({
        env: { SERVE_WEB: 'true', WEB_DIST_PATH: empty },
      });
      const response = await request(withoutBuild.app).get('/api/v1/health');

      expect(response.status).toBe(200);
    } finally {
      await fs.rm(empty, { recursive: true, force: true });
    }
  });
});
