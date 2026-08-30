import {
  DEFAULT_QUIZ_LENGTH,
  QUIZ_DIFFICULTIES,
  QUIZ_DIFFICULTY_LABELS,
} from '@gtip/shared';
import type { QuizAvailability, QuizDifficulty, StartQuizInput } from '@gtip/shared';
import { useState } from 'react';

import { EmptyState } from '../empty-state';

const LENGTH_CHOICES = [5, 10, 20, 30];

export interface QuizStartProps {
  availability: QuizAvailability | null;
  isBusy: boolean;
  onStart: (input: StartQuizInput) => void;
}

export function QuizStart({
  availability,
  isBusy,
  onStart,
}: QuizStartProps): JSX.Element {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<QuizDifficulty | ''>('');
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUIZ_LENGTH);

  if (availability && availability.totalQuestions === 0) {
    return (
      <EmptyState
        title="Henüz soru eklenmedi"
        description="Deneme sınavı, panele soru eklendiğinde burada açılacak."
      />
    );
  }

  const selectedTopicCount = topic
    ? (availability?.topics.find((item) => item.topic === topic)
        ?.questionCount ?? 0)
    : (availability?.totalQuestions ?? 0);

  return (
    <div className="card mx-auto max-w-2xl p-6">
      <h2 className="text-lg font-semibold text-slate-900">Deneme Sınavı</h2>
      <p className="mt-1 text-sm text-slate-600">
        Sorular her denemede karışık gelir. Giriş yapmanız gerekmez, sonucunuz
        yalnızca size gösterilir ve hiçbir yere kaydedilmez.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="quiz-topic">
            Konu
          </label>
          <select
            id="quiz-topic"
            className="field"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          >
            <option value="">
              Tüm konular ({availability?.totalQuestions ?? 0} soru)
            </option>
            {availability?.topics.map((item) => (
              <option key={item.topic} value={item.topic}>
                {item.topic} ({item.questionCount} soru)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="quiz-difficulty">
            Zorluk
          </label>
          <select
            id="quiz-difficulty"
            className="field"
            value={difficulty}
            onChange={(event) =>
              setDifficulty(event.target.value as QuizDifficulty | '')
            }
          >
            <option value="">Fark etmez</option>
            {QUIZ_DIFFICULTIES.map((level) => (
              <option key={level} value={level}>
                {QUIZ_DIFFICULTY_LABELS[level]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="label">Soru sayısı</legend>
        <div className="flex flex-wrap gap-2">
          {LENGTH_CHOICES.map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={questionCount === count}
              className={
                questionCount === count
                  ? 'btn bg-brand-600 text-white'
                  : 'btn-secondary'
              }
              onClick={() => setQuestionCount(count)}
            >
              {count}
            </button>
          ))}
        </div>
        {selectedTopicCount > 0 && selectedTopicCount < questionCount ? (
          <p className="mt-2 text-xs text-slate-500">
            Bu seçimde {selectedTopicCount} soru var; sınav o kadar soruyla
            başlar.
          </p>
        ) : null}
      </fieldset>

      <button
        type="button"
        className="btn-primary mt-6 w-full sm:w-auto"
        disabled={isBusy}
        onClick={() =>
          onStart({
            questionCount,
            ...(topic ? { topic } : {}),
            ...(difficulty ? { difficulty } : {}),
          })
        }
      >
        {isBusy ? 'Hazırlanıyor…' : 'Testi başlat'}
      </button>
    </div>
  );
}
