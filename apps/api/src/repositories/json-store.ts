import fs from 'node:fs/promises';
import path from 'node:path';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Tiny append-safe JSON collection.
 *
 * Records live in memory and are flushed to a single file after every write,
 * with writes serialised through a promise chain so concurrent requests cannot
 * interleave and truncate the file. Passing `filePath: null` keeps everything
 * in memory, which is what the test suite uses.
 *
 * This is deliberately the only persistence primitive in the API: every
 * repository talks to it through an interface, so swapping in Prisma later is
 * a matter of adding one more implementation (see README).
 */
export class JsonStore<T extends { id: string }> {
  private readonly filePath: string | null;
  private records: T[] = [];
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(filePath: string | null) {
    this.filePath = filePath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    if (this.filePath) {
      try {
        const raw = await fs.readFile(this.filePath, 'utf8');
        const parsed: unknown = JSON.parse(raw);

        this.records = Array.isArray(parsed) ? (parsed as T[]) : [];
      } catch (error) {
        if (!isNodeError(error) || error.code !== 'ENOENT') {
          throw error;
        }

        this.records = [];
      }
    }

    this.loaded = true;
  }

  private flush(): Promise<void> {
    if (!this.filePath) {
      return Promise.resolve();
    }

    const filePath = this.filePath;
    const snapshot = JSON.stringify(this.records, null, 2);

    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const tempPath = `${filePath}.tmp`;

      await fs.writeFile(tempPath, snapshot, 'utf8');
      await fs.rename(tempPath, filePath);
    });

    return this.writeChain;
  }

  public async all(): Promise<T[]> {
    await this.ensureLoaded();

    return this.records.map((record) => ({ ...record }));
  }

  public async findById(id: string): Promise<T | null> {
    await this.ensureLoaded();
    const found = this.records.find((record) => record.id === id);

    return found ? { ...found } : null;
  }

  public async find(
    predicate: (record: T) => boolean,
  ): Promise<T | null> {
    await this.ensureLoaded();
    const found = this.records.find(predicate);

    return found ? { ...found } : null;
  }

  public async insert(record: T): Promise<T> {
    await this.ensureLoaded();
    this.records.push({ ...record });
    await this.flush();

    return { ...record };
  }

  public async update(id: string, patch: Partial<T>): Promise<T | null> {
    await this.ensureLoaded();
    const index = this.records.findIndex((record) => record.id === id);
    const existing = this.records[index];

    if (index === -1 || !existing) {
      return null;
    }

    const updated = { ...existing, ...patch, id: existing.id };

    this.records[index] = updated;
    await this.flush();

    return { ...updated };
  }

  public async remove(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const index = this.records.findIndex((record) => record.id === id);

    if (index === -1) {
      return false;
    }

    this.records.splice(index, 1);
    await this.flush();

    return true;
  }

  public async count(): Promise<number> {
    await this.ensureLoaded();

    return this.records.length;
  }
}
