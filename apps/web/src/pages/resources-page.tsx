import { Alert } from '../components/alert';
import { EmptyState } from '../components/empty-state';
import { Pagination } from '../components/pagination';
import { ResourceCard } from '../components/resource-card';
import { ResourceFilters } from '../components/resource-filters';
import { Spinner } from '../components/spinner';
import { useResourceDownload } from '../hooks/use-resource-download';
import { useResources } from '../hooks/use-resources';

export function ResourcesPage(): JSX.Element {
  const { data, isLoading, error, filters, setFilters, page, setPage } =
    useResources();
  const { download, downloadingId, error: downloadError } =
    useResourceDownload();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Gümrük Mevzuatı Kaynakları
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Tebliğ, genelge ve kılavuzları arayın ve PDF veya HTML olarak indirin.
        </p>
      </div>

      <ResourceFilters value={filters} onChange={setFilters} />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {downloadError ? <Alert tone="error">{downloadError}</Alert> : null}

      {isLoading ? <Spinner /> : null}

      {!isLoading && data && data.items.length === 0 ? (
        <EmptyState
          title="Kayıt bulunamadı"
          description="Arama teriminizi veya kategori filtresini değiştirmeyi deneyin."
        />
      ) : null}

      {!isLoading && data && data.items.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                onDownload={download}
                isDownloading={downloadingId === resource.id}
              />
            ))}
          </div>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      ) : null}

      <span className="sr-only">Geçerli sayfa: {page}</span>
    </div>
  );
}
