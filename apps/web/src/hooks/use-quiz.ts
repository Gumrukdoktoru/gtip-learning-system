import type {
  QuizAvailability,
  QuizResult,
  QuizSession,
  StartQuizInput,
} from '@gtip/shared';
import { useCallback, useEffect, useState } from 'react';

import { ApiRequestError } from '../services/api-client';
import {
  fetchQuizAvailability,
  startQuiz,
  submitQuiz,
} from '../services/quiz-service';

export type QuizPhase = 'idle' | 'running' | 'done';

export interface UseQuizResult {
  phase: QuizPhase;
  availability: QuizAvailability | null;
  session: QuizSession | null;
  result: QuizResult | null;
  /** Selected option per question id; a missing entry means blank. */
  answers: Record<string, number>;
  isBusy: boolean;
  error: string | null;
  begin: (input: StartQuizInput) => Promise<void>;
  answer: (questionId: string, optionIndex: number) => void;
  finish: () => Promise<void>;
  restart: () => void;
}

function describe(cause: unknown, fallback: string): string {
  return cause instanceof ApiRequestError ? cause.message : fallback;
}

/**
 * Drives one practice exam.
 *
 * Answers live here only until they are submitted; grading happens on the
 * server, so this hook never sees a correct answer before the student does.
 */
export function useQuiz(): UseQuizResult {
  const [phase, setPhase] = useState<QuizPhase>('idle');
  const [availability, setAvailability] = useState<QuizAvailability | null>(
    null,
  );
  const [session, setSession] = useState<QuizSession | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchQuizAvailability(controller.signal)
      .then(setAvailability)
      .catch(() => {
        // The start screen degrades to "no questions yet".
      });

    return () => controller.abort();
  }, []);

  const begin = useCallback(async (input: StartQuizInput) => {
    setIsBusy(true);
    setError(null);

    try {
      const started = await startQuiz(input);

      setSession(started);
      setAnswers({});
      setResult(null);
      setPhase('running');
    } catch (cause) {
      setError(describe(cause, 'Test başlatılamadı.'));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const answer = useCallback((questionId: string, optionIndex: number) => {
    setAnswers((current) => ({ ...current, [questionId]: optionIndex }));
  }, []);

  const finish = useCallback(async () => {
    if (!session) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const graded = await submitQuiz(
        session.sessionId,
        session.questions.map((question) => ({
          questionId: question.id,
          selectedIndex: answers[question.id] ?? null,
        })),
      );

      setResult(graded);
      setPhase('done');
    } catch (cause) {
      setError(describe(cause, 'Sınav gönderilemedi.'));
    } finally {
      setIsBusy(false);
    }
  }, [session, answers]);

  const restart = useCallback(() => {
    setPhase('idle');
    setSession(null);
    setResult(null);
    setAnswers({});
    setError(null);
    fetchQuizAvailability().then(setAvailability).catch(() => {});
  }, []);

  return {
    phase,
    availability,
    session,
    result,
    answers,
    isBusy,
    error,
    begin,
    answer,
    finish,
    restart,
  };
}
