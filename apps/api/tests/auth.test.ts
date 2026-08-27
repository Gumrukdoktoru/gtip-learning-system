import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createTestContext,
  TEST_ADMIN,
  type TestContext,
} from './helpers/test-app.js';

describe('POST /api/v1/auth/login', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  it('returns tokens for valid credentials', async () => {
    const response = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.role).toBe('admin');
    expect(response.body.data.tokens.accessToken).toBeTypeOf('string');
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a wrong password with 401', async () => {
    const response = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_ADMIN.email, password: 'yanlis-parola' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not distinguish unknown accounts from wrong passwords', async () => {
    const response = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'yok@example.com', password: 'her-neyse' });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('E-posta veya parola hatalı.');
  });

  it('validates the request body', async () => {
    const response = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/auth/me', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  it('returns the signed-in user', async () => {
    const response = await request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(TEST_ADMIN.email);
  });

  it('rejects a missing token', async () => {
    const response = await request(ctx.app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const response = await request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');

    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('exchanges a refresh token for a new pair', async () => {
    const ctx = await createTestContext();
    const login = await ctx.container.authService.login(
      TEST_ADMIN.email,
      TEST_ADMIN.password,
    );

    const response = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.tokens.refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.data.tokens.accessToken).toBeTypeOf('string');
  });

  it('refuses an access token used as a refresh token', async () => {
    const ctx = await createTestContext();

    const response = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ctx.adminToken });

    expect(response.status).toBe(401);
  });
});

describe('bootstrap admin', () => {
  it('is not created when accounts already exist', async () => {
    const ctx = await createTestContext();

    const created = await ctx.container.authService.ensureBootstrapAdmin(
      'baska@example.com',
      'baska-parola',
      'Başka Yönetici',
    );

    expect(created).toBeNull();
  });
});
