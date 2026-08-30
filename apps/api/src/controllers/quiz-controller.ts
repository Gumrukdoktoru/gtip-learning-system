import type { Request, RequestHandler, Response } from 'express';

import {
  createQuizQuestionSchema,
  listQuizQuestionsQuerySchema,
  quizQuestionIdSchema,
  quizSessionIdSchema,
  startQuizSchema,
  submitQuizSchema,
  updateQuizQuestionSchema,
} from '../schemas/quiz-schemas.js';
import type { QuizService } from '../services/quiz-service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export interface QuizController {
  availability: RequestHandler;
  start: RequestHandler;
  submit: RequestHandler;
  listQuestions: RequestHandler;
  createQuestion: RequestHandler;
  updateQuestion: RequestHandler;
  removeQuestion: RequestHandler;
}

export function createQuizController(quizService: QuizService): QuizController {
  const availability = asyncHandler(async (_req: Request, res: Response) => {
    return sendSuccess(res, await quizService.getAvailability());
  });

  const start = asyncHandler(async (req: Request, res: Response) => {
    const input = startQuizSchema.parse(req.body);

    return sendSuccess(res, await quizService.startQuiz(input), 201);
  });

  const submit = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = quizSessionIdSchema.parse(req.params);
    const { answers } = submitQuizSchema.parse(req.body);

    return sendSuccess(res, await quizService.submitQuiz(sessionId, answers));
  });

  const listQuestions = asyncHandler(async (req: Request, res: Response) => {
    const query = listQuizQuestionsQuerySchema.parse(req.query);

    return sendSuccess(res, await quizService.listQuestions(query));
  });

  const createQuestion = asyncHandler(async (req: Request, res: Response) => {
    const input = createQuizQuestionSchema.parse(req.body);

    return sendSuccess(res, await quizService.createQuestion(input), 201);
  });

  const updateQuestion = asyncHandler(async (req: Request, res: Response) => {
    const { id } = quizQuestionIdSchema.parse(req.params);
    const input = updateQuizQuestionSchema.parse(req.body);

    return sendSuccess(res, await quizService.updateQuestion(id, input));
  });

  const removeQuestion = asyncHandler(async (req: Request, res: Response) => {
    const { id } = quizQuestionIdSchema.parse(req.params);

    await quizService.deleteQuestion(id);

    return sendSuccess(res, { id });
  });

  return {
    availability,
    start,
    submit,
    listQuestions,
    createQuestion,
    updateQuestion,
    removeQuestion,
  };
}
