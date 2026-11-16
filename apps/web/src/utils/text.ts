import type { SourceCode } from '../types/mevzuat';

export interface TextSegment {
  text: string;
  /** Atıf yapılan maddenin kimliği (ör. "gk-5"). */
  target?: string;
  /** Arama terimiyle eşleşen parça. */
  hit?: boolean;
}

const REF_RE =
  /(?:(Kanun|Yönetmeli[kğ])\p{L}*\s+)?(\d{1,3})(?:\/([A-Z]))?\s*(?:inci|ıncı|uncu|üncü|nci|ncı|ncu|ncü)\s+madde\p{L}*/gu;

export function trLower(text: string): string {
  return text.toLocaleLowerCase('tr-TR');
}

/** "5 inci maddesi" gibi atıfları bulur; hedefi `known` içinde olanları bağlantıya çevirir. */
export function splitRefs(text: string, source: SourceCode, known: ReadonlySet<string>): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(REF_RE)) {
    const [whole, prefix, number, letter] = match;
    const code = prefix ? (prefix.startsWith('Kanun') ? 'gk' : 'gy') : source.toLowerCase();
    const target = `${code}-${number}${letter ? `-${letter}` : ''}`;
    if (!code || !known.has(target)) continue;
    const start = match.index ?? 0;
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
