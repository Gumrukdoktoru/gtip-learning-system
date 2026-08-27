import {
  MAX_STORED_FILE_NAME_LENGTH,
  PRIVATE_UPLOAD_SEGMENT,
  PUBLIC_UPLOAD_SEGMENT,
} from '../constants/storage.js';
import type { ResourceVisibility } from '../types/resource.js';
import { transliterateTurkish } from './text.js';

/**
 * Normalises AWS_FOLDER_PREFIX into `something/` (or an empty string).
 *
 * Leading slashes are dropped because object keys are relative to the bucket
 * root, and repeated slashes are collapsed so keys stay comparable.
 */
export function normalizeFolderPrefix(prefix: string | undefined): string {
  if (!prefix) {
    return '';
  }

  const trimmed = prefix.trim().replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  const withoutTrailing = trimmed.replace(/\/+$/, '');

  return withoutTrailing.length === 0 ? '' : `${withoutTrailing}/`;
}

/** Returns the upload segment used for the given visibility. */
export function getUploadSegment(visibility: ResourceVisibility): string {
  return visibility === 'public'
    ? PUBLIC_UPLOAD_SEGMENT
    : PRIVATE_UPLOAD_SEGMENT;
}

function splitExtension(fileName: string): { base: string; extension: string } {
  const dotIndex = fileName.lastIndexOf('.');

  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return { base: fileName, extension: '' };
  }

  return {
    base: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex).toLowerCase(),
  };
}

/**
 * Makes a user supplied file name safe to use inside an object key.
 *
 * Path separators are stripped (so `../` can never escape the prefix), Turkish
 * characters are transliterated, and everything outside `[A-Za-z0-9._-]` is
 * folded into a single dash. The extension is preserved when truncating.
 */
export function sanitizeFileName(originalFileName: string): string {
  const baseName = originalFileName.split(/[\\/]/).pop() ?? '';
  const { base, extension } = splitExtension(transliterateTurkish(baseName.trim()));

  const safeBase = base
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '');

  const safeExtension = extension.replace(/[^A-Za-z0-9.]+/g, '');
  const fallbackBase = safeBase.length === 0 ? 'dosya' : safeBase;
  const maxBaseLength = Math.max(
    1,
    MAX_STORED_FILE_NAME_LENGTH - safeExtension.length,
  );

  return `${fallbackBase.slice(0, maxBaseLength)}${safeExtension}`;
}

/**
 * Builds the `{unixTimestamp}-{originalFileName}` name written to storage.
 *
 * The timestamp is in seconds and exists purely to keep concurrent uploads of
 * the same document from overwriting each other.
 */
export function buildStoredFileName(
  originalFileName: string,
  uploadedAt: Date = new Date(),
): string {
  const unixTimestamp = Math.floor(uploadedAt.getTime() / 1000);

  return `${unixTimestamp}-${sanitizeFileName(originalFileName)}`;
}

export interface BuildStorageKeyParams {
  folderPrefix: string | undefined;
  visibility: ResourceVisibility;
  storedFileName: string;
}

/** Assembles the full object key for an already-named stored file. */
export function buildStorageKey({
  folderPrefix,
  visibility,
  storedFileName,
}: BuildStorageKeyParams): string {
  return `${normalizeFolderPrefix(folderPrefix)}${getUploadSegment(visibility)}${storedFileName}`;
}

export interface ParsedStorageKey {
  folderPrefix: string;
  visibility: ResourceVisibility;
  storedFileName: string;
}

/**
 * Inverse of {@link buildStorageKey}. Returns `null` when the key does not
 * follow the documented layout, so callers can reject foreign keys instead of
 * guessing at their visibility.
 */
export function parseStorageKey(storageKey: string): ParsedStorageKey | null {
  const publicIndex = storageKey.indexOf(PUBLIC_UPLOAD_SEGMENT);

  if (publicIndex !== -1) {
    return {
      folderPrefix: storageKey.slice(0, publicIndex),
      visibility: 'public',
      storedFileName: storageKey.slice(
        publicIndex + PUBLIC_UPLOAD_SEGMENT.length,
      ),
    };
  }

  const privateIndex = storageKey.indexOf(PRIVATE_UPLOAD_SEGMENT);

  if (privateIndex === -1) {
    return null;
  }

  return {
    folderPrefix: storageKey.slice(0, privateIndex),
    visibility: 'private',
    storedFileName: storageKey.slice(
      privateIndex + PRIVATE_UPLOAD_SEGMENT.length,
    ),
  };
}

/** Reads the upload timestamp back out of a stored file name. */
export function extractUploadTimestamp(storedFileName: string): Date | null {
  const match = /^(\d{1,15})-/.exec(storedFileName);

  if (!match?.[1]) {
    return null;
  }

  return new Date(Number(match[1]) * 1000);
}
