import { useEffect, useState } from 'react';
import type { Loadable, SearchHit } from '../hooks/use-mevzuat';
import { ArticleCard } from './article-card';

const PAGE_SIZE = 20;

interface SearchResultsProps {
  term: string;
  result: Loadable<SearchHit[]>;
}

export function SearchResults({ term, result }: SearchResultsProps): JSX.Element {
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [term]);

  if (result.error) return <p className="text-kanun">Arama verisi yüklenemedi: {result.error}</p>;
  if (!result.data) return <p className="text-ink-mute">Derleme taranıyor…</p>;
  const hits = result.data;
  return (
    <>
      <p className="mb-4 text-sm text-ink-soft" aria-live="polite">
        <strong>{hits.length}</strong> yerde eşleşme
      </p>
      {hits.slice(0, limit).map(({ topic, article }, i) => (
        <ArticleCard key={`${article.id}-${i}`} article={article} context={topic.id >= 1000 ? topic.title : `${topic.id}. ${topic.title}`} />
      ))}
      {hits.length > limit && (
        <button
          type="button"
          onClick={() => setLimit(limit + PAGE_SIZE)}
          className="rounded-md border border-paper-line bg-white px-4 py-2 text-sm hover:bg-black/5"
        >
          Daha fazla göster ({hits.length - limit} madde kaldı)
        </button>
      )}
    </>
  );
}
