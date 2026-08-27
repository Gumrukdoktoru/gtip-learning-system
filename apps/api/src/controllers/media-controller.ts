import type { Request, RequestHandler, Response } from 'express';

import {
  createInstagramItemSchema,
  listMediaQuerySchema,
  mediaIdSchema,
  updateMediaItemSchema,
} from '../schemas/media-schemas.js';
import type { MediaService } from '../services/media-service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export interface MediaController {
  list: RequestHandler;
  addInstagram: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
  syncYouTube: RequestHandler;
}

export function createMediaController(
  mediaService: MediaService,
): MediaController {
  const list = asyncHandler(async (req: Request, res: Response) => {
    const query = listMediaQuerySchema.parse(req.query);

    // Keeps the shelf current without a scheduler; a YouTube outage only
    // means the previously synced videos are served.
    await mediaService.syncYouTubeIfStale();

    return sendSuccess(res, await mediaService.listMedia(query));
  });

  const addInstagram = asyncHandler(async (req: Request, res: Response) => {
    const input = createInstagramItemSchema.parse(req.body);

    return sendSuccess(res, await mediaService.addInstagramItem(input), 201);
  });

  const update = asyncHandler(async (req: Request, res: Response) => {
    const { id } = mediaIdSchema.parse(req.params);
    const input = updateMediaItemSchema.parse(req.body);

    return sendSuccess(res, await mediaService.updateMediaItem(id, input));
  });

  const remove = asyncHandler(async (req: Request, res: Response) => {
    const { id } = mediaIdSchema.parse(req.params);

    await mediaService.deleteMediaItem(id);

    return sendSuccess(res, { id });
  });

  const syncYouTube = asyncHandler(async (_req: Request, res: Response) => {
    return sendSuccess(res, await mediaService.syncYouTube());
  });

  return { list, addInstagram, update, remove, syncYouTube };
}
