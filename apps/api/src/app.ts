import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { API_VERSION_PREFIX, type Container } from './container.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createUploadMiddleware } from './middleware/upload.js';
import { createApiRouter } from './routes/index.js';

export function createApp(container: Container): Express {
  const { config } = container;
  const app = express();

  app.disable('x-powered-by');
  // Downloads are served from this origin, so the default cross-origin
  // resource policy would block the frontend from embedding PDFs.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: () => config.NODE_ENV === 'test',
    }),
  );

  app.use(
    API_VERSION_PREFIX,
    createApiRouter({
      authService: container.authService,
      resourceService: container.resourceService,
      auth: createAuthMiddleware(container.authService),
      upload: createUploadMiddleware(config.MAX_UPLOAD_SIZE_BYTES),
      storageDriverName: container.storage.name,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
