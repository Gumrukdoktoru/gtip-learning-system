import { z } from 'zod';

import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_QUIZ_LENGTH,
  MAX_PAGE_SIZE,
  MAX_QUIZ_LENGTH,
  MAX_QUIZ_OPTIONS,
  MIN_QUIZ_OPTIONS,
  QUIZ_DIFFICULTIES,
} from '@gtip/shared';
import type { QuizDifficulty } from '@gtip/shared';

const difficultySchema = z.enum(
  QUIZ_DIFFICULTIES as [QuizDifficulty, ...QuizDifficulty[]],
);

const optionsSchema = z
  .array(z.string().trim().min(1, 'Şık boş olamaz.').max(500))
  .min(MIN_QUIZ_OPTIONS, `En az ${MIN_QUIZ_OPTIONS} şık gerekli.`)
  .max(MAX_QUIZ_OPTIONS, `En fazla ${MAX_QUIZ_OPTIONS} şık olabilir.`);

export const createQuizQuestionSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(10, 'Soru metni en az 10 karakter olmalı.')
      .max(2000),
    options: optionsSchema,
    correctOptionIndex: z.coerce.number().int().min(0),
    explanation: z.string().trim().max(2000).default(''),
    topic: z.string().trim().min(2, 'Konu en az 2 karakter olmalı.').max(80),
    difficulty: difficultySchema,
    isPublished: z.boolean().default(true),
  })
  .refine((value) => value.correctOptionIndex < value.options.length, {
    message: 'Doğru cevap, şık listesinin dışında kalıyor.',
    path: ['correctOptionIndex'],
  });

export const updateQuizQuestionSchema = z
  .object({
    question: z.string().trim().min(10).max(2000).optional(),
    options: optionsSchema.optional(),
    correctOptionIndex: z.coerce.number().int().min(0).optional(),
    explanation: z.string().trim().max(2000).optional(),
    topic: z.string().trim().min(2).max(80).optional(),
    difficulty: difficultySchema.optional(),
    isPublished: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Güncellenecek en az bir alan gönderilmeli.',
  });

export const listQuizQuestionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(200).optional(),
  topic: z.string().trim().max(80).optional(),
  difficulty: difficultySchema.optional(),
});

export const startQuizSchema = z.object({
  topic: z.string().trim().max(80).optional(),
  difficulty: difficultySchema.optional(),
  questionCount: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_QUIZ_LENGTH)
    .default(DEFAULT_QUIZ_LENGTH),
});

export const submitQuizSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedIndex: z.number().int().min(0).max(MAX_QUIZ_OPTIONS - 1).nullable(),
      }),
    )
    .max(MAX_QUIZ_LENGTH),
});

export const quizQuestionIdSchema = z.object({
  id: z.string().uuid('Geçersiz soru kimliği.'),
});

export const quizSessionIdSchema = z.object({
  sessionId: z.string().uuid('Geçersiz sınav oturumu.'),
});

/** Import defaults arrive as multipart form fields, hence the coercions. */
export const quizImportSchema = z.object({
  /** Pasted text; ignored when a file is uploaded. */
  source: z.string().max(1_000_000).optional(),
  defaultTopic: z.string().trim().max(80).optional(),
  defaultDifficulty: difficultySchema.optional(),
  isPublished: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .default(false),
});
