import { foldForSearch } from '@gtip/shared';
import type { MediaItem, MediaSource } from '@gtip/shared';

import { JsonStore } from './json-store.js';

/**
 * Stored shape of a media item.
 *
 * `coverStorageKey` stays server side — readers get a `thumbnailUrl` the API
 * computes from it, so the bucket layout never reaches the browser.
 */
export interface MediaRecord extends Omit<MediaItem, 'thumbnailUrl'> {
  /** Feed-provided image (YouTube). */
  thumbnailUrl?: string;
  /** Object key of an admin-uploaded cover (Instagram). */
  coverStorageKey?: string;
  /** Content type the cover was uploaded with, so it is served correctly. */
  coverMimeType?: string;
  /**
   * True when a human wrote this item's title and description.
   *
   * Instagram sync fills copy from the caption, but never overwrites words an
   * admin typed, so a curated card survives every re-sync.
   */
  isCurated?: boolean;
}

export interface MediaQuery {
  page: number;
  pageSize: number;
  search?: string;
  source?: MediaSource;
}

export interface MediaPage {
  items: MediaRecord[];
  total: number;
}

export interface MediaRepository {
  list(query: MediaQuery): Promise<MediaPage>;
  findById(id: string): Promise<MediaRecord | null>;
  findByExternalId(
    source: MediaSource,
    externalId: string,
  ): Promise<MediaRecord | null>;
  create(item: MediaRecord): Promise<MediaRecord>;
  update(id: string, patch: Partial<MediaRecord>): Promise<MediaRecord | null>;
  delete(id: string): Promise<boolean>;
}

function matchesSearch(item: MediaRecord, needle: string): boolean {
  return foldForSearch(`${item.title} ${item.description}`).includes(needle);
}

/** Pinned first, then newest published. */
function byPinnedThenDate(left: MediaRecord, right: MediaRecord): number {
  if (left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1;
  }

  return right.publishedAt.localeCompare(left.publishedAt);
}

export class JsonMediaRepository implements MediaRepository {
  private readonly store: JsonStore<MediaRecord>;

  constructor(filePath: string | null) {
    this.store = new JsonStore<MediaRecord>(filePath);
  }

  public async list({
    page,
    pageSize,
    search,
    source,
  }: MediaQuery): Promise<MediaPage> {
    const needle = search?.trim() ? foldForSearch(search.trim()) : undefined;
    const filtered = (await this.store.all())
      .filter((item) => (source ? item.source === source : true))
      .filter((item) => (needle ? matchesSearch(item, needle) : true))
      .sort(byPinnedThenDate);

    const start = (page - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
    };
  }

  public findById(id: string): Promise<MediaRecord | null> {
    return this.store.findById(id);
  }

  public findByExternalId(
    source: MediaSource,
    externalId: string,
  ): Promise<MediaRecord | null> {
    return this.store.find(
      (item) => item.source === source && item.externalId === externalId,
    );
  }

  public create(item: MediaRecord): Promise<MediaRecord> {
    return this.store.insert(item);
  }

  public update(
    id: string,
    patch: Partial<MediaRecord>,
  ): Promise<MediaRecord | null> {
    return this.store.update(id, patch);
  }

  public delete(id: string): Promise<boolean> {
    return this.store.remove(id);
  }
}
