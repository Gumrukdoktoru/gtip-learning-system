import { RESOURCE_CATEGORY_LABELS } from '@gtip/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Alert } from '../components/alert';
import { EmptyState } from '../components/empty-state';
import { Pagination } from '../components/pagination';
import {
  ResourceFilters,
  type ResourceFiltersValue,
} from '../components/resource-filters';
import { Spinner } from '../components/spinner';
import { useResourceDownload } from '../hooks/use-resource-download';
import { useResources } from '../hooks/use-resources';
import { ApiRequestError } from '../services/api-client';
import {
  deleteResource,
  isAdminResource,
  updateResource,
} from '../services/resource-service';
import { formatBytes, formatDate } from '../utils/format';

export function AdminResourcesPage(): JSX.Element {
  const [filters, setFilters] = useState<ResourceFiltersValue>({
    search: '',
    category: '',
  });
  const { data, isLoading, error, setPage, reload } = useResources({
    pageSize: 20,
    search: filters.search,
    category: filters.category,
  });
  const { download, downloadingId } = useResourceDownload();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function runAction(
    id: string,
    action: () => Promise<unknown>,
  ): Promise<void> {
    setBusyId(id);
    setActionError(null);

    try {
      await action();
      reload();
    } catch (cause) {
      setActionError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Kaynak Yönetimi
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Yüklenen tüm kaynaklar, depolama anahtarlarıyla birlikte.
          </p>
        </div>
        <Link to="/yonetim/yukle" className="btn-primary">
          Yeni Kaynak
        </Link>
      </div>

      <ResourceFilters value={filters} onChange={setFilters} />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}

      {isLoading ? <Spinner /> : null}

      {!isLoading && data && data.items.length === 0 ? (
        <EmptyState
          title="Henüz kaynak yok"
          description="İlk kaynağı yüklemek için “Yeni Kaynak” düğmesini kullanın."
        />
      ) : null}

      {!isLoading && data && data.items.length > 0 ? (
        <>
          <div className="card overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Başlık</th>
                  <th className="px-4 py-3 font-medium">Kategori</th>
                  <th className="px-4 py-3 font-medium">Görünürlük</th>
                  <th className="px-4 py-3 font-medium">Depolama anahtarı</th>
                  <th className="px-4 py-3 font-medium">Boyut</th>
                  <th className="px-4 py-3 font-medium">Tarih</th>
                  <th className="px-4 py-3 text-right font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((resource) => {
                  const admin = isAdminResource(resource) ? resource : null;
                  const isBusy = busyId === resource.id;

                  return (
                    <tr key={resource.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {resource.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {resource.originalFileName}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {RESOURCE_CATEGORY_LABELS[resource.category]}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            admin?.visibility === 'private'
                              ? 'whitespace-nowrap rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700'
                              : 'whitespace-nowrap rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700'
                          }
                        >
                          {admin?.visibility === 'private'
                            ? 'Özel'
                            : 'Herkese açık'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <code className="break-all text-xs text-slate-500">
                          {admin?.storageKey ?? '—'}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatBytes(resource.sizeBytes)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(resource.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 whitespace-nowrap">
                          <button
                            type="button"
                            className="btn-secondary whitespace-nowrap"
                            disabled={downloadingId === resource.id}
                            onClick={() => download(resource)}
                          >
                            İndir
                          </button>
                          {admin ? (
                            <button
                              type="button"
                              className="btn-secondary whitespace-nowrap"
                              disabled={isBusy}
                              onClick={() =>
                                runAction(resource.id, () =>
                                  updateResource(resource.id, {
                                    visibility:
                                      admin.visibility === 'public'
                                        ? 'private'
                                        : 'public',
                                  }),
                                )
                              }
                            >
                              {admin.visibility === 'public'
                                ? 'Özele al'
                                : 'Yayına al'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn-danger whitespace-nowrap"
                            disabled={isBusy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `“${resource.title}” kalıcı olarak silinsin mi?`,
                                )
                              ) {
                                void runAction(resource.id, () =>
                                  deleteResource(resource.id),
                                );
                              }
                            }}
                          >
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      ) : null}
    </div>
  );
}
