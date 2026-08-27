/** Turkish letters that have no meaning to a case-insensitive ASCII search. */
export const TURKISH_CHAR_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'C',
  ğ: 'g',
  Ğ: 'G',
  ı: 'i',
  İ: 'I',
  ö: 'o',
  Ö: 'O',
  ş: 's',
  Ş: 'S',
  ü: 'u',
  Ü: 'U',
};

/** Replaces Turkish specific letters with their ASCII counterparts. */
export function transliterateTurkish(value: string): string {
  return value.replace(
    /[çÇğĞıİöÖşŞüÜ]/g,
    (char) => TURKISH_CHAR_MAP[char] ?? char,
  );
}

/**
 * Normalises text for search comparisons.
 *
 * Turkish has two dotted/dotless `i` pairs, so a plain `toLocaleLowerCase`
 * makes `GIZLI` and `Gizli` different strings. Folding to ASCII first means a
 * visitor typing `kilavuz` also finds `Kılavuz`, which is what the resources
 * page needs.
 */
export function foldForSearch(value: string): string {
  return transliterateTurkish(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
