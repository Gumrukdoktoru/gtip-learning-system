import { Router } from 'express';
import type { Multer } from 'multer';

import { createResourceController } from '../controllers/resource-controller.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import type { ResourceService } from '../services/resource-service.js';

export function createResourceRouter(
  resourceService: ResourceService,
  auth: AuthMiddleware,
  upload: Multer,
): Router {
  const router = Router();
  const controller = createResourceController(resourceService);
  const adminOnly = [auth.requireAuth, auth.requireRole('admin')] as const;

  // Reads are open; `optionalAuth` upgrades the response for signed-in staff.
  router.get('/', auth.optionalAuth, controller.list);
  router.get('/:id', auth.optionalAuth, controller.getById);
  router.get('/:id/download-url', auth.optionalAuth, controller.downloadUrl);
  router.get('/:id/download', auth.optionalAuth, controller.download);

  router.post('/', ...adminOnly, upload.single('file'), controller.create);
  router.patch('/:id', ...adminOnly, controller.update);
  router.delete('/:id', ...adminOnly, controller.remove);

  return router;
}
