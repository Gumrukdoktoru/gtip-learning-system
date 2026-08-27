/** Where a stored object lives, which decides how it is served. */
export type ResourceVisibility = 'public' | 'private';

/** Broad grouping shown as a filter on the public resources page. */
export type ResourceCategory =
  | 'mevzuat'
  | 'teblig'
  | 'genelge'
  | 'kilavuz'
  | 'form'
  | 'diger';

export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  'mevzuat',
  'teblig',
  'genelge',
  'kilavuz',
  'form',
  'diger',
];

export const RESOURCE_CATEGORY_LABELS: Record<ResourceCategory, string> = {
  mevzuat: 'Mevzuat',
  teblig: 'Tebliğ',
  genelge: 'Genelge',
  kilavuz: 'Kılavuz',
  form: 'Form',
  diger: 'Diğer',
};

/**
 * A downloadable document uploaded from the admin panel.
 *
 * `storageKey` is the full object key including the folder prefix; it is the
 * single source of truth for where the bytes live and is never rebuilt from
 * the other fields once written.
 */
export interface Resource {
  id: string;
  title: string;
  description: string;
  category: ResourceCategory;
  visibility: ResourceVisibility;
  /** Name the file had on the admin's machine. */
  originalFileName: string;
  /** `{unixTimestamp}-{originalFileName}` as written to storage. */
  storedFileName: string;
  /** Full object key, e.g. `69655/public/uploads/1724795000-tebliğ.pdf`. */
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  downloadCount: number;
  uploadedById: string;
  createdAt: string;
  updatedAt: string;
}

/** Resource shape exposed to anonymous visitors (no storage internals). */
export interface PublicResource {
  id: string;
  title: string;
  description: string;
  category: ResourceCategory;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  downloadCount: number;
  createdAt: string;
}

export interface ResourceListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: ResourceCategory;
  visibility?: ResourceVisibility;
}

export interface CreateResourceInput {
  title: string;
  description: string;
  category: ResourceCategory;
  visibility: ResourceVisibility;
}

export type UpdateResourceInput = Partial<CreateResourceInput>;

export interface ResourceDownloadTicket {
  /** Direct URL for public files, signed URL for private ones. */
  url: string;
  /** Present only for signed URLs. */
  expiresAt?: string;
  fileName: string;
  mimeType: string;
}
