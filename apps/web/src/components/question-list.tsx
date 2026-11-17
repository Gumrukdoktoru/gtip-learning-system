import { useState } from 'react';
import type { Question } from '../types/mevzuat';
import { useReaderContext } from './reader-context';
import { articleHash } from '../utils/route';
import { splitHits } from '../utils/text';

function Marked({ text }: { text: string }): JSX.Element {
  const { term } = useReaderContext();
  return <>{splitHits(text, term).map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : part.text))}</>;
}

/** Dayanağın altındaki kaynak notu. */
function basisNote(question: Question, fromNotes: boolean): string {
  if (question.dayanak?.kaynak === 'resmi') {
    return 'Dayanak, resmî mevzuat metninden (mevzuat.gov.tr) alınmıştır; notlarınızda bu hüküm yer almıyor.';
  }
  if (question.dayanak?.kaynak === 'okuma') {
    return `Dayanak, notlarınız okunarak seçilmiştir${fromNotes ? '; bağlantı konunun tamamını açar' : ''}.`;
  }
  return fromNotes
    ? 'Dayanak pasajı, notlarınızdaki ilgili konudan otomatik seçilmiştir; bağlantı konunun tamamını açar.'
    : 'Dayanak hüküm, notlarınızdaki ilgili maddeden otomatik seçilmiştir.';
}

/** Dayanağın adı: uygulamadaki maddeye/konuya bağlantı, yoksa resmî metnin dış bağlantısı. */
function BasisLink({ basis }: { basis: NonNullable<Question['dayanak']> }): JSX.Element {
  if (!basis.id && basis.url) {
    return (
      <a className="font-semibold underline" href={basis.url} target="_blank" rel="noopener noreferrer">
        {basis.ad}
      </a>
    );
  }
  return (
    <a className="font-semibold underline" href={articleHash(basis.id)}>
      {basis.ad}
    </a>
  );
}

function QuestionItem({ question }: { question: Question }): JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const letterAnswer = question.cevap.length === 1;
  const fromNotes = question.dayanak?.id.startsWith('konu-') ?? false;
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
          <div className="mt-3 rounded-md border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-ink">
            <p className="font-semibold text-emerald-900">
              Doğru cevap: {question.siklar.find((option) => option.startsWith(`${question.cevap})`)) ?? (question.cevap || 'bilgi yok')}
            </p>
            {question.dayanak ? (
              <>
                <p className="mt-2">
                  <strong>Dayanak:</strong> <BasisLink basis={question.dayanak} />
                </p>
                <p className="mt-1">
                  <strong>Gerekçe:</strong>{' '}
                  {fromNotes ? 'Sorunun konusu, notlarınızın aşağıdaki bölümünde geçmektedir.' : 'Doğru şık, aşağıdaki hükümle örtüşmektedir.'}
                </p>
                <blockquote className="mt-2 border-l-2 border-emerald-300 pl-3 font-read italic">“{question.dayanak.metin}”</blockquote>
                <p className="mt-2 text-xs text-ink-mute">{basisNote(question, fromNotes)}</p>
              </>
            ) : (
              !question.cozum?.length && (
                <p className="mt-2 text-ink-soft">
                  {question.dayanakYok === 'genel'
                    ? 'Bu soru genel kültür / genel yetenek sorusudur; notlarınızda dayanağı yoktur.'
                    : 'Bu soru için notlarda dayanak hüküm eşleştirilemedi.'}
                </p>
              )
            )}
            {(question.cozum ?? []).map((line, i) => (
              <p key={i} className="mt-2">
                {i === 0 && <strong>Çözüm (Tarife Kitabı notunuzdan): </strong>}
                <Marked text={line} />
              </p>
            ))}
          </div>
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
