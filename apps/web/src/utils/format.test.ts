import { describe, expect, it } from 'vitest';

import { formatBytes, formatDate, formatFileType } from './format';

describe('formatBytes', () => {
  it('keeps byte counts whole', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('steps up through the units', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('guards against invalid input', () => {
    expect(formatBytes(-1)).toBe('-');
    expect(formatBytes(Number.NaN)).toBe('-');
  });
});

describe('formatDate', () => {
  it('formats an ISO date in Turkish', () => {
    expect(formatDate('2024-08-27T18:30:00.000Z')).toContain('2024');
  });

  it('guards against invalid input', () => {
    expect(formatDate('not-a-date')).toBe('-');
  });
});

describe('formatFileType', () => {
  it('labels the supported types', () => {
    expect(formatFileType('application/pdf')).toBe('PDF');
    expect(formatFileType('text/html; charset=utf-8')).toBe('HTML');
  });

  it('falls back to the raw mime type', () => {
    expect(formatFileType('image/png')).toBe('image/png');
  });
});
