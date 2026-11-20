import type { SourceCode } from '../types/mevzuat';

export interface TextSegment {
  text: string;
  /** Atıf yapılan maddenin kimliği (ör. "gk-5"). */
  target?: string;
  /** Arama terimiyle eşleşen parça. */
  hit?: boolean;
}

// Numaranın önünde rakam ya da "/" olmamalı: "241/1 inci maddesi" fıkra atfıdır, 1 inci maddeye bağlanmaz.
const REF_RE =
  /(?:(Kanun|Yönetmeli[kğ])\p{L}*\s+)?(?<![\d/])(\d{1,3})(?:\/([A-Z]))?\s*(?:inci|ıncı|uncu|üncü|nci|ncı|ncu|ncü)\s+madde\p{L}*/gu;

/** Atfın mevzuat kodu: "Kanunun" GK; YYS metninde "Gümrük" sözcüğü olmadan geçen "Yönetmeliğin" YYS'nin kendisidir. */
function refCode(prefix: string | undefined, source: SourceCode, before: string): string {
  if (!prefix) return source.toLowerCase();
  if (prefix.startsWith('Kanun')) return 'gk';
  return source === 'YYS' && !/Gümrük\s+$/u.test(before) ? 'yys' : 'gy';
}

export function trLower(text: string): string {
  return text.toLocaleLowerCase('tr-TR');
}

/** "5 inci maddesi" gibi atıfları bulur; hedefi `known` içinde olanları bağlantıya çevirir. */
export function splitRefs(text: string, source: SourceCode, known: ReadonlySet<string>): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(REF_RE)) {
    const [whole, prefix, number, letter] = match;
    const start = match.index ?? 0;
    const code = refCode(prefix, source, text.slice(Math.max(0, start - 8), start));
    // YYS kimliklerinde harf küçüktür (yys-4-a); GK/GY kimlikleri olduğu gibi kalır (gk-5-A).
    const target = `${code}-${number}${letter ? `-${code === 'yys' ? letter.toLowerCase() : letter}` : ''}`;
    if (!code || !known.has(target)) continue;
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    segments.push({ text: whole, target });
    cursor = start + whole.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

/** Düz metni arama terimine göre böler (Türkçe büyük/küçük harf duyarsız). */
export function splitHits(text: string, term: string): TextSegment[] {
  const needle = trLower(term);
  if (!needle) return [{ text }];
  const haystack = trLower(text);
  // tr-TR küçültme uzunluğu değiştirebilir (İ -> i̇); o durumda vurgusuz bırak.
  if (haystack.length !== text.length) return [{ text }];
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, cursor)) {
    if (at > cursor) segments.push({ text: text.slice(cursor, at) });
    segments.push({ text: text.slice(at, at + needle.length), hit: true });
    cursor = at + needle.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
