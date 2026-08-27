import { foldForSearch } from '@gtip/shared';
import type {
  Resource,
  ResourceCategory,
  ResourceVisibility,
} from '@gtip/shared';

import { JsonStore } from './json-store.js';

export interface ResourceQuery {
  page: number;
  pageSize: number;
  search?: string;
  category?: ResourceCategory;
  visibility?: ResourceVisibility;
}

export interface ResourcePage {
  items: Resource[];
  total: number;
}

export interface ResourceRepository {
  list(query: ResourceQuery): Promise<ResourcePage>;
  findById(id: string): Promise<Resource | null>;
  findByStorageKey(storageKey: string): Promise<Resource | null>;
  create(resource: Resource): Promise<Resource>;
  update(id: string, patch: Partial<Resource>): Promise<Resource | null>;
  delete(id: string): Promise<boolean>;
  incrementDownloadCount(id: string): Promise<void>;
}

function matchesSearch(resource: Resource, needle: string): boolean {
  const haystack = foldForSearch(
    [resource.title, resource.description, resource.originalFileName].join(' '),
  );

  return haystack.includes(needle);
}

export class JsonResourceRepository implements ResourceRepository {
  private readonly store: JsonStore<Resource>;

  constructor(filePath: string | null) {
    this.store = new JsonStore<Resource>(filePath);
  }

  public async list({
    page,
    pageSize,
    search,
    category,
    visibility,
  }: ResourceQuery): Promise<ResourcePage> {
    const needle = search?.trim() ? foldForSearch(search.trim()) : undefined;
    const all = await this.store.all();

    const filtered = all
      .filter((resource) =>
        visibility ? resource.visibility === visibility : true,
      )
      .filter((resource) => (category ? resource.category === category : true))
      .filter((resource) =>
        needle ? matchesSearch(resource, needle) : true,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const start = (page - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
    };
  }

  public findById(id: string): Promise<Resource | null> {
    return this.store.findById(id);
  }

  public findByStorageKey(storageKey: string): Promise<Resource | null> {
    return this.store.find((resource) => resource.storageKey === storageKey);
  }

  public create(resource: Resource): Promise<Resource> {
    return this.store.insert(resource);
  }

  public update(
    id: string,
    patch: Partial<Resource>,
  ): Promise<Resource | null> {
    return this.store.update(id, patch);
  }

  public delete(id: string): Promise<boolean> {
    return this.store.remove(id);
  }

  public async incrementDownloadCount(id: string): Promise<void> {
    const existing = await this.store.findById(id);

    if (!existing) {
      return;
    }

    await this.store.update(id, {
      downloadCount: existing.downloadCount + 1,
    });
  }
}
