import { useEffect, useState } from 'react';
import type { Question } from '../types/mevzuat';
import { QuestionList } from './question-list';

export const TOPIC_QUESTIONS_ID = 'konu-cikmis-sorular';
const PAGE_SIZE = 30;

interface TopicQuestionsProps {
  topicId: number;
  questions: Question[];
}

/** Sayfanın başındaki kısayol: uzun fasıllarda soru bölümüne iner (adres çapası değişmez). */
export function TopicQuestionsJump({ count }: { count: number }): JSX.Element {
  const jump = (): void => document.getElementById(TOPIC_QUESTIONS_ID)?.scrollIntoView({ block: 'start' });
  return (
    <button
      type="button"
      onClick={jump}
      className="mb-6 inline-flex items-center gap-2 rounded-md border border-accent bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-black/5"
    >
      Çıkmış sorulara git ({count}) <span aria-hidden="true">↓</span>
    </button>
  );
}

/** Konu metninin sonunda, ondan belirgin biçimde ayrılmış "bu konunun çıkmış soruları" bölümü. */
export function TopicQuestions({ topicId, questions }: TopicQuestionsProps): JSX.Element {
  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => setShown(PAGE_SIZE), [topicId]);
  const rest = questions.length - shown;
  return (
    <section id={TOPIC_QUESTIONS_ID} aria-labelledby={`${TOPIC_QUESTIONS_ID}-baslik`} className="mt-14 scroll-mt-32 border-t-4 border-ink pt-6">
      <h3 id={`${TOPIC_QUESTIONS_ID}-baslik`} className="rounded-md bg-ink px-4 py-3 text-base font-semibold tracking-wide text-white">
        Bu konunun çıkmış soruları ({questions.length})
      </h3>
      <p className="mb-4 mt-3 text-sm text-ink-soft">
        Sınav kitapçıklarından, notlardaki dayanağına göre otomatik olarak bu konuya bağlanan sorular. Soruya dokunarak açın; cevabı
        gösterdiğinizde dayanak pasajı da görünür.
      </p>
      <QuestionList questions={questions.slice(0, shown)} />
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setShown(shown + PAGE_SIZE)}
          className="mt-2 rounded-md border border-paper-line bg-white px-4 py-2 text-sm font-semibold hover:bg-black/5"
        >
          Daha fazla göster ({rest} soru kaldı)
        </button>
      )}
    </section>
  );
}
