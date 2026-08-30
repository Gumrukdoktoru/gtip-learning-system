import { foldForSearch } from '@gtip/shared';
import type { QuizDifficulty, QuizQuestion, QuizTopic } from '@gtip/shared';

import { JsonStore } from './json-store.js';

export interface QuizQuestionQuery {
  page: number;
  pageSize: number;
  search?: string;
  topic?: string;
  difficulty?: QuizDifficulty;
}

export interface QuizQuestionPage {
  items: QuizQuestion[];
  total: number;
}

export interface DrawQuery {
  topic?: string;
  difficulty?: QuizDifficulty;
}

export interface QuizRepository {
  list(query: QuizQuestionQuery): Promise<QuizQuestionPage>;
  /** Every question, published or not; used to spot repeat imports. */
  all(): Promise<QuizQuestion[]>;
  findById(id: string): Promise<QuizQuestion | null>;
  findManyByIds(ids: string[]): Promise<QuizQuestion[]>;
  /** Every published question matching the filter, for drawing an exam. */
  findPublished(query: DrawQuery): Promise<QuizQuestion[]>;
  topics(): Promise<QuizTopic[]>;
  create(question: QuizQuestion): Promise<QuizQuestion>;
  update(id: string, patch: Partial<QuizQuestion>): Promise<QuizQuestion | null>;
  delete(id: string): Promise<boolean>;
}

function matchesSearch(question: QuizQuestion, needle: string): boolean {
  return foldForSearch(
    [question.question, question.explanation, question.topic].join(' '),
  ).includes(needle);
}

export class JsonQuizRepository implements QuizRepository {
  private readonly store: JsonStore<QuizQuestion>;

  constructor(filePath: string | null) {
    this.store = new JsonStore<QuizQuestion>(filePath);
  }

  public async list({
    page,
    pageSize,
    search,
    topic,
    difficulty,
  }: QuizQuestionQuery): Promise<QuizQuestionPage> {
    const needle = search?.trim() ? foldForSearch(search.trim()) : undefined;
    const filtered = (await this.store.all())
      .filter((question) => (topic ? question.topic === topic : true))
      .filter((question) =>
        difficulty ? question.difficulty === difficulty : true,
      )
      .filter((question) => (needle ? matchesSearch(question, needle) : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const start = (page - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
    };
  }

  public all(): Promise<QuizQuestion[]> {
    return this.store.all();
  }

  public findById(id: string): Promise<QuizQuestion | null> {
    return this.store.findById(id);
  }

  public async findManyByIds(ids: string[]): Promise<QuizQuestion[]> {
    const wanted = new Set(ids);

    return (await this.store.all()).filter((question) =>
      wanted.has(question.id),
    );
  }

  public async findPublished({
    topic,
    difficulty,
  }: DrawQuery): Promise<QuizQuestion[]> {
    return (await this.store.all())
      .filter((question) => question.isPublished)
      .filter((question) => (topic ? question.topic === topic : true))
      .filter((question) =>
        difficulty ? question.difficulty === difficulty : true,
      );
  }

  /** Published questions grouped by topic, most populated first. */
  public async topics(): Promise<QuizTopic[]> {
    const counts = new Map<string, number>();

    for (const question of await this.store.all()) {
      if (!question.isPublished) {
        continue;
      }

      counts.set(question.topic, (counts.get(question.topic) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([topic, questionCount]) => ({ topic, questionCount }))
      .sort(
        (left, right) =>
          right.questionCount - left.questionCount ||
          left.topic.localeCompare(right.topic, 'tr'),
      );
  }

  public create(question: QuizQuestion): Promise<QuizQuestion> {
    return this.store.insert(question);
  }

  public update(
    id: string,
    patch: Partial<QuizQuestion>,
  ): Promise<QuizQuestion | null> {
    return this.store.update(id, patch);
  }

  public delete(id: string): Promise<boolean> {
    return this.store.remove(id);
  }
}
