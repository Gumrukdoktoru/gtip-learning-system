export type QuizDifficulty = 'kolay' | 'orta' | 'zor';

export const QUIZ_DIFFICULTIES: QuizDifficulty[] = ['kolay', 'orta', 'zor'];

export const QUIZ_DIFFICULTY_LABELS: Record<QuizDifficulty, string> = {
  kolay: 'Kolay',
  orta: 'Orta',
  zor: 'Zor',
};

/** Fewest and most options a question may offer. */
export const MIN_QUIZ_OPTIONS = 2;
export const MAX_QUIZ_OPTIONS = 6;

/** Question counts a practice exam may be started with. */
export const DEFAULT_QUIZ_LENGTH = 10;
export const MAX_QUIZ_LENGTH = 50;

/** Option letters shown to the student: A, B, C… */
export const QUIZ_OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/**
 * A question as the admin panel sees it — answer included.
 *
 * This shape is never sent to a student: the public list drops
 * `correctOptionIndex` and `explanation` so the answers cannot be read out of
 * the browser's network tab.
 */
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  /** Free-text subject, e.g. "Gümrük Kanunu". Grouped on the start screen. */
  topic: string;
  difficulty: QuizDifficulty;
  /** Unpublished questions stay out of every exam. */
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A question mid-exam: no answer, no explanation. */
export interface QuizQuestionPublic {
  id: string;
  question: string;
  options: string[];
  topic: string;
  difficulty: QuizDifficulty;
}

export interface QuizTopic {
  topic: string;
  /** Published questions available under this topic. */
  questionCount: number;
}

export interface QuizAvailability {
  topics: QuizTopic[];
  totalQuestions: number;
}

export interface StartQuizInput {
  topic?: string;
  difficulty?: QuizDifficulty;
  questionCount?: number;
}

export interface QuizSession {
  sessionId: string;
  questions: QuizQuestionPublic[];
  /** ISO timestamp after which the session can no longer be graded. */
  expiresAt: string;
}

export interface QuizAnswerInput {
  questionId: string;
  /** Null when the student left the question blank. */
  selectedIndex: number | null;
}

export interface SubmitQuizInput {
  answers: QuizAnswerInput[];
}

export interface QuizResultItem {
  questionId: string;
  question: string;
  options: string[];
  selectedIndex: number | null;
  correctOptionIndex: number;
  isCorrect: boolean;
  explanation: string;
  topic: string;
}

export interface QuizResult {
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  /** Correct answers as a percentage, rounded to the nearest whole number. */
  scorePercent: number;
  items: QuizResultItem[];
}

export interface CreateQuizQuestionInput {
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  topic: string;
  difficulty: QuizDifficulty;
  isPublished: boolean;
}

export type UpdateQuizQuestionInput = Partial<CreateQuizQuestionInput>;

export interface QuizQuestionListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  topic?: string;
  difficulty?: QuizDifficulty;
}
