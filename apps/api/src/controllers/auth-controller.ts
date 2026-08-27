import type { Request, RequestHandler, Response } from 'express';

import { UnauthorizedError } from '../errors/app-error.js';
import { loginSchema, refreshSchema } from '../schemas/auth-schemas.js';
import type { AuthService } from '../services/auth-service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export interface AuthController {
  login: RequestHandler;
  refresh: RequestHandler;
  me: RequestHandler;
}

export function createAuthController(authService: AuthService): AuthController {
  const login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);

    return sendSuccess(res, await authService.login(email, password));
  });

  const refresh = asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = refreshSchema.parse(req.body);

    return sendSuccess(res, await authService.refresh(refreshToken));
  });

  const me = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) {
      throw new UnauthorizedError();
    }

    const user = await authService.getUserById(req.auth.sub);

    if (!user) {
      throw new UnauthorizedError('Kullanıcı bulunamadı.');
    }

    return sendSuccess(res, user);
  });

  return { login, refresh, me };
}
