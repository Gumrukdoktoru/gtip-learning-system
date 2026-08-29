import type { Request, RequestHandler, Response } from 'express';

import { BadRequestError } from '../errors/app-error.js';
import {
  createInstagramItemSchema,
  listMediaQuerySchema,
  mediaIdSchema,
  updateMediaItemSchema,
} from '../schemas/media-schemas.js';
import type { MediaService } from '../services/media-service.js';
import type { UploadedFile } from '../services/resource-service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export interface MediaController {
  list: RequestHandler;
  addInstagram: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
  syncYouTube: RequestHandler;
  syncInstagram: RequestHandler;
  setCover: RequestHandler;
  readCover: RequestHandler;
}

/** Multer file → the shape the services expect. */
function toUploadedFile(file: Express.Multer.File): UploadedFile {
  return {
    // Multer decodes the multipart filename as latin1.
    originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
    buffer: file.buffer,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  };
}

export function createMediaController(
  mediaService: MediaService,
): MediaController {
  const list = asyncHandler(async (req: Request, res: Response) => {
    const query = listMediaQuerySchema.parse(req.query);

    // Keeps both shelves current without a scheduler; an outage on either
    // platform only means the previously synced items are served.
    await Promise.all([
      mediaService.syncYouTubeIfStale(),
      mediaService.syncInstagramIfStale(),
    ]);

    return sendSuccess(res, await mediaService.listMedia(query));
  });

  const addInstagram = asyncHandler(async (req: Request, res: Response) => {
    const input = createInstagramItemSchema.parse(req.body);
    // The cover is optional: a card without one falls back to a placeholder.
    const cover = req.file ? toUploadedFile(req.file) : undefined;

    return sendSuccess(
      res,
      await mediaService.addInstagramItem(input, cover),
      201,
    );
  });

  const setCover = asyncHandler(async (req: Request, res: Response) => {
    const { id } = mediaIdSchema.parse(req.params);

    if (!req.file) {
      throw new BadRequestError('Yüklenecek görsel bulunamadı.');
    }

    return sendSuccess(res, await mediaService.setCover(id, toUploadedFile(req.file)));
  });

  const readCover = asyncHandler(async (req: Request, res: Response) => {
    const { id } = mediaIdSchema.parse(req.params);
    const { body, mimeType } = await mediaService.readCoverBytes(id);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(body.byteLength));
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.send(body);
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

  const syncInstagram = asyncHandler(async (_req: Request, res: Response) => {
    return sendSuccess(res, await mediaService.syncInstagram());
  });

  return {
    list,
    addInstagram,
    update,
    remove,
    syncYouTube,
    syncInstagram,
    setCover,
    readCover,
  };
}
