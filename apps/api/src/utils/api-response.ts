import type { Response } from 'express';

import type { ApiError, ApiResponse } from '@gtip/shared';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
): Response {
  const body: ApiResponse<T> = { success: true, data };

  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  error: ApiError,
): Response {
  const body: ApiResponse<never> = { success: false, error };

  return res.status(statusCode).json(body);
}
