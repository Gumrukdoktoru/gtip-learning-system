import type { Request, RequestHandler, Response } from 'express';

import { BadRequestError } from '../errors/app-error.js';
import { extractDocxText } from '../services/docx-text.js';
import {
  createQuizQuestionSchema,
  listQuizQuestionsQuerySchema,
  quizQuestionIdSchema,
  quizImportSchema,
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
  previewImport: RequestHandler;
  runImport: RequestHandler;
}

const DOCX_EXTENSION = /\.docx$/i;

/**
 * Turns the request into the plain text the parser reads.
 *
 * A .docx is unzipped; anything else — .md, .txt, or pasted text — is taken
 * as UTF-8 as it stands.
 */
async function readSource(req: Request): Promise<string> {
  const { source } = quizImportSchema.parse(req.body);

  if (req.file) {
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    return DOCX_EXTENSION.test(name)
      ? extractDocxText(req.file.buffer)
      : req.file.buffer.toString('utf8');
  }

  if (source && source.trim().length > 0) {
    return source;
  }

  throw new BadRequestError('İçe aktarılacak dosya veya metin bulunamadı.');
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

  const previewImport = asyncHandler(async (req: Request, res: Response) => {
    const options = quizImportSchema.parse(req.body);

    return sendSuccess(
      res,
      await quizService.previewImport(await readSource(req), options),
    );
  });

  const runImport = asyncHandler(async (req: Request, res: Response) => {
    const options = quizImportSchema.parse(req.body);

    return sendSuccess(
      res,
      await quizService.importQuestions(await readSource(req), options),
      201,
    );
  });

  return {
    availability,
    start,
    submit,
    listQuestions,
    createQuestion,
    updateQuestion,
    removeQuestion,
    previewImport,
    runImport,
  };
}
