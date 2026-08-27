import fs from 'node:fs/promises';
import path from 'node:path';

import { NotFoundError } from '../errors/app-error.js';
import type {
  PutObjectParams,
  SignedUrl,
  StorageDriver,
} from './storage-driver.js';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Filesystem backed driver used for local development and tests.
 *
 * The on-disk layout mirrors the object keys one-to-one, so a local tree can be
 * synced to the bucket with `aws s3 sync` without any rewriting.
 */
export class LocalStorageDriver implements StorageDriver {
  public readonly name = 'local';

  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Maps an object key onto an absolute path, refusing to escape the root. */
  private resolveKey(key: string): string {
    const target = path.resolve(this.root, ...key.split('/'));
    const rootWithSep = this.root.endsWith(path.sep)
      ? this.root
      : `${this.root}${path.sep}`;

    if (!target.startsWith(rootWithSep)) {
      throw new Error(`Storage key escapes the storage root: ${key}`);
    }

    return target;
  }

  public async putObject({
    key,
    body,
    contentType,
  }: PutObjectParams): Promise<void> {
    const target = this.resolveKey(key);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    await fs.writeFile(
      `${target}.meta.json`,
      JSON.stringify({ contentType, sizeBytes: body.byteLength }, null, 2),
    );
  }

  public async getObject(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolveKey(key));
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new NotFoundError('Dosya depolama alanında bulunamadı.');
      }

      throw error;
    }
  }

  public async deleteObject(key: string): Promise<void> {
    const target = this.resolveKey(key);

    await fs.rm(target, { force: true });
    await fs.rm(`${target}.meta.json`, { force: true });
  }

  public async objectExists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));

      return true;
    } catch {
      return false;
    }
  }

  /** The local driver has no web server of its own; the API streams instead. */
  public getPublicUrl(): string | null {
    return null;
  }

  /**
   * There is nothing to sign against a local disk, so callers fall back to the
   * authenticated streaming endpoint.
   */
  public async createSignedUrl(): Promise<SignedUrl | null> {
    return null;
  }
}
