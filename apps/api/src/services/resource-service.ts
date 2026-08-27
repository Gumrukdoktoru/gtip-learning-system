import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  ALLOWED_RESOURCE_EXTENSIONS,
  ALLOWED_RESOURCE_MIME_TYPES,
  buildStorageKey,
  buildStoredFileName,
  normalizeFolderPrefix,
} from '@gtip/shared';
import type {
  CreateResourceInput,
  PaginatedData,
  PublicResource,
  Resource,
  ResourceDownloadTicket,
  UpdateResourceInput,
} from '@gtip/shared';

import {
  BadRequestError,
  NotFoundError,
  PayloadTooLargeError,
} from '../errors/app-error.js';
import type {
  ResourceQuery,
  ResourceRepository,
} from '../repositories/resource-repository.js';
import type { StorageDriver } from '../storage/storage-driver.js';
import { logger } from '../utils/logger.js';

export interface UploadedFile {
  originalName: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export interface ResourceServiceOptions {
  resources: ResourceRepository;
  storage: StorageDriver;
  folderPrefix: string;
  signedUrlTtlSeconds: number;
  /** e.g. `http://localhost:3000/api/v1`, used to build fallback URLs. */
  apiBaseUrl: string;
  maxUploadSizeBytes: number;
}

export function toPublicResource(resource: Resource): PublicResource {
  return {
    id: resource.id,
    title: resource.title,
    description: resource.description,
    category: resource.category,
    originalFileName: resource.originalFileName,
    mimeType: resource.mimeType,
    sizeBytes: resource.sizeBytes,
    downloadCount: resource.downloadCount,
    createdAt: resource.createdAt,
  };
}

export class ResourceService {
  private readonly resources: ResourceRepository;
  private readonly storage: StorageDriver;
  private readonly folderPrefix: string;
  private readonly signedUrlTtlSeconds: number;
  private readonly apiBaseUrl: string;
  private readonly maxUploadSizeBytes: number;

  constructor({
    resources,
    storage,
    folderPrefix,
    signedUrlTtlSeconds,
    apiBaseUrl,
    maxUploadSizeBytes,
  }: ResourceServiceOptions) {
    this.resources = resources;
    this.storage = storage;
    this.folderPrefix = normalizeFolderPrefix(folderPrefix);
    this.signedUrlTtlSeconds = signedUrlTtlSeconds;
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
    this.maxUploadSizeBytes = maxUploadSizeBytes;
  }

  private assertUploadAllowed(file: UploadedFile): void {
    if (file.sizeBytes <= 0) {
      throw new BadRequestError('Boş dosya yüklenemez.');
    }

    if (file.sizeBytes > this.maxUploadSizeBytes) {
      throw new PayloadTooLargeError(
        `Dosya boyutu en fazla ${Math.floor(
          this.maxUploadSizeBytes / (1024 * 1024),
        )} MB olabilir.`,
      );
    }

    const mimeType = file.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
    const extension = path.extname(file.originalName).toLowerCase();

    const mimeAllowed = (ALLOWED_RESOURCE_MIME_TYPES as readonly string[]).includes(
      mimeType,
    );
    const extensionAllowed = (
      ALLOWED_RESOURCE_EXTENSIONS as readonly string[]
    ).includes(extension);

    if (!mimeAllowed || !extensionAllowed) {
      throw new BadRequestError(
        'Sadece PDF ve HTML dosyaları yüklenebilir.',
        { mimeType, extension },
      );
    }
  }

  /**
   * Writes the bytes first and the record second.
   *
   * If the record cannot be written the object is removed again, so a failed
   * upload never leaves an orphan in the bucket.
   */
  public async createResource(
    input: CreateResourceInput,
    file: UploadedFile,
    uploadedById: string,
  ): Promise<Resource> {
    this.assertUploadAllowed(file);

    const now = new Date();
    const storedFileName = buildStoredFileName(file.originalName, now);
    const storageKey = buildStorageKey({
      folderPrefix: this.folderPrefix,
      visibility: input.visibility,
      storedFileName,
    });

    if (await this.storage.objectExists(storageKey)) {
      throw new BadRequestError(
        'Aynı isimde bir dosya bu saniye içinde yüklenmiş. Lütfen tekrar deneyin.',
      );
    }

    await this.storage.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimeType,
    });

    const timestamp = now.toISOString();
    const resource: Resource = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      category: input.category,
      visibility: input.visibility,
      originalFileName: file.originalName,
      storedFileName,
      storageKey,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      downloadCount: 0,
      uploadedById,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    try {
      return await this.resources.create(resource);
    } catch (error) {
      await this.storage.deleteObject(storageKey).catch((cleanupError) => {
        logger.error('Orphaned object left in storage', {
          storageKey,
          cleanupError: String(cleanupError),
        });
      });

      throw error;
    }
  }

  public async listResources(
    query: ResourceQuery,
  ): Promise<PaginatedData<Resource>> {
    const { items, total } = await this.resources.list(query);

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  public async getResourceOrFail(id: string): Promise<Resource> {
    const resource = await this.resources.findById(id);

    if (!resource) {
      throw new NotFoundError('Kaynak bulunamadı.');
    }

    return resource;
  }

  /**
   * Applies metadata changes and, when visibility flips, relocates the object
   * between `{prefix}public/uploads/` and `{prefix}uploads/`.
   */
  public async updateResource(
    id: string,
    input: UpdateResourceInput,
  ): Promise<Resource> {
    const existing = await this.getResourceOrFail(id);
    const patch: Partial<Resource> = {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.category === undefined ? {} : { category: input.category }),
      updatedAt: new Date().toISOString(),
    };

    if (input.visibility && input.visibility !== existing.visibility) {
      const nextKey = buildStorageKey({
        folderPrefix: this.folderPrefix,
        visibility: input.visibility,
        storedFileName: existing.storedFileName,
      });

      const body = await this.storage.getObject(existing.storageKey);

      await this.storage.putObject({
        key: nextKey,
        body,
        contentType: existing.mimeType,
      });
      await this.storage.deleteObject(existing.storageKey);

      patch.visibility = input.visibility;
      patch.storageKey = nextKey;
    }

    const updated = await this.resources.update(id, patch);

    if (!updated) {
      throw new NotFoundError('Kaynak bulunamadı.');
    }

    return updated;
  }

  /** Removes the record and the stored object together. */
  public async deleteResource(id: string): Promise<void> {
    const existing = await this.getResourceOrFail(id);

    await this.storage.deleteObject(existing.storageKey);
    await this.resources.delete(id);
  }

  /**
   * Produces the URL a browser should follow.
   *
   * Public objects use the bucket/CDN URL when one is configured, private ones
   * a short lived signed URL. When the driver offers neither (local disk) the
   * caller is pointed back at the API's own streaming endpoint.
   */
  public async createDownloadTicket(
    resource: Resource,
  ): Promise<ResourceDownloadTicket> {
    const fallbackUrl = `${this.apiBaseUrl}/resources/${resource.id}/download`;

    if (resource.visibility === 'public') {
      return {
        url: this.storage.getPublicUrl(resource.storageKey) ?? fallbackUrl,
        fileName: resource.originalFileName,
        mimeType: resource.mimeType,
      };
    }

    const signed = await this.storage.createSignedUrl(
      resource.storageKey,
      this.signedUrlTtlSeconds,
    );

    if (!signed) {
      return {
        url: fallbackUrl,
        fileName: resource.originalFileName,
        mimeType: resource.mimeType,
      };
    }

    return {
      url: signed.url,
      expiresAt: signed.expiresAt.toISOString(),
      fileName: resource.originalFileName,
      mimeType: resource.mimeType,
    };
  }

  /** Reads the bytes back and records the download. */
  public async readResourceBytes(resource: Resource): Promise<Buffer> {
    const body = await this.storage.getObject(resource.storageKey);

    await this.resources.incrementDownloadCount(resource.id);

    return body;
  }
}
