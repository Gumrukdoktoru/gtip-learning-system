import { useEffect } from 'react';
import type { Loadable } from '../hooks/use-mevzuat';
import type { ArticleBlock, Topic } from '../types/mevzuat';
import { articleHash } from '../utils/route';
import { ArticleCard } from './article-card';
import { BlockList } from './block-list';

interface ReaderProps {
  topic: Loadable<Topic>;
  activeId: string | null;
  /** true: konunun tamamı, false: tek madde. */
  whole: boolean;
  previousId: string | null;
  nextId: string | null;
  onRetry: () => void;
}

const STEP_LINK = 'rounded-md border border-paper-line bg-white px-4 py-2 text-sm hover:bg-black/5';

export function Reader({ topic, activeId, whole, previousId, nextId, onRetry }: ReaderProps): JSX.Element {
  const loaded = topic.data;
  useEffect(() => {
    if (!loaded) return;
    const target = whole && activeId ? document.getElementById(activeId) : null;
    if (target) target.scrollIntoView({ block: 'start' });
    else window.scrollTo({ top: 0 });
  }, [loaded, activeId, whole]);

  if (topic.error) {
    return (
      <p className="text-kanun">
        Bölüm yüklenemedi: {topic.error}{' '}
        <button type="button" onClick={onRetry} className="underline">
          Yeniden dene
        </button>
      </p>
    );
  }
  if (!loaded) return <p className="text-ink-mute">Bölüm yükleniyor…</p>;

  const context = loaded.id >= 1000 ? loaded.title : `${loaded.id}. ${loaded.title}`;
  if (whole) {
    return (
      <>
        <h2 className="mb-5 font-read text-3xl">{context}</h2>
        <BlockList blocks={loaded.blocks} />
      </>
    );
  }
  const article = loaded.blocks.find((block): block is ArticleBlock => block.t === 'a' && block.id === activeId);
  if (!article) return <p className="text-ink-soft">Bu madde derlemede bulunamadı.</p>;
  return (
    <>
      <ArticleCard article={article} context={context} />
      <div className="flex justify-between gap-3">
        {previousId ? (
          <a href={articleHash(previousId)} className={STEP_LINK}>
            ← Önceki madde
          </a>
        ) : (
          <span />
        )}
        {nextId && (
          <a href={articleHash(nextId)} className={STEP_LINK}>
            Sonraki madde →
          </a>
        )}
      </div>
    </>
  );
}
