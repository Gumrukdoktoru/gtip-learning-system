import type {
  CreateQuizQuestionInput,
  PaginatedData,
  QuizImportOptions,
  QuizImportPreview,
  QuizImportResult,
  QuizAnswerInput,
  QuizAvailability,
  QuizQuestion,
  QuizQuestionListQuery,
  QuizResult,
  QuizSession,
  StartQuizInput,
  UpdateQuizQuestionInput,
} from '@gtip/shared';

import { apiRequest, buildQueryString } from './api-client';

export function fetchQuizAvailability(
  signal?: AbortSignal,
): Promise<QuizAvailability> {
  return apiRequest<QuizAvailability>(
    '/quiz/availability',
    signal ? { signal } : {},
  );
}

export function startQuiz(input: StartQuizInput): Promise<QuizSession> {
  return apiRequest<QuizSession>('/quiz/sessions', {
    method: 'POST',
    body: input,
  });
}

export function submitQuiz(
  sessionId: string,
  answers: QuizAnswerInput[],
): Promise<QuizResult> {
  return apiRequest<QuizResult>(`/quiz/sessions/${sessionId}/submit`, {
    method: 'POST',
    body: { answers },
  });
}

export function fetchQuizQuestions(
  query: QuizQuestionListQuery = {},
  signal?: AbortSignal,
): Promise<PaginatedData<QuizQuestion>> {
  const search = buildQueryString({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    topic: query.topic,
    difficulty: query.difficulty,
  });

  return apiRequest<PaginatedData<QuizQuestion>>(
    `/quiz/questions${search}`,
    signal ? { signal } : {},
  );
}

export function createQuizQuestion(
  input: CreateQuizQuestionInput,
): Promise<QuizQuestion> {
  return apiRequest<QuizQuestion>('/quiz/questions', {
    method: 'POST',
    body: input,
  });
}

export function updateQuizQuestion(
  id: string,
  input: UpdateQuizQuestionInput,
): Promise<QuizQuestion> {
  return apiRequest<QuizQuestion>(`/quiz/questions/${id}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteQuizQuestion(id: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/quiz/questions/${id}`, {
    method: 'DELETE',
  });
}

function buildImportForm(
  options: QuizImportOptions,
  file: File | null,
  source: string,
): FormData {
  const formData = new FormData();

  if (file) {
    formData.append('file', file);
  } else {
    formData.append('source', source);
  }

  if (options.defaultTopic) {
    formData.append('defaultTopic', options.defaultTopic);
  }

  if (options.defaultDifficulty) {
    formData.append('defaultDifficulty', options.defaultDifficulty);
  }

  formData.append('isPublished', String(options.isPublished ?? false));

  return formData;
}

/** Parses a file or pasted text without saving anything. */
export function previewQuizImport(
  options: QuizImportOptions,
  file: File | null,
  source: string,
): Promise<QuizImportPreview> {
  return apiRequest<QuizImportPreview>('/quiz/questions/import/preview', {
    method: 'POST',
    formData: buildImportForm(options, file, source),
  });
}

export function runQuizImport(
  options: QuizImportOptions,
  file: File | null,
  source: string,
): Promise<QuizImportResult> {
  return apiRequest<QuizImportResult>('/quiz/questions/import', {
    method: 'POST',
    formData: buildImportForm(options, file, source),
  });
}
