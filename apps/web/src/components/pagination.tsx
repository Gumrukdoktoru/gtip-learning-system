import type { PaginationMeta } from '@gtip/shared';

export interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
}

export function Pagination({
  pagination,
  onPageChange,
}: PaginationProps): JSX.Element | null {
  const { page, totalPages, total } = pagination;

  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="Sayfalama"
      className="flex items-center justify-between gap-4 pt-2"
    >
      <p className="text-sm text-slate-500">
        Sayfa {page} / {totalPages} · toplam {total} kayıt
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Önceki
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sonraki
        </button>
      </div>
    </nav>
  );
}
