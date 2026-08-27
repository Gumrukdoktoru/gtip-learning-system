const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Human readable file size, e.g. `1,4 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '-';
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = new Intl.NumberFormat('tr-TR', {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(value);

  return `${formatted} ${BYTE_UNITS[unitIndex]}`;
}

/** Formats an ISO timestamp as `27 Ağustos 2024`. */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Short label for the file type shown on a resource card. */
export function formatFileType(mimeType: string): string {
  if (mimeType.startsWith('application/pdf')) {
    return 'PDF';
  }

  if (mimeType.startsWith('text/html')) {
    return 'HTML';
  }

  return mimeType;
}
