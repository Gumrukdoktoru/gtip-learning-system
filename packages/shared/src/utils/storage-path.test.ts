import { describe, expect, it } from 'vitest';

import {
  buildStorageKey,
  buildStoredFileName,
  extractUploadTimestamp,
  getUploadSegment,
  normalizeFolderPrefix,
  parseStorageKey,
  sanitizeFileName,
} from './storage-path.js';

describe('normalizeFolderPrefix', () => {
  it('keeps a well formed prefix untouched', () => {
    expect(normalizeFolderPrefix('69655/')).toBe('69655/');
  });

  it('appends the trailing slash', () => {
    expect(normalizeFolderPrefix('69655')).toBe('69655/');
  });

  it('strips leading slashes and collapses repeats', () => {
    expect(normalizeFolderPrefix('//69655//nested//')).toBe('69655/nested/');
  });

  it('returns an empty string for a missing or blank prefix', () => {
    expect(normalizeFolderPrefix(undefined)).toBe('');
    expect(normalizeFolderPrefix('   ')).toBe('');
    expect(normalizeFolderPrefix('/')).toBe('');
  });
});

describe('getUploadSegment', () => {
  it('maps visibility onto the documented segments', () => {
    expect(getUploadSegment('public')).toBe('public/uploads/');
    expect(getUploadSegment('private')).toBe('uploads/');
  });
});

describe('sanitizeFileName', () => {
  it('transliterates Turkish characters', () => {
    expect(sanitizeFileName('Gümrük Tebliği.pdf')).toBe('Gumruk-Tebligi.pdf');
  });

  it('drops directory traversal attempts', () => {
    expect(sanitizeFileName('../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(sanitizeFileName('C:\\Users\\admin\\rapor.pdf')).toBe('rapor.pdf');
  });

  it('lowercases the extension and collapses separators', () => {
    expect(sanitizeFileName('yillik   rapor__2024.PDF')).toBe(
      'yillik-rapor__2024.pdf',
    );
  });

  it('falls back to a placeholder when nothing usable remains', () => {
    expect(sanitizeFileName('   ***   ')).toBe('dosya');
  });

  it('truncates long names but keeps the extension', () => {
    const result = sanitizeFileName(`${'a'.repeat(400)}.pdf`);

    expect(result.endsWith('.pdf')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(180);
  });

  it('keeps a name without an extension intact', () => {
    expect(sanitizeFileName('LICENSE')).toBe('LICENSE');
  });
});

describe('buildStoredFileName', () => {
  it('prefixes the sanitized name with a unix timestamp', () => {
    const uploadedAt = new Date('2024-08-27T18:30:00.000Z');

    expect(buildStoredFileName('Gümrük Tebliği.pdf', uploadedAt)).toBe(
      '1724783400-Gumruk-Tebligi.pdf',
    );
  });
});

describe('buildStorageKey', () => {
  const storedFileName = '1724783400-tebligi.pdf';

  it('builds the public key documented in storage_usage', () => {
    expect(
      buildStorageKey({
        folderPrefix: '69655/',
        visibility: 'public',
        storedFileName,
      }),
    ).toBe('69655/public/uploads/1724783400-tebligi.pdf');
  });

  it('builds the private key documented in storage_usage', () => {
    expect(
      buildStorageKey({
        folderPrefix: '69655/',
        visibility: 'private',
        storedFileName,
      }),
    ).toBe('69655/uploads/1724783400-tebligi.pdf');
  });

  it('works without a configured prefix', () => {
    expect(
      buildStorageKey({
        folderPrefix: '',
        visibility: 'public',
        storedFileName,
      }),
    ).toBe('public/uploads/1724783400-tebligi.pdf');
  });
});

describe('parseStorageKey', () => {
  it('round-trips a public key', () => {
    const key = buildStorageKey({
      folderPrefix: '69655/',
      visibility: 'public',
      storedFileName: '1724783400-tebligi.pdf',
    });

    expect(parseStorageKey(key)).toEqual({
      folderPrefix: '69655/',
      visibility: 'public',
      storedFileName: '1724783400-tebligi.pdf',
    });
  });

  it('does not mistake a public key for a private one', () => {
    expect(parseStorageKey('69655/public/uploads/a.pdf')?.visibility).toBe(
      'public',
    );
    expect(parseStorageKey('69655/uploads/a.pdf')?.visibility).toBe('private');
  });

  it('returns null for keys outside the documented layout', () => {
    expect(parseStorageKey('69655/exports/a.pdf')).toBeNull();
  });
});

describe('extractUploadTimestamp', () => {
  it('reads the timestamp back', () => {
    expect(
      extractUploadTimestamp('1724783400-tebligi.pdf')?.toISOString(),
    ).toBe('2024-08-27T18:30:00.000Z');
  });

  it('returns null when there is no timestamp', () => {
    expect(extractUploadTimestamp('tebligi.pdf')).toBeNull();
  });
});
