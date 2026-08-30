import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createTestContext } from './helpers/test-app.js';

async function policyOf(env: Record<string, string> = {}): Promise<string> {
  const ctx = await createTestContext({ env });
  const response = await request(ctx.app).get('/api/v1/health');

  return response.headers['content-security-policy'] ?? '';
}

describe('content security policy', () => {
  it('allows the YouTube thumbnails the video shelf loads', async () => {
    // helmet's default img-src is `'self' data:`, which blanks every card.
    expect(await policyOf()).toContain('https://*.ytimg.com');
  });

  it('allows the players and post embeds to open in frames', async () => {
    const policy = await policyOf();

    expect(policy).toContain('https://www.youtube-nocookie.com');
    expect(policy).toContain('https://www.instagram.com');
    expect(policy).not.toContain("frame-src 'none'");
  });

  it('allows Instagram CDN images copied into a card', async () => {
    expect(await policyOf()).toContain('https://*.cdninstagram.com');
  });

  it('allows the bucket when public files are served from one', async () => {
    const policy = await policyOf({
      STORAGE_DRIVER: 's3',
      AWS_S3_BUCKET: 'gumruk-kocu',
      AWS_S3_PUBLIC_BASE_URL: 'https://cdn.gumrukkocuai.site/files',
    });

    expect(policy).toContain('https://cdn.gumrukkocuai.site');
  });

  it('keeps everything else closed', async () => {
    const policy = await policyOf();

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'self'");
  });
});
