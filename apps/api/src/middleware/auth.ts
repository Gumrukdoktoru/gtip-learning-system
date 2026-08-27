import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { UserRole } from '@gtip/shared';

import { ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import type { AuthService } from '../services/auth-service.js';

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();

  return token.length > 0 ? token : null;
}

export interface AuthMiddleware {
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
  requireRole: (...roles: UserRole[]) => RequestHandler;
}

export function createAuthMiddleware(
  authService: AuthService,
): AuthMiddleware {
  const requireAuth: RequestHandler = (
    req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    const token = readBearerToken(req);

    if (!token) {
      next(new UnauthorizedError());

      return;
    }

    try {
      req.auth = authService.verifyToken(token, 'access');
      next();
    } catch (error) {
      next(error);
    }
  };

  /** Attaches the caller when a valid token is present, never rejects. */
  const optionalAuth: RequestHandler = (
    req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    const token = readBearerToken(req);

    if (token) {
      try {
        req.auth = authService.verifyToken(token, 'access');
      } catch {
        // An invalid token on a public endpoint is treated as anonymous.
      }
    }

    next();
  };

  const requireRole =
    (...roles: UserRole[]): RequestHandler =>
    (req: Request, _res: Response, next: NextFunction) => {
      if (!req.auth) {
        next(new UnauthorizedError());

        return;
      }

      if (!roles.includes(req.auth.role)) {
        next(new ForbiddenError());

        return;
      }

      next();
    };

  return { requireAuth, optionalAuth, requireRole };
}
