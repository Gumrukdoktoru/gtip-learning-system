import { useEffect, useState } from 'react';
import type { Question, QuestionRole } from '../types/mevzuat';
import { QuestionList } from './question-list';

export const TOPIC_QUESTIONS_ID = 'konu-cikmis-sorular';
const PAGE_SIZE = 30;
const ROLE_TITLES: Record<QuestionRole, string> = {
  dogru: 'Doğru cevabı bu fasılda olan / bu fasılı soran sorular',
  secenek: 'Bu fasılın şıklarda (çeldirici olarak) geçtiği sorular',
};
const ROLES: QuestionRole[] = ['dogru', 'secenek'];

interface TopicQuestionsProps {
  topicId: number;
  /** Boş liste: tarife faslı, fakat kaynaklarda sorusu yok. */
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

/** Fasıl sayfası: sorular iki başlık altında (doğru cevap / çeldirici); sayfalama iki grubu birlikte sayar. */
function RoleGroups({ questions, shown }: { questions: Question[]; shown: number }): JSX.Element {
  return (
    <>
      {ROLES.map((role) => {
        const total = questions.filter((question) => question.rol === role).length;
        const visible = questions.slice(0, shown).filter((question) => question.rol === role);
        if (total === 0) return null;
        return (
          <div key={role} data-rol={role} className="mb-6">
            <h4 className="mb-2 border-l-4 border-accent pl-3 text-sm font-semibold text-ink">
              {ROLE_TITLES[role]} ({total})
            </h4>
            {visible.length > 0 ? (
              <QuestionList questions={visible} />
            ) : (
              <p className="text-sm text-ink-mute">Bu gruptaki sorular için aşağıdan “Daha fazla göster”e basın.</p>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Konu metninin sonunda, ondan belirgin biçimde ayrılmış "bu konunun çıkmış soruları" bölümü. */
export function TopicQuestions({ topicId, questions }: TopicQuestionsProps): JSX.Element {
  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => setShown(PAGE_SIZE), [topicId]);
  const rest = questions.length - shown;
  const grouped = questions.some((question) => question.rol);
  return (
    <section id={TOPIC_QUESTIONS_ID} aria-labelledby={`${TOPIC_QUESTIONS_ID}-baslik`} className="mt-14 scroll-mt-32 border-t-4 border-ink pt-6">
      <h3 id={`${TOPIC_QUESTIONS_ID}-baslik`} className="rounded-md bg-ink px-4 py-3 text-base font-semibold tracking-wide text-white">
        Bu konunun çıkmış soruları ({questions.length})
      </h3>
      {questions.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">Bu fasıl için kaynaklarda çıkmış soru bulunamadı.</p>
      ) : (
        <p className="mb-4 mt-3 text-sm text-ink-soft">
          {grouped
            ? 'Sınav kitapçıkları, yüklediğiniz tarife soru derlemesi ve Tarife Kitabındaki örneklerden; soruda geçen tarife pozisyonu ya da fasıl numarasına göre bu sayfaya bağlanan sorular (tekrarlar ayıklanmıştır). Soruya dokunarak açın.'
            : 'Sınav kitapçıklarından, notlardaki dayanağına göre otomatik olarak bu konuya bağlanan sorular. Soruya dokunarak açın; cevabı gösterdiğinizde dayanak pasajı da görünür.'}
        </p>
      )}
      {grouped ? <RoleGroups questions={questions} shown={shown} /> : <QuestionList questions={questions.slice(0, shown)} />}
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
