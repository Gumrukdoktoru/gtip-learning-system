import { existsSync } from 'node:fs';
import path from 'node:path';

import express, { type Express, type Request, type Response } from 'express';

import { logger } from '../utils/logger.js';

/** Path prefix the API owns; everything else may fall through to the app. */
const API_PREFIX = '/api/';

/**
 * Serves the built frontend from the API process.
 *
 * Hashed assets are immutable and cached for a year; `index.html` never is, so
 * a deploy takes effect on the next reload. Any other GET falls back to the
 * app shell, because the routes below `/yonetim` only exist in the browser —
 * without this a refresh on an admin page would 404.
 */
export function serveWebApp(app: Express, distPath: string): void {
  const indexFile = path.join(distPath, 'index.html');

  if (!existsSync(indexFile)) {
    logger.warn('SERVE_WEB is on but no build was found', { distPath });

    return;
  }

  app.use(
    express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');

          return;
        }

        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith(API_PREFIX)) {
      next();

      return;
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });

  logger.info('Serving the built frontend', { distPath });
}
