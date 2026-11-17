import { useState } from 'react';
import type { SolvedQuestionBlock } from '../types/mevzuat';
import { RichText } from './rich-text';

interface SolvedQuestionProps {
  question: SolvedQuestionBlock;
}

const MISSING_ANSWER = 'Cevap kaynakta bulunamadı';

/** Soru metni belirgin; cevabı ve çözümü hemen altında, düğmeyle açılır. */
export function SolvedQuestion({ question }: SolvedQuestionProps): JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const letter = question.cevap.length === 1 ? question.cevap.toUpperCase() : '';
  const isCorrect = (option: string): boolean => letter !== '' && option.slice(0, 1).toUpperCase() === letter && /^.[).]/.test(option);
  const answerText = question.siklar.find(isCorrect) ?? (question.cevap || MISSING_ANSWER);
  const hasSolution = question.cozum.length > 0;
  const label = hasSolution ? 'Çözümü' : 'Cevabı';

  return (
    <section className="mb-5 overflow-hidden rounded-lg border border-paper-line bg-paper-card shadow-sm">
      <header className="flex items-center gap-3 border-b border-paper-line bg-ink px-4 py-2 text-white">
        <span className="rounded bg-accent px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-shell">{question.no}</span>
      </header>
      <div className="px-4 py-3">
        {question.kok.map((paragraph, i) => (
          <p key={i} className="mb-2 font-read font-semibold leading-relaxed text-ink" style={{ fontSize: 'var(--reading-size)' }}>
            <RichText text={paragraph} />
          </p>
        ))}
        {question.siklar.map((option, i) => (
          <p
            key={i}
            className={`rounded px-2 py-1 text-[15px] leading-relaxed ${revealed && isCorrect(option) ? 'bg-emerald-100 font-semibold text-emerald-900' : 'text-ink'}`}
          >
            <RichText text={option} />
          </p>
        ))}
        <button
          type="button"
          onClick={() => setRevealed(!revealed)}
          aria-expanded={revealed}
          className="mt-3 rounded-md border border-ink bg-white px-4 py-1.5 text-sm font-semibold text-ink hover:bg-black/5"
        >
          {revealed ? `${label} gizle` : `${label} göster`}
        </button>
        {revealed && (
          <div className="mt-3 rounded-md border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-[15px] leading-relaxed text-ink">
            <p className="font-semibold text-emerald-900">Doğru cevap: {answerText}</p>
            {hasSolution && <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-900">Çözüm</p>}
            {question.cozum.map((line, i) => (
              <p key={i} className="mt-1">
                <RichText text={line} />
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
