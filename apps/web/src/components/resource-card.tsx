import { RESOURCE_CATEGORY_LABELS } from '@gtip/shared';

import type { ResourceListItem } from '../services/resource-service';
import { isAdminResource } from '../services/resource-service';
import { formatBytes, formatDate, formatFileType } from '../utils/format';

export interface ResourceCardProps {
  resource: ResourceListItem;
  onDownload: (resource: ResourceListItem) => void;
  isDownloading?: boolean;
}

export function ResourceCard({
  resource,
  onDownload,
  isDownloading = false,
}: ResourceCardProps): JSX.Element {
  const isPrivate = isAdminResource(resource) && resource.visibility === 'private';

  return (
    <article className="card flex h-full flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
          {RESOURCE_CATEGORY_LABELS[resource.category]}
        </span>
        <div className="flex items-center gap-2">
          {isPrivate ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              Özel
            </span>
          ) : null}
          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            {formatFileType(resource.mimeType)}
          </span>
        </div>
      </div>

      <h3 className="text-base font-semibold leading-snug text-slate-900">
        {resource.title}
      </h3>

      {resource.description ? (
        <p className="line-clamp-3 text-sm text-slate-600">
          {resource.description}
        </p>
      ) : null}

      <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-1 pt-2 text-xs text-slate-500">
        <div className="col-span-2 truncate" title={resource.originalFileName}>
          <dt className="sr-only">Dosya adı</dt>
          <dd className="truncate">{resource.originalFileName}</dd>
        </div>
        <div>
          <dt className="sr-only">Boyut</dt>
          <dd>{formatBytes(resource.sizeBytes)}</dd>
        </div>
        <div className="text-right">
          <dt className="sr-only">Yüklenme tarihi</dt>
          <dd>{formatDate(resource.createdAt)}</dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-500">
          {resource.downloadCount} indirme
        </span>
        <button
          type="button"
          className="btn-primary"
          disabled={isDownloading}
          onClick={() => onDownload(resource)}
        >
          {isDownloading ? 'Hazırlanıyor…' : 'İndir'}
        </button>
      </div>
    </article>
  );
}
