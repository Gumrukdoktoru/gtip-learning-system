import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

import { AppError } from '../errors/app-error.js';
import { sendError } from '../utils/api-response.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, {
    code: 'ROUTE_NOT_FOUND',
    message: `İstenen adres bulunamadı: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Converts every thrown value into the shared ApiResponse envelope.
 *
 * Internal error messages are never forwarded; unexpected failures are logged
 * with their stack and answered with a generic message.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);

    return;
  }

  if (error instanceof ZodError) {
    sendError(res, 422, {
      code: 'VALIDATION_ERROR',
      message: 'Gönderilen veriler geçersiz.',
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });

    return;
  }

  if (error instanceof multer.MulterError) {
    const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;

    sendError(res, statusCode, {
      code: error.code,
      message:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Dosya boyutu izin verilen sınırı aşıyor.'
          : 'Dosya yüklenirken bir sorun oluştu.',
    });

    return;
  }

  if (error instanceof AppError) {
    sendError(res, error.statusCode, {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });

    return;
  }

  logger.error('Unhandled error', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  sendError(res, 500, {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Beklenmeyen bir hata oluştu.',
  });
}
