import { Router } from 'express';
import type { Multer } from 'multer';

import { createMediaController } from '../controllers/media-controller.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import type { MediaService } from '../services/media-service.js';

export function createMediaRouter(
  mediaService: MediaService,
  auth: AuthMiddleware,
  upload: Multer,
): Router {
  const router = Router();
  const controller = createMediaController(mediaService);
  const adminOnly = [auth.requireAuth, auth.requireRole('admin')] as const;

  router.get('/', controller.list);
  router.get('/:id/cover', controller.readCover);

  // Both accept multipart so an optional cover image can ride along; the
  // fields still arrive as ordinary form values.
  router.post(
    '/instagram',
    ...adminOnly,
    upload.single('cover'),
    controller.addInstagram,
  );
  router.post(
    '/:id/cover',
    ...adminOnly,
    upload.single('cover'),
    controller.setCover,
  );
  router.post('/youtube/sync', ...adminOnly, controller.syncYouTube);
  router.patch('/:id', ...adminOnly, controller.update);
  router.delete('/:id', ...adminOnly, controller.remove);

  return router;
}
