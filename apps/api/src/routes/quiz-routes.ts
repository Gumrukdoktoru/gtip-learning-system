import { Router } from 'express';
import type { Multer } from 'multer';

import { createQuizController } from '../controllers/quiz-controller.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import type { QuizService } from '../services/quiz-service.js';

export function createQuizRouter(
  quizService: QuizService,
  auth: AuthMiddleware,
  upload: Multer,
): Router {
  const router = Router();
  const controller = createQuizController(quizService);
  const adminOnly = [auth.requireAuth, auth.requireRole('admin')] as const;

  // Students take exams without signing in; nothing about them is stored.
  router.get('/availability', controller.availability);
  router.post('/sessions', controller.start);
  router.post('/sessions/:sessionId/submit', controller.submit);

  // Import accepts a .md/.txt/.docx upload or pasted text; preview saves
  // nothing so a bad file can be spotted before it reaches the bank.
  router.post(
    '/questions/import/preview',
    ...adminOnly,
    upload.single('file'),
    controller.previewImport,
  );
  router.post(
    '/questions/import',
    ...adminOnly,
    upload.single('file'),
    controller.runImport,
  );

  router.get('/questions', ...adminOnly, controller.listQuestions);
  router.post('/questions', ...adminOnly, controller.createQuestion);
  router.patch('/questions/:id', ...adminOnly, controller.updateQuestion);
  router.delete('/questions/:id', ...adminOnly, controller.removeQuestion);

  return router;
}
