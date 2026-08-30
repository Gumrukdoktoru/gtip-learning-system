import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';

import { BadRequestError } from '../errors/app-error.js';

interface WordRun {
  'w:rPr'?: { 'w:b'?: unknown };
  'w:t'?: unknown;
  'w:tab'?: unknown;
  'w:br'?: unknown;
}

interface WordParagraph {
  'w:r'?: WordRun | WordRun[];
  'w:hyperlink'?: { 'w:r'?: WordRun | WordRun[] } | { 'w:r'?: WordRun | WordRun[] }[];
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function runText(run: WordRun): string {
  const value = run['w:t'];

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (value && typeof value === 'object' && '#text' in value) {
    return String((value as { '#text': unknown })['#text']);
  }

  return '';
}

/** Collects the runs of one paragraph, including those inside hyperlinks. */
function paragraphRuns(paragraph: WordParagraph): WordRun[] {
  return [
    ...toArray(paragraph['w:r']),
    ...toArray(paragraph['w:hyperlink']).flatMap((link) =>
      toArray(link['w:r']),
    ),
  ];
}

/**
 * Extracts a .docx as Markdown-ish text.
 *
 * Only what the question parser needs is preserved: one line per paragraph,
 * and bold runs wrapped in `**` so an answer highlighted in Word is still
 * recognisable as the correct option.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new BadRequestError(
      'Word dosyası okunamadı. Dosyanın .docx olduğundan emin olun.',
    );
  }

  const document = zip.file('word/document.xml');

  if (!document) {
    throw new BadRequestError(
      'Word dosyasında metin bulunamadı. Eski .doc biçimi desteklenmiyor; .docx olarak kaydedin.',
    );
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // A run holding only a space must not collapse away.
    trimValues: false,
  });
  const parsed = parser.parse(await document.async('string')) as {
    'w:document'?: { 'w:body'?: { 'w:p'?: WordParagraph | WordParagraph[] } };
  };

  const paragraphs = toArray(parsed['w:document']?.['w:body']?.['w:p']);

  return paragraphs
    .map((paragraph) =>
      paragraphRuns(paragraph)
        .map((run) => {
          const text = runText(run);

          if (text.trim().length === 0) {
            // A run holding only spaces still separates the words around it.
            return text;
          }

          const bold = run['w:rPr'] !== undefined && 'w:b' in run['w:rPr'];

          if (!bold) {
            return text;
          }

          // Emphasis wraps the words, not the spacing around them: Word
          // routinely puts the gap after a heading inside the bold run, and
          // swallowing it would glue "SORU 1" to the text that follows.
          const [, before = '', core = '', after = ''] =
            /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];

          return `${before}**${core}**${after}`;
        })
        .join('')
        .trim(),
    )
    .join('\n');
}
