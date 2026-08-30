import { randomInt, randomUUID } from 'node:crypto';

import {
  DEFAULT_QUIZ_LENGTH,
  MAX_QUIZ_LENGTH,
} from '@gtip/shared';
import type {
  CreateQuizQuestionInput,
  PaginatedData,
  QuizAnswerInput,
  QuizAvailability,
  QuizQuestion,
  QuizQuestionPublic,
  QuizResult,
  QuizResultItem,
  QuizSession,
  StartQuizInput,
  UpdateQuizQuestionInput,
} from '@gtip/shared';

import { BadRequestError, NotFoundError } from '../errors/app-error.js';
import type {
  QuizQuestionQuery,
  QuizRepository,
} from '../repositories/quiz-repository.js';

/** How long a started exam can still be submitted. */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** Upper bound on live sessions, so an abandoned exam cannot grow memory. */
const MAX_LIVE_SESSIONS = 2000;

interface LiveSession {
  questionIds: string[];
  expiresAt: number;
}

/** Fisher–Yates using a cryptographic source, so draws are not predictable. */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = randomInt(index + 1);
    const current = result[index]!;

    result[index] = result[swapWith]!;
    result[swapWith] = current;
  }

  return result;
}

export function toPublicQuestion(question: QuizQuestion): QuizQuestionPublic {
  return {
    id: question.id,
    question: question.question,
    options: question.options,
    topic: question.topic,
    difficulty: question.difficulty,
  };
}

export interface QuizServiceOptions {
  questions: QuizRepository;
}

/**
 * Practice exams over a question bank.
 *
 * Nothing about a student is stored: an exam is a short-lived server-side
 * session holding only which questions were drawn. Grading happens here rather
 * than in the browser, so the answers never reach the page until the student
 * has submitted.
 */
export class QuizService {
  private readonly questions: QuizRepository;
  private readonly sessions = new Map<string, LiveSession>();

  constructor({ questions }: QuizServiceOptions) {
    this.questions = questions;
  }

  private pruneSessions(): void {
    const now = Date.now();

    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }

    // Under a flood, drop the oldest rather than refusing new exams.
    while (this.sessions.size >= MAX_LIVE_SESSIONS) {
      const oldest = this.sessions.keys().next();

      if (oldest.done) {
        break;
      }

      this.sessions.delete(oldest.value);
    }
  }

  /** Topics a student can pick from, with how many questions each holds. */
  public async getAvailability(): Promise<QuizAvailability> {
    const topics = await this.questions.topics();

    return {
      topics,
      totalQuestions: topics.reduce(
        (sum, topic) => sum + topic.questionCount,
        0,
      ),
    };
  }

  /** Draws a random exam matching the requested filters. */
  public async startQuiz(input: StartQuizInput): Promise<QuizSession> {
    const pool = await this.questions.findPublished({
      ...(input.topic ? { topic: input.topic } : {}),
      ...(input.difficulty ? { difficulty: input.difficulty } : {}),
    });

    if (pool.length === 0) {
      throw new BadRequestError(
        'Bu seçimlere uygun yayımlanmış soru bulunamadı.',
        { topic: input.topic, difficulty: input.difficulty },
      );
    }

    const requested = Math.min(
      input.questionCount ?? DEFAULT_QUIZ_LENGTH,
      MAX_QUIZ_LENGTH,
    );
    // Fewer questions than asked for is fine; an empty exam is not.
    const drawn = shuffle(pool).slice(0, Math.max(1, requested));

    this.pruneSessions();

    const sessionId = randomUUID();
    const expiresAt = Date.now() + SESSION_TTL_MS;

    this.sessions.set(sessionId, {
      questionIds: drawn.map((question) => question.id),
      expiresAt,
    });

    return {
      sessionId,
      questions: drawn.map(toPublicQuestion),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /** Grades a submitted exam and reveals the answers with explanations. */
  public async submitQuiz(
    sessionId: string,
    answers: QuizAnswerInput[],
  ): Promise<QuizResult> {
    const session = this.sessions.get(sessionId);

    if (!session || session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);

      throw new NotFoundError(
        'Sınav oturumu bulunamadı veya süresi doldu. Lütfen yeni bir test başlatın.',
      );
    }

    // One-shot: a session cannot be re-submitted for a better score.
    this.sessions.delete(sessionId);

    const questions = await this.questions.findManyByIds(session.questionIds);
    const byId = new Map(questions.map((question) => [question.id, question]));
    const selectionById = new Map(
      answers.map((answer) => [answer.questionId, answer.selectedIndex]),
    );

    const items: QuizResultItem[] = session.questionIds.flatMap((id) => {
      const question = byId.get(id);

      if (!question) {
        // The admin deleted the question mid-exam; drop it from the result
        // rather than grading against something that no longer exists.
        return [];
      }

      const rawSelection = selectionById.get(id);
      const selectedIndex =
        typeof rawSelection === 'number' &&
        rawSelection >= 0 &&
        rawSelection < question.options.length
          ? rawSelection
          : null;

      return [
        {
          questionId: question.id,
          question: question.question,
          options: question.options,
          selectedIndex,
          correctOptionIndex: question.correctOptionIndex,
          isCorrect: selectedIndex === question.correctOptionIndex,
          explanation: question.explanation,
          topic: question.topic,
        },
      ];
    });

    const correct = items.filter((item) => item.isCorrect).length;
    const blank = items.filter((item) => item.selectedIndex === null).length;

    return {
      total: items.length,
      correct,
      wrong: items.length - correct - blank,
      blank,
      scorePercent:
        items.length === 0 ? 0 : Math.round((correct / items.length) * 100),
      items,
    };
  }

  public async listQuestions(
    query: QuizQuestionQuery,
  ): Promise<PaginatedData<QuizQuestion>> {
    const { items, total } = await this.questions.list(query);

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  public async createQuestion(
    input: CreateQuizQuestionInput,
  ): Promise<QuizQuestion> {
    const now = new Date().toISOString();

    return this.questions.create({
      id: randomUUID(),
      question: input.question,
      options: input.options,
      correctOptionIndex: input.correctOptionIndex,
      explanation: input.explanation,
      topic: input.topic,
      difficulty: input.difficulty,
      isPublished: input.isPublished,
      createdAt: now,
      updatedAt: now,
    });
  }

  public async getQuestionOrFail(id: string): Promise<QuizQuestion> {
    const question = await this.questions.findById(id);

    if (!question) {
      throw new NotFoundError('Soru bulunamadı.');
    }

    return question;
  }

  public async updateQuestion(
    id: string,
    input: UpdateQuizQuestionInput,
  ): Promise<QuizQuestion> {
    const existing = await this.getQuestionOrFail(id);
    const options = input.options ?? existing.options;
    const correctOptionIndex =
      input.correctOptionIndex ?? existing.correctOptionIndex;

    // Shortening the options must not leave the answer pointing past the end.
    if (correctOptionIndex >= options.length) {
      throw new BadRequestError(
        'Doğru cevap, şık listesinin dışında kalıyor.',
        { options: options.length, correctOptionIndex },
      );
    }

    const updated = await this.questions.update(id, {
      ...input,
      updatedAt: new Date().toISOString(),
    });

    if (!updated) {
      throw new NotFoundError('Soru bulunamadı.');
    }

    return updated;
  }

  public async deleteQuestion(id: string): Promise<void> {
    await this.getQuestionOrFail(id);
    await this.questions.delete(id);
  }
}
