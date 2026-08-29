/**
 * Storage layout conventions.
 *
 * Every object key is built as `{folderPrefix}{segment}{storedFileName}` where
 * `folderPrefix` comes from the AWS_FOLDER_PREFIX environment variable
 * (currently `69655/`) and `storedFileName` is `{unixTimestamp}-{originalName}`.
 */

/** Segment for files served to anonymous visitors. */
export const PUBLIC_UPLOAD_SEGMENT = 'public/uploads/';

/** Segment for files that are only reachable through a signed URL. */
export const PRIVATE_UPLOAD_SEGMENT = 'uploads/';

/** Longest stored file name we accept, keeps keys well below S3's 1024 limit. */
export const MAX_STORED_FILE_NAME_LENGTH = 180;

/** Upload size ceiling used by both the API and the upload form (25 MiB). */
export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

/** Content types the admin panel accepts, per the resource upload form. */
export const ALLOWED_RESOURCE_MIME_TYPES = [
  'application/pdf',
  'text/html',
] as const;

export type AllowedResourceMimeType =
  (typeof ALLOWED_RESOURCE_MIME_TYPES)[number];

/** File extensions matching {@link ALLOWED_RESOURCE_MIME_TYPES}. */
export const ALLOWED_RESOURCE_EXTENSIONS = ['.pdf', '.html', '.htm'] as const;

/**
 * Cover images an admin attaches to an Instagram card.
 *
 * Instagram has no keyless way to read a post's own image, so the card shows a
 * picture the coach uploads. These land in the public upload prefix like any
 * other public file.
 */
export const ALLOWED_COVER_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedCoverMimeType = (typeof ALLOWED_COVER_MIME_TYPES)[number];

export const ALLOWED_COVER_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
] as const;

/** Cover image size ceiling (5 MiB). */
export const MAX_COVER_SIZE_BYTES = 5 * 1024 * 1024;

/** Default page size for paginated list endpoints. */
export const DEFAULT_PAGE_SIZE = 20;

/** Hard ceiling for `pageSize`, protects the list endpoints. */
export const MAX_PAGE_SIZE = 100;
