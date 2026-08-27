import type { AccessTokenPayload } from '../services/auth-service.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` / `optionalAuth`. */
      auth?: AccessTokenPayload;
    }
  }
}

export {};
