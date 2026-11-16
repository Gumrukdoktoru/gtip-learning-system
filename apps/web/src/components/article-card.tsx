import type { ArticleBlock } from '../types/mevzuat';
import { articleHash } from '../utils/route';
import { RichText } from './rich-text';

const SOURCE_STYLE: Record<string, string> = {
  GK: 'border-kanun text-kanun',
  GY: 'border-yonetmelik text-yonetmelik',
  '': 'border-diger text-diger',
};

interface ArticleCardProps {
  article: ArticleBlock;
  /** Kartın üstünde gösterilecek bağlam (ör. konu adı). */
  context?: string;
}

export function ArticleCard({ article, context }: ArticleCardProps): JSX.Element {
  const tone = SOURCE_STYLE[article.src] ?? SOURCE_STYLE[''];
  return (
    <article
      id={article.id}
      className="mb-6 scroll-mt-4 rounded-lg border border-paper-line bg-paper-card px-5 py-6 shadow-sm sm:px-10 sm:py-9"
    >
      <header className={`mb-5 border-b-2 pb-4 ${tone}`}>
        {(context || article.doc) && (
          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-ink-mute">
            {[context, article.doc].filter(Boolean).join(' · ')}
          </p>
        )}
        <a href={articleHash(article.id)} className="text-xs font-semibold uppercase tracking-[0.2em] hover:underline">
          {article.label}
        </a>
        {article.title && (
          <h2 className="mt-1 font-read text-2xl leading-snug text-ink sm:text-[28px]">
            <RichText text={article.title} />
          </h2>
        )}
      </header>
      <div className="font-read leading-[1.85] text-ink" style={{ fontSize: 'var(--reading-size)' }}>
        {article.p.map((paragraph, i) => (
          <p key={i} className="mb-3.5">
            {i === 0 && <strong className={`mr-1 font-sans text-[0.8em] ${tone}`}>{article.label} –</strong>}
            <RichText text={paragraph} source={article.src} />
          </p>
        ))}
      </div>
    </article>
  );
}
