import type { Block } from '../types/mevzuat';
import { ArticleCard } from './article-card';
import { RichText } from './rich-text';
import { SolvedQuestion } from './solved-question';

interface BlockListProps {
  blocks: Block[];
}

/** Bir konunun bütün bloklarını (başlık, paragraf, madde) sırasıyla çizer. */
export function BlockList({ blocks }: BlockListProps): JSX.Element {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.t) {
          case 'a':
            return <ArticleCard key={block.id} article={block} />;
          case 'q':
            return <SolvedQuestion key={i} question={block} />;
          case 't':
            return (
              <div key={i} className="mb-5 overflow-x-auto rounded-lg border border-paper-line bg-paper-card">
                <table className="w-full border-collapse text-left text-sm">
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className={r === 0 ? 'bg-ink text-white' : 'border-t border-paper-line align-top'}>
                        {row.map((cell, c) =>
                          r === 0 ? (
                            <th key={c} className="px-3 py-2 font-semibold">
                              {cell}
                            </th>
                          ) : (
                            <td key={c} className="px-3 py-2">
                              <RichText text={cell} />
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'd':
            return (
              <h3 key={i} className="mb-4 mt-10 rounded-md bg-ink px-4 py-3 text-sm font-semibold tracking-wide text-white">
                {block.x}
              </h3>
            );
          case 'h':
            return (
              <h4
                key={i}
                className="mb-3 mt-7 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.15em] text-ink-soft after:h-px after:flex-1 after:bg-paper-line"
              >
                {block.x}
              </h4>
            );
          default:
            return (
              <p key={i} className="mb-3 px-1 font-read leading-relaxed" style={{ fontSize: 'var(--reading-size)' }}>
                <RichText text={block.x} />
              </p>
            );
        }
      })}
    </>
  );
}
