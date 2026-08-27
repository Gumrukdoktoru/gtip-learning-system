import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiRequestError,
  apiRequest,
  buildQueryString,
  setTokenReader,
} from './api-client';

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  setTokenReader(() => null);
});

describe('apiRequest', () => {
  it('unwraps the success envelope', async () => {
    mockFetch(200, { success: true, data: { id: '1' } });

    await expect(apiRequest<{ id: string }>('/resources')).resolves.toEqual({
      id: '1',
    });
  });

  it('throws an ApiRequestError carrying the server code', async () => {
    mockFetch(403, {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Bu işlem için yetkiniz yok.' },
    });

    await expect(apiRequest('/resources')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Bu işlem için yetkiniz yok.',
    });
  });

  it('falls back to a network error when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502</html>', { status: 502 })),
    );

    await expect(apiRequest('/resources')).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    await expect(apiRequest('/resources')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('attaches the bearer token when one is available', async () => {
    mockFetch(200, { success: true, data: null });
    setTokenReader(() => 'test-token');

    await apiRequest('/auth/me');

    const call = vi.mocked(fetch).mock.calls[0];
    const init = call?.[1] as RequestInit;

    expect((init.headers as Headers).get('Authorization')).toBe(
      'Bearer test-token',
    );
  });

  it('sends no Content-Type for multipart bodies', async () => {
    mockFetch(201, { success: true, data: { id: '1' } });

    const formData = new FormData();

    formData.append('title', 'Tebliğ');

    await apiRequest('/resources', { method: 'POST', formData });

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;

    expect((init.headers as Headers).has('Content-Type')).toBe(false);
    expect(init.body).toBe(formData);
  });
});

describe('buildQueryString', () => {
  it('drops empty values', () => {
    expect(
      buildQueryString({ page: 1, search: '', category: undefined }),
    ).toBe('?page=1');
  });

  it('returns an empty string when nothing is set', () => {
    expect(buildQueryString({ search: undefined })).toBe('');
  });

  it('encodes Turkish characters', () => {
    expect(buildQueryString({ search: 'tebliğ' })).toBe('?search=tebli%C4%9F');
  });
});
