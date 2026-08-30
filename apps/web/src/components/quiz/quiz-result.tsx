import { QUIZ_OPTION_LETTERS } from '@gtip/shared';
import type { QuizResult } from '@gtip/shared';

export interface QuizResultViewProps {
  result: QuizResult;
  onRestart: () => void;
}

function toneForScore(scorePercent: number): string {
  if (scorePercent >= 70) {
    return 'from-emerald-600 to-emerald-500';
  }

  if (scorePercent >= 50) {
    return 'from-amber-600 to-amber-500';
  }

  return 'from-rose-600 to-rose-500';
}

/** Score summary plus a full review with the correct answer and explanation. */
export function QuizResultView({
  result,
  onRestart,
}: QuizResultViewProps): JSX.Element {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <section
        className={`rounded-2xl bg-gradient-to-br px-6 py-8 text-white ${toneForScore(
          result.scorePercent,
        )}`}
      >
        <p className="text-sm uppercase tracking-wide text-white/80">Sonucunuz</p>
        <p className="mt-1 text-4xl font-semibold">%{result.scorePercent}</p>
        <p className="mt-3 text-sm text-white/90">
          {result.total} soruda {result.correct} doğru, {result.wrong} yanlış,{' '}
          {result.blank} boş.
        </p>
        <button
          type="button"
          className="btn mt-5 bg-white text-slate-900 hover:bg-slate-100"
          onClick={onRestart}
        >
          Yeni test başlat
        </button>
      </section>

      <div>
        <h2 className="text-lg font-semibold text-slate-900">Soru incelemesi</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sonucunuz kaydedilmedi; sayfadan ayrılınca bu döküm kaybolur.
        </p>
      </div>

      <ol aria-label="Soru incelemesi" className="flex flex-col gap-4">
        {result.items.map((item, index) => (
          <li key={item.questionId} className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">
                Soru {index + 1}
              </span>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                {item.topic}
              </span>
              <span
                className={
                  item.isCorrect
                    ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700'
                    : item.selectedIndex === null
                      ? 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600'
                      : 'rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700'
                }
              >
                {item.isCorrect
                  ? 'Doğru'
                  : item.selectedIndex === null
                    ? 'Boş'
                    : 'Yanlış'}
              </span>
            </div>

            <p className="mt-3 whitespace-pre-line text-sm font-medium text-slate-900">
              {item.question}
            </p>

            <ul className="mt-3 flex flex-col gap-1.5">
              {item.options.map((option, optionIndex) => {
                const isCorrect = optionIndex === item.correctOptionIndex;
                const isChosen = optionIndex === item.selectedIndex;

                return (
                  <li
                    key={option}
                    className={[
                      'flex items-start gap-3 rounded-lg border px-3 py-2 text-sm',
                      isCorrect
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : isChosen
                          ? 'border-rose-300 bg-rose-50 text-rose-900'
                          : 'border-slate-200 text-slate-600',
                    ].join(' ')}
                  >
                    <span className="font-semibold">
                      {QUIZ_OPTION_LETTERS[optionIndex]})
                    </span>
                    <span className="flex-1">{option}</span>
                    {isCorrect ? (
                      <span className="text-xs font-medium">doğru cevap</span>
                    ) : isChosen ? (
                      <span className="text-xs font-medium">sizin cevabınız</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {item.explanation ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {item.explanation}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      <button type="button" className="btn-primary self-start" onClick={onRestart}>
        Yeni test başlat
      </button>
    </div>
  );
}
