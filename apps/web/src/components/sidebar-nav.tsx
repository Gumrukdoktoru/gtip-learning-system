import { useEffect, useRef } from 'react';
import type { Folder, LawEntry, MevzuatIndex, ReaderMode } from '../types/mevzuat';
import { articleHash, topicHash } from '../utils/route';

interface SidebarNavProps {
  index: MevzuatIndex;
  mode: ReaderMode;
  activeId: string | null;
  activeTopic: number | null;
  openTopics: ReadonlySet<number>;
  onToggleTopic: (topicId: number, open: boolean) => void;
  /** 'kaynak' bölümünde açık sekmenin belgeleri. */
  folders: Folder[];
}

const LINK_BASE = 'block rounded px-3 py-1.5 text-[13px] leading-snug hover:bg-white/10';
const LINK_ACTIVE = 'bg-accent font-semibold text-shell hover:bg-accent';
const LAW_LISTS: Partial<Record<ReaderMode, { label: string; code: string }>> = {
  gk: { label: 'Kanun maddeleri', code: 'GK' },
  gy: { label: 'Yönetmelik maddeleri', code: 'GY' },
  yys: { label: 'YYS Yönetmeliği maddeleri', code: 'YYS' },
};

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

  if (mode === 'kaynak') {
    return (
      <nav ref={container} aria-label="Ek kaynaklar">
        {props.folders.map((folder) => (
          <details
            key={folder.id}
            open={props.folders.length === 1 || folder.topics.some((topic) => topic.id === activeTopic) || undefined}
            className="border-b border-white/10"
          >
            <summary className="cursor-pointer px-2 py-2 text-[13px] font-semibold">
              {folder.title} <span className="font-normal text-slate-400">({folder.topics.length})</span>
            </summary>
            <div className="pb-2 pl-2">
              {folder.topics.map((topic) => (
                <a
                  key={topic.id}
                  href={topicHash(topic.id)}
                  aria-current={topic.id === activeTopic ? 'page' : undefined}
                  className={`${LINK_BASE} ${topic.id === activeTopic ? LINK_ACTIVE : ''}`}
                >
                  {topic.title}
                </a>
              ))}
            </div>
          </details>
        ))}
      </nav>
    );
  }
  if (mode === 'sinav') {
    return (
      <p className="px-2 text-[13px] leading-relaxed text-slate-300">
        Bütün çıkmış sorular sağda, yıllara ve sınavlara göre listelenir. Her sorunun altında bağlı olduğu maddeye geçiş vardır.
      </p>
    );
  }
  if (mode === 'soru') {
    return (
      <p className="px-2 text-[13px] leading-relaxed text-slate-300">
        Kanun ve Yönetmelik maddelerine bağlanamayan sınav soruları sağda, sınavlara göre listelenir. Maddeye bağlı sorular ilgili
        maddenin altındadır.
      </p>
    );
  }
  const law = LAW_LISTS[mode];
  if (law) {
    const entries = mode === 'gk' ? index.gk : mode === 'gy' ? index.gy : (index.yys ?? []);
    return (
      <nav ref={container} aria-label={law.label}>
        <LawList entries={entries} code={law.code} activeId={activeId} />
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
            className="border-b border-white/10"
          >
            <summary
              className={`cursor-pointer px-2 py-2 text-[13px] font-semibold ${topic.id === activeTopic ? 'text-accent' : ''}`}
            >
              <span className="mr-1.5 text-slate-400">{topic.id}.</span>
              {topic.title}
              <span className="ml-1.5 font-normal text-slate-400">({topic.articles.length})</span>
            </summary>
            {open && (
              <div className="pb-2 pl-2">
                <a href={topicHash(topic.id)} className={`${LINK_BASE} italic text-slate-300`}>
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
