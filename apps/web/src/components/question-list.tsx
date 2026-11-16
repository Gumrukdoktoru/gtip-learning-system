import { useState } from 'react';
import type { Question } from '../types/mevzuat';
import { useReaderContext } from './reader-context';
import { articleHash } from '../utils/route';
import { splitHits } from '../utils/text';

function Marked({ text }: { text: string }): JSX.Element {
  const { term } = useReaderContext();
  return <>{splitHits(text, term).map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : part.text))}</>;
}

function QuestionItem({ question }: { question: Question }): JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const letterAnswer = question.cevap.length === 1;
  return (
    <details className="mb-2 rounded-md border border-paper-line bg-white/70 px-4 py-2.5 font-sans text-[15px] leading-relaxed">
      <summary className="cursor-pointer text-[13px] font-semibold text-ink-soft">{question.sinav}</summary>
      <div className="mt-2">
        {question.kok.map((paragraph, i) => (
          <p key={i} className="mb-2 font-semibold">
            <Marked text={paragraph} />
          </p>
        ))}
        {question.siklar.map((option) => {
          const correct = revealed && letterAnswer && option.startsWith(`${question.cevap})`);
          return (
            <p key={option} className={`rounded px-2 py-0.5 ${correct ? 'bg-emerald-100 font-semibold text-emerald-900' : ''}`}>
              <Marked text={option} />
            </p>
          );
        })}
        {(question.madde ?? []).map((link) => (
          <p key={link.ad} className="mt-1 text-xs text-ink-soft">
            Madde: {link.id ? <a className="font-semibold underline" href={articleHash(link.id)}>{link.ad}</a> : link.ad}
          </p>
        ))}
        {question.ilgili && (
          <p className="mt-1 text-xs text-ink-soft">
            İlgili olabilecek madde (otomatik eşleşme):{' '}
            <a className="font-semibold underline" href={articleHash(question.ilgili.id)}>
              {question.ilgili.ad}
            </a>
          </p>
        )}
        <button
          type="button"
          onClick={() => setRevealed(!revealed)}
          aria-expanded={revealed}
          className="mt-2 rounded border border-paper-line px-3 py-1 text-xs hover:bg-black/5"
        >
          {revealed ? 'Cevabı gizle' : 'Cevabı göster'}
        </button>
        {revealed && (
          <span className="ml-3 text-sm font-semibold text-emerald-800">
            {question.cevap ? `Doğru cevap: ${question.cevap}` : 'Cevap bilgisi yok'}
          </span>
        )}
      </div>
    </details>
  );
}

export function QuestionList({ questions }: { questions: Question[] }): JSX.Element {
  return (
    <>
      {questions.map((question, i) => (
        <QuestionItem key={`${question.id}-${i}`} question={question} />
      ))}
    </>
  );
}
