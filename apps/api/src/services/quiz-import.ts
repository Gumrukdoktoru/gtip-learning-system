import { foldForSearch, QUIZ_OPTION_LETTERS } from '@gtip/shared';
import type { QuizDifficulty } from '@gtip/shared';

export interface ParsedQuizQuestion {
  /** 1-based line in the source file where the question started. */
  lineNumber: number;
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

/** `1.` `1)` `1-` `Soru 3:` — the line that opens a question. */
const QUESTION_START = /^\s*(?:soru\s*)?(\d{1,3})\s*[.)\-:]\s*(.*)$/i;

/** `A)` `(A)` `A.` `A-` `A:` optionally behind a bullet. */
const OPTION_LINE = new RegExp(
  `^\\s*(?:[*\\-•]\\s*)?\\(?([${LETTERS}${LETTERS.toLowerCase()}])\\)?\\s*[.)\\-:]\\s*(.+)$`,
);

/** A label line such as `Cevap: B` or `Açıklama: …`, split into key and value. */
const LABEL_LINE = /^\s*([^:]{2,30})\s*[:\-–]\s*(.*)$/;

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
  'explanation',
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

/** Drops markdown emphasis and stray bullets from a fragment of text. */
function clean(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|\s)\*(\S.*?\S|\S)\*(?=\s|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** True when the fragment was wrapped in markdown bold. */
function isBold(text: string): boolean {
  return /\*\*[^*]+\*\*/.test(text) || /__[^_]+__/.test(text);
}

/** Marks such as `(doğru)`, `✓` or a trailing `*` next to the right option. */
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
    .replace(/\[\s*[xX]\s*\]/g, '')
    .trim();
}

function letterToIndex(letter: string): number {
  return LETTERS.indexOf(letter.toUpperCase());
}

interface Draft {
  lineNumber: number;
  questionLines: string[];
  options: { text: string; marked: boolean }[];
  answerLetter: string | null;
  explanationLines: string[];
  topic: string | null;
  difficulty: QuizDifficulty | null;
}

function newDraft(lineNumber: number, first: string): Draft {
  return {
    lineNumber,
    questionLines: first.trim().length > 0 ? [first] : [],
    options: [],
    answerLetter: null,
    explanationLines: [],
    topic: null,
    difficulty: null,
  };
}

function finalize(draft: Draft, fallback: {
  topic: string | null;
  difficulty: QuizDifficulty | null;
}): ParsedQuizQuestion {
  const question = clean(draft.questionLines.join(' '));
  const options = draft.options.map((option) => clean(option.text));
  const errors: string[] = [];

  let correctOptionIndex: number | null = null;

  if (draft.answerLetter) {
    const index = letterToIndex(draft.answerLetter);

    if (index >= 0 && index < options.length) {
      correctOptionIndex = index;
    } else {
      errors.push(
        `Cevap olarak "${draft.answerLetter}" yazılmış ama böyle bir şık yok.`,
      );
    }
  } else {
    // No explicit answer line: fall back to the option the author highlighted.
    const marked = draft.options
      .map((option, index) => ({ option, index }))
      .filter((entry) => entry.option.marked);

    if (marked.length === 1) {
      correctOptionIndex = marked[0]!.index;
    } else if (marked.length > 1) {
      errors.push('Birden fazla şık doğru olarak işaretlenmiş.');
    } else {
      errors.push('Doğru cevap bulunamadı (örn. "Cevap: B" satırı ekleyin).');
    }
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

  return {
    lineNumber: draft.lineNumber,
    question,
    options,
    correctOptionIndex,
    explanation: clean(draft.explanationLines.join(' ')),
    topic: draft.topic ?? fallback.topic,
    difficulty: draft.difficulty ?? fallback.difficulty,
    errors,
  };
}

/**
 * Reads a question bank written as Markdown or plain text.
 *
 * The format is deliberately forgiving, because these files are written by
 * hand: questions open with a number, options are lettered, and the answer is
 * either a `Cevap: B` line or the option the author highlighted (bold, a tick
 * or `(doğru)`). `Konu:` and `Zorluk:` apply to the question they sit in, or
 * to everything that follows when they stand alone between questions — as does
 * a Markdown heading, which is treated as a topic.
 *
 * Nothing is rejected outright: a question that cannot be imported comes back
 * with its own `errors`, so the admin sees exactly which one to fix.
 */
export function parseQuizDocument(source: string): ParsedQuizQuestion[] {
  const lines = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  const questions: ParsedQuizQuestion[] = [];
  const fallback: { topic: string | null; difficulty: QuizDifficulty | null } =
    { topic: null, difficulty: null };

  let draft: Draft | null = null;
  let inExplanation = false;

  const flush = (): void => {
    if (draft) {
      questions.push(finalize(draft, fallback));
      draft = null;
    }

    inExplanation = false;
  };

  for (const [index, raw] of lines.entries()) {
    const line = raw.trimEnd();
    const lineNumber = index + 1;

    if (line.trim().length === 0) {
      inExplanation = false;
      continue;
    }

    // A heading is structural: it closes whatever question was open and sets
    // the topic for everything below it.
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);

    if (heading?.[1]) {
      flush();
      fallback.topic = clean(heading[1]);
      continue;
    }

    const questionStart = QUESTION_START.exec(line);

    if (questionStart) {
      flush();
      draft = newDraft(lineNumber, questionStart[2] ?? '');
      continue;
    }

    const label = LABEL_LINE.exec(line);
    const key = label?.[1] ? foldForSearch(label[1]).trim() : '';
    const value = label?.[2]?.trim() ?? '';

    if (label && ANSWER_KEYS.has(key)) {
      const letter = /^\(?([A-Za-z])\)?/.exec(value)?.[1];

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
      const level = DIFFICULTY_VALUES[foldForSearch(value).trim()];

      if (level && draft) {
        draft.difficulty = level;
      } else if (level) {
        fallback.difficulty = level;
      }

      inExplanation = false;
      continue;
    }

    // A whole option can be wrapped in bold (`**B) …**`), so emphasis is
    // noted first and then removed before the letter is matched.
    const bolded = isBold(line);
    const option = OPTION_LINE.exec(line.replace(/\*\*|__/g, ''));

    if (draft && option?.[1] && option[2]) {
      const text = option[2];

      draft.options.push({
        text: stripCorrectMark(text),
        marked: bolded || hasCorrectMark(text),
      });
      inExplanation = false;
      continue;
    }

    if (draft && inExplanation) {
      draft.explanationLines.push(line.trim());
      continue;
    }

    if (draft && draft.options.length === 0) {
      // Still reading a question that runs over several lines.
      draft.questionLines.push(line.trim());
    }
  }

  flush();

  return questions;
}
