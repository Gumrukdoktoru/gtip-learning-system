import { buildYouTubeThumbnailUrl } from '@gtip/shared';
import type { MediaItem } from '@gtip/shared';
import { useState } from 'react';

import { formatDate } from '../utils/format';

export interface VideoCardProps {
  item: MediaItem;
  onPlay: (item: MediaItem) => void;
}

export function VideoCard({ item, onPlay }: VideoCardProps): JSX.Element {
  // YouTube does not always have an hqdefault frame ready for a fresh upload,
  // and a blocked image request would otherwise show a broken-image icon.
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  return (
    <article className="card group flex h-full flex-col overflow-hidden">
      <button
        type="button"
        className="relative block aspect-video w-full overflow-hidden bg-slate-200"
        onClick={() => onPlay(item)}
        aria-label={`${item.title} videosunu oynat`}
      >
        {thumbnailFailed ? (
          <span className="flex h-full w-full items-end bg-gradient-to-br from-slate-700 to-slate-900 p-3">
            <span className="line-clamp-2 text-left text-xs font-medium text-white/90">
              {item.title}
            </span>
          </span>
        ) : (
          <img
            src={item.thumbnailUrl ?? buildYouTubeThumbnailUrl(item.externalId)}
            alt=""
            loading="lazy"
            onError={() => setThumbnailFailed(true)}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition group-hover:bg-white">
            <svg
              viewBox="0 0 24 24"
              className="ml-1 h-6 w-6 fill-brand-600"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
            YouTube
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
            YouTube&apos;da aç
          </a>
        </div>
      </div>
    </article>
  );
}
