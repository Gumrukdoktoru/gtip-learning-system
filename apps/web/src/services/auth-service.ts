import type { LoginResponse, User } from '@gtip/shared';

import { apiRequest } from './api-client';

export function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function fetchCurrentUser(): Promise<User> {
  return apiRequest<User>('/auth/me');
}

export function refreshSession(refreshToken: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
}
