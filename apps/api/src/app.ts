import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { API_VERSION_PREFIX, type Container } from './container.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { buildHelmetOptions } from './middleware/security-headers.js';
import { serveWebApp } from './middleware/static-site.js';
import { createUploadMiddleware } from './middleware/upload.js';
import { createApiRouter } from './routes/index.js';
import { buildSiteConfig } from './services/site-service.js';

export function createApp(container: Container): Express {
  const { config } = container;
  const app = express();

  app.disable('x-powered-by');
  // Behind a reverse proxy the client IP arrives in X-Forwarded-For; without
  // this every visitor would share the proxy's rate-limit bucket.
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(compression());
  app.use(helmet(buildHelmetOptions(config)));
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
      mediaService: container.mediaService,
      quizService: container.quizService,
      auth: createAuthMiddleware(container.authService),
      upload: createUploadMiddleware(config.MAX_UPLOAD_SIZE_BYTES),
      storageDriverName: container.storage.name,
      siteConfig: buildSiteConfig({
        title: config.SITE_TITLE,
        tagline: config.SITE_TAGLINE,
        youtubeChannel: config.YOUTUBE_CHANNEL,
        ...(config.INSTAGRAM_PROFILE_URL
          ? { instagramProfileUrl: config.INSTAGRAM_PROFILE_URL }
          : {}),
        instagramAccessToken: config.INSTAGRAM_ACCESS_TOKEN,
      }),
    }),
  );

  if (config.SERVE_WEB) {
    serveWebApp(app, config.webDistPath);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
