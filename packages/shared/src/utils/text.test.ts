import { describe, expect, it } from 'vitest';

import { foldForSearch, transliterateTurkish } from './text.js';

describe('transliterateTurkish', () => {
  it('maps Turkish letters to ASCII while keeping case', () => {
    expect(transliterateTurkish('Gümrük İşlemleri ÇĞŞÖÜ')).toBe(
      'Gumruk Islemleri CGSOU',
    );
  });
});

describe('foldForSearch', () => {
  it('matches across the dotted/dotless i pair', () => {
    expect(foldForSearch('GIZLI')).toBe(foldForSearch('Gizli'));
    expect(foldForSearch('KILAVUZ')).toBe(foldForSearch('Kılavuz'));
  });

  it('strips remaining diacritics', () => {
    expect(foldForSearch('Tébliğ')).toBe('teblig');
  });

  it('leaves plain ASCII untouched apart from case', () => {
    expect(foldForSearch('Genelge 2024')).toBe('genelge 2024');
  });
});
