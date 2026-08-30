import { foldForSearch, QUIZ_OPTION_LETTERS } from '@gtip/shared';
import type { QuizDifficulty } from '@gtip/shared';

export interface ParsedQuizQuestion {
  /** 1-based line in the source file where the question started. */
  lineNumber: number;
  /** The number the document gave it, used to match a separate answer key. */
  number: number | null;
  question: string;
  options: string[];
  correctOptionIndex: number | null;
  explanation: string;
  topic: string | null;
  difficulty: QuizDifficulty | null;
  /** Reasons this question cannot be imported as it stands. */
  errors: string[];
}

const LETTERS = QUIZ_OPTION_LETTERS.join('');
const LETTER_CLASS = `${LETTERS}${LETTERS.toLowerCase()}`;

/** `Soru 3` / `SORU 3` — the keyword form needs no separator after the number. */
const KEYWORD_QUESTION = /^\s*(?:soru|question)\s*(\d{1,3})\b\s*[.)\-:–—]?\s*(.*)$/i;

/** `1.` `1)` `1-` — a bare number must be followed by a separator. */
const NUMBERED_QUESTION = /^\s*(\d{1,3})\s*[.)\-:]\s*(.*)$/;

/** `A)` `(A)` `A.` `A-` — the text may follow with or without a space. */
const OPTION_LINE = new RegExp(
  `^\\s*(?:[*\\-•]\\s*)?\\(?([${LETTER_CLASS}])\\s*[).\\-:]\\s*(\\S.*)$`,
);

/** A `Key: value` line; the key may carry an emoji or a tick. */
const LABEL_LINE = /^\s*([^:]{2,40})\s*[:]\s*(.*)$/;

/** `Doğru Cevap: D`, wherever it sits on the line. */
const ANSWER_ANYWHERE = new RegExp(
  `(?:do[gğ]ru\\s*)?(?:cevap|yan[ıi]t|answer)\\s*[:\\-–]?\\s*\\(?([${LETTER_CLASS}])\\)?(?![\\wçğıöşü])`,
  'i',
);

/** `SORU 12` anywhere on a line, for matching an answer key to a question. */
const QUESTION_NUMBER_ANYWHERE = /(?:soru|question)\s*(\d{1,3})\b/i;

const ANSWER_KEYS = new Set([
  'cevap',
  'dogru cevap',
  'dogru secenek',
  'dogru sik',
  'yanit',
  'dogru yanit',
  'dogru',
  'answer',
  'correct answer',
]);

const EXPLANATION_KEYS = new Set([
  'aciklama',
  'izah',
  'gerekce',
  'not',
  'cozum',
  'explanation',
]);

/** Extra labelled notes worth keeping alongside the explanation. */
const EXTRA_NOTE_KEYS = new Set([
  'tuzak nokta',
  'tuzak',
  'yasal dayanak',
  'dayanak',
  'kaynak',
  'ipucu',
]);

const TOPIC_KEYS = new Set(['konu', 'bolum', 'topic', 'subject']);

const DIFFICULTY_KEYS = new Set(['zorluk', 'seviye', 'difficulty', 'level']);

const DIFFICULTY_VALUES: Record<string, QuizDifficulty> = {
  kolay: 'kolay',
  orta: 'orta',
  zor: 'zor',
  easy: 'kolay',
  medium: 'orta',
  hard: 'zor',
  baslangic: 'kolay',
  ileri: 'zor',
};

/** Removes markdown emphasis so structure can be matched on the bare text. */
function stripEmphasis(text: string): string {
  return text.replace(/\*\*|__/g, '');
}

function clean(text: string): string {
  return stripEmphasis(text)
    .replace(/(^|\s)\*(\S.*?\S|\S)\*(?=\s|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isBold(text: string): boolean {
  return /\*\*[^*]+\*\*/.test(text) || /__[^_]+__/.test(text);
}

/** The label as a reader should see it: emoji and ticks trimmed off. */
function labelText(key: string): string {
  return clean(key).replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

/** Reduces a label to bare letters so emoji and ticks do not defeat it. */
function normalizeKey(key: string): string {
  return foldForSearch(stripEmphasis(key))
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasCorrectMark(text: string): boolean {
  const folded = foldForSearch(text);

  return (
    /[✓✔☑]/.test(text) ||
    /\(\s*(dogru|correct|x)\s*\)/.test(folded) ||
    /\[\s*x\s*\]/.test(folded)
  );
}

function stripCorrectMark(text: string): string {
  return text
    .replace(/[✓✔☑]/g, '')
    .replace(/\(\s*(?:doğru|dogru|correct|x|X)\s*\)/gi, '')
    .trim();
}

function letterToIndex(letter: string): number {
  return LETTERS.indexOf(letter.toUpperCase());
}

/** True when a line opens a list item rather than continuing a sentence. */
function startsListItem(text: string): boolean {
  return /^\s*(?:[IVX]{1,4}[.)]|\d{1,2}[.)]|[-*•])\s/.test(text);
}

/** `**SORU 1**  **Kısa başlık**` — a caption typeset beside the number. */
const CAPTIONED_QUESTION = /^\s*\*\*[^*]*\*\*\s*\*\*(.+?)\*\*\s*$/;

interface Draft {
  lineNumber: number;
  number: number | null;
  questionLines: string[];
  /** Set after a caption, so the stem below it starts a new line. */
  breakBeforeNext: boolean;
  options: { text: string; marked: boolean }[];
  answerLetter: string | null;
  explanationLines: string[];
  topic: string | null;
  difficulty: QuizDifficulty | null;
}

/** Answer and notes declared away from the question, in a solutions section. */
interface AnswerKeyEntry {
  letter: string;
  notes: string[];
}

function finalize(
  draft: Draft,
  fallback: { topic: string | null; difficulty: QuizDifficulty | null },
  answerKey: Map<number, AnswerKeyEntry>,
): ParsedQuizQuestion {
  const question = draft.questionLines.join('\n').trim();
  const options = draft.options.map((option) => clean(option.text));
  const errors: string[] = [];
  const keyed = draft.number === null ? undefined : answerKey.get(draft.number);

  // Styling is not a signal when every option carries it.
  const marked = draft.options.every((option) => option.marked)
    ? []
    : draft.options
        .map((option, index) => ({ option, index }))
        .filter((entry) => entry.option.marked);

  const letter = draft.answerLetter ?? keyed?.letter ?? null;

  let correctOptionIndex: number | null = null;

  if (letter) {
    const index = letterToIndex(letter);

    if (index >= 0 && index < options.length) {
      correctOptionIndex = index;
    } else {
      errors.push(`Cevap olarak "${letter}" yazılmış ama böyle bir şık yok.`);
    }
  } else if (marked.length === 1) {
    correctOptionIndex = marked[0]!.index;
  } else if (marked.length > 1) {
    errors.push('Birden fazla şık doğru olarak işaretlenmiş.');
  } else {
    errors.push('Doğru cevap bulunamadı (örn. "Cevap: B" satırı ekleyin).');
  }

  if (question.length < 10) {
    errors.push('Soru metni çok kısa veya okunamadı.');
  }

  if (options.length < 2) {
    errors.push('En az iki şık gerekli.');
  }

  if (options.length > QUIZ_OPTION_LETTERS.length) {
    errors.push(`En fazla ${QUIZ_OPTION_LETTERS.length} şık olabilir.`);
  }

  const explanation = [
    ...draft.explanationLines.map((line) => clean(line)),
    ...(keyed?.notes ?? []),
  ]
    .filter((line) => line.length > 0)
    .join('\n');

  return {
    lineNumber: draft.lineNumber,
    number: draft.number,
    question,
    options,
    correctOptionIndex,
    explanation,
    topic: draft.topic ?? fallback.topic,
    difficulty: draft.difficulty ?? fallback.difficulty,
    errors,
  };
}

/**
 * Collects answers written away from their questions.
 *
 * Real question banks often keep a solutions section at the back — a line such
 * as `SORU 4 — Doğru Cevap: A` followed by `Açıklama:` — so the answer is
 * matched back to the question by its number. Notes like `Yasal Dayanak` are
 * kept too: they are exactly what a student wants to see after answering.
 */
function collectAnswerKey(lines: string[]): Map<number, AnswerKeyEntry> {
  const entries = new Map<number, AnswerKeyEntry>();
  let current: AnswerKeyEntry | null = null;

  for (const raw of lines) {
    const line = stripEmphasis(raw).trim();

    if (line.length === 0) {
      continue;
    }

    const numbered = QUESTION_NUMBER_ANYWHERE.exec(line);
    const answer = ANSWER_ANYWHERE.exec(line);

    if (numbered?.[1] && answer?.[1]) {
      current = { letter: answer[1], notes: [] };
      entries.set(Number(numbered[1]), current);
      continue;
    }

    // A bare `SORU 5` heading ends the previous entry without opening one.
    if (numbered?.[1] && !answer) {
      current = null;
      continue;
    }

    if (!current) {
      continue;
    }

    const label = LABEL_LINE.exec(line);
    const key = label?.[1] ? normalizeKey(label[1]) : '';

    if (label && (EXPLANATION_KEYS.has(key) || EXTRA_NOTE_KEYS.has(key))) {
      const value = label[2]?.trim() ?? '';
      const prefix = EXPLANATION_KEYS.has(key) ? '' : `${labelText(label[1]!)}: `;

      if (value.length > 0) {
        current.notes.push(`${prefix}${value}`);
      }
    }
  }

  return entries;
}

/**
 * Reads a question bank written as Markdown, plain text or an extracted Word
 * document.
 *
 * The format is deliberately forgiving, because these files are written by
 * hand: questions open with a number or `SORU n`, options are lettered, and
 * the answer is either beside the question (`Cevap: B`, a bold or ticked
 * option) or in a separate solutions section keyed by question number.
 * `Konu:` and `Zorluk:` apply to the question they sit in, or to everything
 * that follows when they stand alone — as does a Markdown heading.
 *
 * Nothing is rejected outright: a question that cannot be imported comes back
 * with its own `errors`, so the admin sees exactly which one to fix.
 */
export function parseQuizDocument(source: string): ParsedQuizQuestion[] {
  const lines = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  const answerKey = collectAnswerKey(lines);
  const questions: ParsedQuizQuestion[] = [];
  const fallback: { topic: string | null; difficulty: QuizDifficulty | null } =
    { topic: null, difficulty: null };

  let draft: Draft | null = null;
  let inExplanation = false;

  const flush = (): void => {
    if (draft) {
      questions.push(finalize(draft, fallback, answerKey));
      draft = null;
    }

    inExplanation = false;
  };

  /** Appends to the stem, unwrapping a sentence that was split over lines. */
  const appendQuestionLine = (text: string, forceBreak: boolean): void => {
    if (!draft) {
      return;
    }

    const previous = draft.questionLines[draft.questionLines.length - 1];
    const mustBreak = draft.breakBeforeNext;

    draft.breakBeforeNext = false;

    if (
      previous === undefined ||
      mustBreak ||
      forceBreak ||
      startsListItem(text) ||
      /[.?!:;]$/.test(previous)
    ) {
      draft.questionLines.push(text);

      return;
    }

    draft.questionLines[draft.questionLines.length - 1] = `${previous} ${text}`;
  };

  for (const [index, raw] of lines.entries()) {
    const line = raw.trimEnd();
    const bare = stripEmphasis(line).trim();
    const lineNumber = index + 1;

    if (bare.length === 0) {
      inExplanation = false;
      continue;
    }

    // A solutions-section line carries both a question number and an answer;
    // it was read into the answer key already and must not open a question.
    if (QUESTION_NUMBER_ANYWHERE.test(bare) && ANSWER_ANYWHERE.test(bare)) {
      flush();
      continue;
    }

    const heading = /^\s*#{1,6}\s+(.*)$/.exec(bare);

    if (heading?.[1]) {
      flush();
      fallback.topic = clean(heading[1]);
      continue;
    }

    const start = KEYWORD_QUESTION.exec(bare) ?? NUMBERED_QUESTION.exec(bare);

    if (start?.[1]) {
      flush();

      const rest = start[2]?.trim() ?? '';

      draft = {
        lineNumber,
        number: Number(start[1]),
        questionLines: [],
        breakBeforeNext: false,
        options: [],
        answerLetter: null,
        explanationLines: [],
        topic: null,
        difficulty: null,
      };

      if (rest.length > 0) {
        draft.questionLines.push(clean(rest));
        // A caption typeset beside the number is a label, not the opening of
        // the sentence below it, so the stem starts on its own line.
        draft.breakBeforeNext = CAPTIONED_QUESTION.test(line);
      }

      continue;
    }

    const label = LABEL_LINE.exec(bare);
    const key = label?.[1] ? normalizeKey(label[1]) : '';
    const value = label?.[2]?.trim() ?? '';

    if (label && ANSWER_KEYS.has(key)) {
      const letter = new RegExp(`^\\(?([${LETTER_CLASS}])\\)?`).exec(value)?.[1];

      if (draft && letter) {
        draft.answerLetter = letter;
      }

      inExplanation = false;
      continue;
    }

    if (label && EXPLANATION_KEYS.has(key)) {
      if (draft) {
        draft.explanationLines.push(value);
        inExplanation = true;
      }

      continue;
    }

    if (label && EXTRA_NOTE_KEYS.has(key)) {
      if (draft && value.length > 0) {
        draft.explanationLines.push(`${labelText(label[1]!)}: ${value}`);
      }

      inExplanation = false;
      continue;
    }

    if (label && TOPIC_KEYS.has(key)) {
      if (draft) {
        draft.topic = clean(value);
      } else {
        fallback.topic = clean(value);
      }

      inExplanation = false;
      continue;
    }

    if (label && DIFFICULTY_KEYS.has(key)) {
      const level = DIFFICULTY_VALUES[normalizeKey(value)];

      if (level && draft) {
        draft.difficulty = level;
      } else if (level) {
        fallback.difficulty = level;
      }

      inExplanation = false;
      continue;
    }

    const option = OPTION_LINE.exec(bare);

    if (draft && option?.[1] && option[2]) {
      draft.options.push({
        text: stripCorrectMark(option[2]),
        marked: isBold(line) || hasCorrectMark(option[2]),
      });
      inExplanation = false;
      continue;
    }

    if (draft && inExplanation) {
      draft.explanationLines.push(bare);
      continue;
    }

    if (draft && draft.options.length === 0) {
      // Still reading a stem that runs over several lines.
      appendQuestionLine(clean(line), isBold(line));
    }
  }

  flush();

  return questions;
}
