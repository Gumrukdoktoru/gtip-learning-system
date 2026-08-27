import { foldForSearch } from '@gtip/shared';
import type { MediaItem, MediaSource } from '@gtip/shared';

import { JsonStore } from './json-store.js';

export interface MediaQuery {
  page: number;
  pageSize: number;
  search?: string;
  source?: MediaSource;
}

export interface MediaPage {
  items: MediaItem[];
  total: number;
}

export interface MediaRepository {
  list(query: MediaQuery): Promise<MediaPage>;
  findById(id: string): Promise<MediaItem | null>;
  findByExternalId(
    source: MediaSource,
    externalId: string,
  ): Promise<MediaItem | null>;
  create(item: MediaItem): Promise<MediaItem>;
  update(id: string, patch: Partial<MediaItem>): Promise<MediaItem | null>;
  delete(id: string): Promise<boolean>;
}

function matchesSearch(item: MediaItem, needle: string): boolean {
  return foldForSearch(`${item.title} ${item.description}`).includes(needle);
}

/** Pinned first, then newest published. */
function byPinnedThenDate(left: MediaItem, right: MediaItem): number {
  if (left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1;
  }

  return right.publishedAt.localeCompare(left.publishedAt);
}

export class JsonMediaRepository implements MediaRepository {
  private readonly store: JsonStore<MediaItem>;

  constructor(filePath: string | null) {
    this.store = new JsonStore<MediaItem>(filePath);
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

  public findById(id: string): Promise<MediaItem | null> {
    return this.store.findById(id);
  }

  public findByExternalId(
    source: MediaSource,
    externalId: string,
  ): Promise<MediaItem | null> {
    return this.store.find(
      (item) => item.source === source && item.externalId === externalId,
    );
  }

  public create(item: MediaItem): Promise<MediaItem> {
    return this.store.insert(item);
  }

  public update(
    id: string,
    patch: Partial<MediaItem>,
  ): Promise<MediaItem | null> {
    return this.store.update(id, patch);
  }

  public delete(id: string): Promise<boolean> {
    return this.store.remove(id);
  }
}
