import { buildInstagramEmbedUrl } from '@gtip/shared';
import type { MediaItem } from '@gtip/shared';
import { useState } from 'react';

import { formatDate } from '../utils/format';

export interface InstagramCardProps {
  item: MediaItem;
  /** Offers the "show the post here" toggle; off in dense overview sections. */
  allowEmbed?: boolean;
}

/**
 * Card for a curated Instagram post.
 *
 * The official embed frame is mounted only when the reader asks for it: it is
 * a third-party iframe that costs a request and half a screen of height, and
 * it renders blank for a deleted or restricted post. Title, description and
 * the outbound link always work, embed or not.
 */
export function InstagramCard({
  item,
  allowEmbed = false,
}: InstagramCardProps): JSX.Element {
  const [isEmbedOpen, setIsEmbedOpen] = useState(false);

  return (
    <article className="card flex h-full flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-pink-50 px-2.5 py-1 text-xs font-medium text-pink-700">
            Instagram
          </span>
          {item.isPinned ? (
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              Öne çıkan
            </span>
          ) : null}
        </div>

        <h3 className="text-sm font-semibold leading-snug text-slate-900">
          {item.title}
        </h3>

        {item.description ? (
          <p className="line-clamp-3 text-xs text-slate-600">
            {item.description}
          </p>
        ) : null}

        {allowEmbed ? (
          <button
            type="button"
            className="btn-secondary mt-2 self-start"
            onClick={() => setIsEmbedOpen((open) => !open)}
          >
            {isEmbedOpen ? 'Gönderiyi gizle' : 'Gönderiyi burada göster'}
          </button>
        ) : null}

        <div className="mt-auto flex items-center justify-between pt-3 text-xs text-slate-500">
          <span>{formatDate(item.publishedAt)}</span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 hover:underline"
          >
            Instagram&apos;da aç
          </a>
        </div>
      </div>

      {allowEmbed && isEmbedOpen ? (
        <div className="border-t border-slate-100">
          <iframe
            src={buildInstagramEmbedUrl(item.externalId)}
            title={item.title}
            loading="lazy"
            className="h-[520px] w-full border-0"
          />
          <p className="px-4 pb-4 text-xs text-slate-500">
            Gönderi görünmüyorsa Instagram&apos;da açın.
          </p>
        </div>
      ) : null}
    </article>
  );
}
