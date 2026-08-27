import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { createAuthController } from '../controllers/auth-controller.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import type { AuthService } from '../services/auth-service.js';

export function createAuthRouter(
  authService: AuthService,
  auth: AuthMiddleware,
): Router {
  const router = Router();
  const controller = createAuthController(authService);

  // Brute force protection: 10 credential attempts per IP per 15 minutes.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
  });

  router.post('/login', loginLimiter, controller.login);
  router.post('/refresh', loginLimiter, controller.refresh);
  router.get('/me', auth.requireAuth, controller.me);

  return router;
}
