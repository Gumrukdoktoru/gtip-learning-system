import { NotFoundError } from '../errors/app-error.js';
import type {
  PutObjectParams,
  SignedUrl,
  StorageDriver,
} from './storage-driver.js';

interface MemoryObject {
  body: Buffer;
  contentType: string;
}

/** In-process driver used by the test suite; no disk, no network. */
export class MemoryStorageDriver implements StorageDriver {
  public readonly name = 'memory';

  private readonly objects = new Map<string, MemoryObject>();

  public async putObject({
    key,
    body,
    contentType,
  }: PutObjectParams): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }

  public async getObject(key: string): Promise<Buffer> {
    const stored = this.objects.get(key);

    if (!stored) {
      throw new NotFoundError('Dosya depolama alanında bulunamadı.');
    }

    return stored.body;
  }

  public async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  public async objectExists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  public getPublicUrl(): string | null {
    return null;
  }

  public async createSignedUrl(): Promise<SignedUrl | null> {
    return null;
  }

  /** Test helper: every key currently held. */
  public keys(): string[] {
    return [...this.objects.keys()];
  }
}
