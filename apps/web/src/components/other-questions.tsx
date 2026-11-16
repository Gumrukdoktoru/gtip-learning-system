import { useMemo, useState } from 'react';
import type { Loadable } from '../hooks/use-mevzuat';
import type { ExamGroup, Question } from '../types/mevzuat';
import { trLower } from '../utils/text';
import { QuestionList } from './question-list';

interface OtherQuestionsProps {
  title: string;
  groups: Loadable<ExamGroup[]>;
  term: string;
}

function matches(question: Question, needle: string): boolean {
  return trLower([question.sinav, ...question.kok, ...question.siklar].join('\n')).includes(needle);
}

/** Kanun/Yönetmelik maddesine bağlanamayan sorular, sınavlara göre. */
export function OtherQuestions({ title, groups, term }: OtherQuestionsProps): JSX.Element {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const needle = trLower(term.trim());
  const visible = useMemo(() => {
    const all = groups.data ?? [];
    if (needle.length < 2) return all;
    return all
      .map((group) => ({ ...group, sorular: group.sorular.filter((q) => matches(q, needle)) }))
      .filter((group) => group.sorular.length > 0);
  }, [groups.data, needle]);

  if (groups.error) return <p className="text-kanun">Sorular yüklenemedi: {groups.error}</p>;
  if (!groups.data) return <p className="text-ink-mute">Sorular yükleniyor…</p>;
  const total = visible.reduce((sum, group) => sum + group.sorular.length, 0);
  return (
    <>
      <h2 className="mb-1 font-read text-3xl">{title}</h2>
      <p className="mb-5 text-sm text-ink-soft" aria-live="polite">
        {total} soru · {visible.length} başlık
      </p>
      {visible.map((group) => {
        const expanded = open.has(group.sinav) || needle.length >= 2;
        return (
          <details
            key={group.sinav}
            open={expanded}
            onToggle={(event) => {
              const next = new Set(open);
              if (event.currentTarget.open) next.add(group.sinav);
              else next.delete(group.sinav);
              setOpen(next);
            }}
            className="mb-3 rounded-lg border border-paper-line bg-paper-card px-4 py-3"
          >
            <summary className="cursor-pointer font-semibold">
              {group.sinav} <span className="font-normal text-ink-mute">({group.sorular.length})</span>
            </summary>
            {expanded && (
              <div className="mt-3">
                <QuestionList questions={group.sorular.slice(0, needle.length >= 2 ? 30 : undefined)} />
              </div>
            )}
          </details>
        );
      })}
    </>
  );
}
