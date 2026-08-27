import { Router } from 'express';

import { createMediaController } from '../controllers/media-controller.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import type { MediaService } from '../services/media-service.js';

export function createMediaRouter(
  mediaService: MediaService,
  auth: AuthMiddleware,
): Router {
  const router = Router();
  const controller = createMediaController(mediaService);
  const adminOnly = [auth.requireAuth, auth.requireRole('admin')] as const;

  router.get('/', controller.list);

  router.post('/instagram', ...adminOnly, controller.addInstagram);
  router.post('/youtube/sync', ...adminOnly, controller.syncYouTube);
  router.patch('/:id', ...adminOnly, controller.update);
  router.delete('/:id', ...adminOnly, controller.remove);

  return router;
}
