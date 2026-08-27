import type { ApiError, ApiResponse } from '@gtip/shared';

const API_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

/** Error carrying the server's ApiError payload so the UI can show it. */
export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

export type TokenReader = () => string | null;

let readAccessToken: TokenReader = () => null;

/** Lets the auth store hand the client its current access token. */
export function setTokenReader(reader: TokenReader): void {
  readAccessToken = reader;
}

export function buildApiUrl(path: string): string {
  return `${API_URL.replace(/\/+$/, '')}${path}`;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sent as-is; the browser sets the multipart boundary itself. */
  formData?: FormData;
  signal?: AbortSignal;
}

/**
 * Unwraps the shared `ApiResponse<T>` envelope.
 *
 * Any non-success response — including a body that is not valid JSON — is
 * turned into an ApiRequestError, so callers only deal with `T`.
 */
export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, formData, signal }: RequestOptions = {},
): Promise<T> {
  const headers = new Headers();
  const token = readAccessToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(buildApiUrl(path), {
    method,
    headers,
    ...(formData ? { body: formData } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });

  let payload: ApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    throw new ApiRequestError(
      response.status,
      payload?.error ?? {
        code: 'NETWORK_ERROR',
        message: 'Sunucuya ulaşılamadı. Lütfen tekrar deneyin.',
      },
    );
  }

  return payload.data as T;
}

export function buildQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }

  const query = search.toString();

  return query.length > 0 ? `?${query}` : '';
}
