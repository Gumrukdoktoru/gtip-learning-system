import { Router } from 'express';
import type { Multer } from 'multer';

import type { AuthMiddleware } from '../middleware/auth.js';
import type { AuthService } from '../services/auth-service.js';
import type { ResourceService } from '../services/resource-service.js';
import { sendSuccess } from '../utils/api-response.js';
import { createAuthRouter } from './auth-routes.js';
import { createResourceRouter } from './resource-routes.js';

export interface ApiRouterDeps {
  authService: AuthService;
  resourceService: ResourceService;
  auth: AuthMiddleware;
  upload: Multer;
  storageDriverName: string;
}

export function createApiRouter({
  authService,
  resourceService,
  auth,
  upload,
  storageDriverName,
}: ApiRouterDeps): Router {
  const router = Router();

  router.get('/health', (_req, res) =>
    sendSuccess(res, {
      status: 'ok',
      storageDriver: storageDriverName,
      timestamp: new Date().toISOString(),
    }),
  );

  router.use('/auth', createAuthRouter(authService, auth));
  router.use('/resources', createResourceRouter(resourceService, auth, upload));

  return router;
}
