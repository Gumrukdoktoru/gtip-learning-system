import type { Request, RequestHandler, Response } from 'express';

import type { PublicResource, Resource } from '@gtip/shared';

import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../errors/app-error.js';
import {
  createResourceSchema,
  listResourceQuerySchema,
  resourceIdSchema,
  updateResourceSchema,
} from '../schemas/resource-schemas.js';
import type { ResourceService } from '../services/resource-service.js';
import { toPublicResource } from '../services/resource-service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

/** Roles allowed to see private resources and storage metadata. */
const PRIVILEGED_ROLES = new Set(['admin', 'instructor']);

function isPrivileged(req: Request): boolean {
  return req.auth ? PRIVILEGED_ROLES.has(req.auth.role) : false;
}

export interface ResourceController {
  list: RequestHandler;
  getById: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
  downloadUrl: RequestHandler;
  download: RequestHandler;
}

export function createResourceController(
  resourceService: ResourceService,
): ResourceController {
  /**
   * Loads a resource and enforces that anonymous callers only ever reach
   * public ones, hiding private records behind a 404 rather than a 403.
   */
  async function loadVisibleResource(req: Request): Promise<Resource> {
    const { id } = resourceIdSchema.parse(req.params);
    const resource = await resourceService.getResourceOrFail(id);

    if (resource.visibility === 'private' && !isPrivileged(req)) {
      throw new NotFoundError('Kaynak bulunamadı.');
    }

    return resource;
  }

  const list = asyncHandler(async (req: Request, res: Response) => {
    const query = listResourceQuerySchema.parse(req.query);
    const privileged = isPrivileged(req);

    const page = await resourceService.listResources({
      ...query,
      // Anonymous visitors only ever see the public shelf.
      visibility: privileged ? query.visibility : 'public',
    });

    const items: Resource[] | PublicResource[] = privileged
      ? page.items
      : page.items.map(toPublicResource);

    return sendSuccess(res, { ...page, items });
  });

  const getById = asyncHandler(async (req: Request, res: Response) => {
    const resource = await loadVisibleResource(req);

    return sendSuccess(
      res,
      isPrivileged(req) ? resource : toPublicResource(resource),
    );
  });

  const create = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) {
      throw new ForbiddenError();
    }

    if (!req.file) {
      throw new BadRequestError('Yüklenecek dosya bulunamadı.');
    }

    const input = createResourceSchema.parse(req.body);
    const resource = await resourceService.createResource(
      input,
      {
        originalName: Buffer.from(req.file.originalname, 'latin1').toString(
          'utf8',
        ),
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
      req.auth.sub,
    );

    return sendSuccess(res, resource, 201);
  });

  const update = asyncHandler(async (req: Request, res: Response) => {
    const { id } = resourceIdSchema.parse(req.params);
    const input = updateResourceSchema.parse(req.body);

    return sendSuccess(res, await resourceService.updateResource(id, input));
  });

  const remove = asyncHandler(async (req: Request, res: Response) => {
    const { id } = resourceIdSchema.parse(req.params);

    await resourceService.deleteResource(id);

    return sendSuccess(res, { id });
  });

  const downloadUrl = asyncHandler(async (req: Request, res: Response) => {
    const resource = await loadVisibleResource(req);

    return sendSuccess(res, await resourceService.createDownloadTicket(resource));
  });

  const download = asyncHandler(async (req: Request, res: Response) => {
    const resource = await loadVisibleResource(req);
    const body = await resourceService.readResourceBytes(resource);

    res.setHeader('Content-Type', resource.mimeType);
    res.setHeader('Content-Length', String(body.byteLength));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(
        resource.originalFileName,
      )}`,
    );
    res.setHeader(
      'Cache-Control',
      resource.visibility === 'public'
        ? 'public, max-age=3600'
        : 'private, no-store',
    );

    return res.send(body);
  });

  return { list, getById, create, update, remove, downloadUrl, download };
}
