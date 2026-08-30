import { QUIZ_DIFFICULTY_LABELS, QUIZ_OPTION_LETTERS } from '@gtip/shared';
import type { QuizSession } from '@gtip/shared';
import { useState } from 'react';

import { QuestionText } from './question-text';

export interface QuizRunnerProps {
  session: QuizSession;
  answers: Record<string, number>;
  isBusy: boolean;
  onAnswer: (questionId: string, optionIndex: number) => void;
  onFinish: () => void;
}

/**
 * One question at a time, with a palette showing what is still blank.
 *
 * Answering does not advance automatically: a student changing their mind
 * should not have to navigate back.
 */
export function QuizRunner({
  session,
  answers,
  isBusy,
  onAnswer,
  onFinish,
}: QuizRunnerProps): JSX.Element {
  const [index, setIndex] = useState(0);
  const question = session.questions[index];
  const answeredCount = session.questions.filter(
    (item) => answers[item.id] !== undefined,
  ).length;

  if (!question) {
    return <p className="text-sm text-slate-600">Soru bulunamadı.</p>;
  }

  const selected = answers[question.id];
  const isLast = index === session.questions.length - 1;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-medium text-slate-700">
          Soru {index + 1} / {session.questions.length}
        </p>
        <p className="text-xs text-slate-500">
          {answeredCount} yanıtlandı · {session.questions.length - answeredCount}{' '}
          boş
        </p>
      </div>

      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            {question.topic}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {QUIZ_DIFFICULTY_LABELS[question.difficulty]}
          </span>
        </div>

        <div className="mt-4">
          <QuestionText text={question.question} />
        </div>

        <div role="radiogroup" aria-label="Şıklar" className="mt-5 flex flex-col gap-2">
          {question.options.map((option, optionIndex) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected === optionIndex}
              className={[
                'flex items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition',
                selected === optionIndex
                  ? 'border-brand-500 bg-brand-50 text-brand-900'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              ].join(' ')}
              onClick={() => onAnswer(question.id, optionIndex)}
            >
              <span className="font-semibold">
                {QUIZ_OPTION_LETTERS[optionIndex]})
              </span>
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={index === 0}
            onClick={() => setIndex((current) => current - 1)}
          >
            Önceki
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={isLast}
            onClick={() => setIndex((current) => current + 1)}
          >
            Sonraki
          </button>
        </div>

        <button
          type="button"
          className="btn-primary"
          disabled={isBusy}
          onClick={onFinish}
        >
          {isBusy ? 'Değerlendiriliyor…' : 'Testi bitir'}
        </button>
      </div>

      <div className="card flex flex-wrap gap-2 p-4">
        {session.questions.map((item, itemIndex) => (
          <button
            key={item.id}
            type="button"
            aria-label={`Soru ${itemIndex + 1}`}
            aria-current={itemIndex === index}
            className={[
              'h-9 w-9 rounded-lg border text-sm font-medium transition',
              itemIndex === index
                ? 'border-brand-600 bg-brand-600 text-white'
                : answers[item.id] !== undefined
                  ? 'border-brand-200 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
            ].join(' ')}
            onClick={() => setIndex(itemIndex)}
          >
            {itemIndex + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
