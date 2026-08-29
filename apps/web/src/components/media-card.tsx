import { MEDIA_SOURCE_LABELS } from '@gtip/shared';
import type { MediaItem, MediaSource } from '@gtip/shared';
import { useState } from 'react';

import { formatDate } from '../utils/format';

interface SourceStyle {
  badgeClass: string;
  placeholderClass: string;
  /** Aspect ratio of the card image, matching each platform's own format. */
  aspectClass: string;
  openLabel: string;
  /** Verb used in the image button's accessible name. */
  actionVerb: string;
}

const SOURCE_STYLES: Record<MediaSource, SourceStyle> = {
  youtube: {
    badgeClass: 'bg-red-50 text-red-700',
    placeholderClass: 'from-slate-700 to-slate-900',
    aspectClass: 'aspect-video',
    openLabel: 'YouTube’da aç',
    actionVerb: 'videosunu oynat',
  },
  instagram: {
    badgeClass: 'bg-pink-50 text-pink-700',
    placeholderClass: 'from-fuchsia-600 via-pink-600 to-orange-500',
    aspectClass: 'aspect-square',
    openLabel: 'Instagram’da aç',
    actionVerb: 'gönderisini aç',
  },
};

export interface MediaCardProps {
  item: MediaItem;
  onOpen: (item: MediaItem) => void;
}

/**
 * One card for both shelves.
 *
 * YouTube supplies its own frame; an Instagram card shows a cover the coach
 * uploaded, because Instagram offers no keyless way to read a post's image.
 * With no image at all the card still reads as a card — a branded panel
 * carrying the title — rather than an empty box.
 */
export function MediaCard({ item, onOpen }: MediaCardProps): JSX.Element {
  const style = SOURCE_STYLES[item.source];
  // A thumbnail can 404 (a fresh upload, a removed cover) or be blocked by a
  // network; falling back keeps a broken-image icon off the page.
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.thumbnailUrl) && !imageFailed;

  return (
    <article className="card group flex h-full flex-col overflow-hidden">
      <button
        type="button"
        className={`relative block w-full overflow-hidden bg-slate-200 ${style.aspectClass}`}
        onClick={() => onOpen(item)}
        aria-label={`${item.title} ${style.actionVerb}`}
      >
        {showImage ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          // The title already sits below the image, so the placeholder carries
          // the platform instead of repeating it.
          <span
            className={`flex h-full w-full items-end bg-gradient-to-br p-3 ${style.placeholderClass}`}
            aria-hidden="true"
          >
            <span className="text-sm font-semibold uppercase tracking-wide text-white/70">
              {MEDIA_SOURCE_LABELS[item.source]}
            </span>
          </span>
        )}

        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition group-hover:bg-white">
            {item.source === 'youtube' ? (
              <svg
                viewBox="0 0 24 24"
                className="ml-1 h-6 w-6 fill-brand-600"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6 fill-none stroke-pink-600"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.2" cy="6.8" r="1.1" className="fill-pink-600" />
              </svg>
            )}
          </span>
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${style.badgeClass}`}
          >
            {MEDIA_SOURCE_LABELS[item.source]}
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
          <p className="line-clamp-2 text-xs text-slate-600">
            {item.description}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-slate-500">
          <span>{formatDate(item.publishedAt)}</span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 hover:underline"
          >
            {style.openLabel}
          </a>
        </div>
      </div>
    </article>
  );
}
