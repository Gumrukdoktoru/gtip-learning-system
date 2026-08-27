import { Router } from 'express';
import type { Multer } from 'multer';

import type { SiteConfig } from '@gtip/shared';

import type { AuthMiddleware } from '../middleware/auth.js';
import type { AuthService } from '../services/auth-service.js';
import type { MediaService } from '../services/media-service.js';
import type { ResourceService } from '../services/resource-service.js';
import { sendSuccess } from '../utils/api-response.js';
import { createAuthRouter } from './auth-routes.js';
import { createMediaRouter } from './media-routes.js';
import { createResourceRouter } from './resource-routes.js';

export interface ApiRouterDeps {
  authService: AuthService;
  resourceService: ResourceService;
  mediaService: MediaService;
  auth: AuthMiddleware;
  upload: Multer;
  storageDriverName: string;
  siteConfig: SiteConfig;
}

export function createApiRouter({
  authService,
  resourceService,
  mediaService,
  auth,
  upload,
  storageDriverName,
  siteConfig,
}: ApiRouterDeps): Router {
  const router = Router();

  router.get('/health', (_req, res) =>
    sendSuccess(res, {
      status: 'ok',
      storageDriver: storageDriverName,
      timestamp: new Date().toISOString(),
    }),
  );

  router.get('/site', (_req, res) => sendSuccess(res, siteConfig));

  router.use('/auth', createAuthRouter(authService, auth));
  router.use('/resources', createResourceRouter(resourceService, auth, upload));
  router.use('/media', createMediaRouter(mediaService, auth));

  return router;
}
