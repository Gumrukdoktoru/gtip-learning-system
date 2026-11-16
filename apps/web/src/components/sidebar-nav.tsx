import { useEffect, useRef } from 'react';
import type { LawEntry, MevzuatIndex, ReaderMode } from '../types/mevzuat';
import { articleHash, topicHash } from '../utils/route';

interface SidebarNavProps {
  index: MevzuatIndex;
  mode: ReaderMode;
  activeId: string | null;
  activeTopic: number | null;
  openTopics: ReadonlySet<number>;
  onToggleTopic: (topicId: number, open: boolean) => void;
}

const LINK_BASE = 'block rounded px-3 py-1.5 text-[13px] leading-snug hover:bg-black/5';
const LINK_ACTIVE = 'bg-ink text-white hover:bg-ink';

function LawList({ entries, code, activeId }: { entries: LawEntry[]; code: string; activeId: string | null }): JSX.Element {
  return (
    <>
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={articleHash(entry.id)}
          aria-current={entry.id === activeId ? 'page' : undefined}
          className={`${LINK_BASE} ${entry.id === activeId ? LINK_ACTIVE : ''}`}
        >
          <b className="mr-2 font-semibold">
            {code} {entry.no}
          </b>
          <span className="opacity-75">{entry.title}</span>
        </a>
      ))}
    </>
  );
}

export function SidebarNav(props: SidebarNavProps): JSX.Element {
  const { index, mode, activeId, activeTopic, openTopics, onToggleTopic } = props;
  const container = useRef<HTMLElement>(null);

  useEffect(() => {
    container.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeId, mode]);

  if (mode === 'soru') {
    return (
      <p className="px-2 text-[13px] leading-relaxed text-ink-soft">
        Kanun ve Yönetmelik maddelerine bağlanamayan sınav soruları sağda, sınavlara göre listelenir. Maddeye bağlı sorular ilgili
        maddenin altındadır.
      </p>
    );
  }
  if (mode !== 'konu') {
    return (
      <nav ref={container} aria-label={mode === 'gk' ? 'Kanun maddeleri' : 'Yönetmelik maddeleri'}>
        <LawList entries={mode === 'gk' ? index.gk : index.gy} code={mode.toUpperCase()} activeId={activeId} />
      </nav>
    );
  }
  return (
    <nav ref={container} aria-label="Konular">
      {index.topics.map((topic) => {
        const open = openTopics.has(topic.id);
        return (
          <details
            key={topic.id}
            open={open}
            onToggle={(event) => onToggleTopic(topic.id, event.currentTarget.open)}
            className="border-b border-paper-line"
          >
            <summary
              className={`cursor-pointer px-2 py-2 text-[13px] font-semibold ${topic.id === activeTopic ? 'text-kanun' : ''}`}
            >
              <span className="mr-1.5 text-ink-mute">{topic.id}.</span>
              {topic.title}
              <span className="ml-1.5 font-normal text-ink-mute">({topic.articles.length})</span>
            </summary>
            {open && (
              <div className="pb-2 pl-2">
                <a href={topicHash(topic.id)} className={`${LINK_BASE} italic text-ink-soft`}>
                  Konunun tamamı
                </a>
                {topic.articles.map((article) => (
                  <a
                    key={article.id}
                    href={articleHash(article.id)}
                    aria-current={article.id === activeId ? 'page' : undefined}
                    className={`${LINK_BASE} ${article.id === activeId ? LINK_ACTIVE : ''}`}
                  >
                    <b className="mr-2 font-semibold">{article.label}</b>
                    <span className="opacity-75">{article.title}</span>
                  </a>
                ))}
              </div>
            )}
          </details>
        );
      })}
    </nav>
  );
}
