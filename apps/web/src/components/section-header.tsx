export interface SectionHeaderProps {
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({
  title,
  count,
  actionLabel,
  onAction,
}: SectionHeaderProps): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-lg font-semibold text-slate-900">
        {title}
        {count === undefined ? null : (
          <span className="ml-2 text-sm font-normal text-slate-500">
            {count}
          </span>
        )}
      </h2>
      {actionLabel && onAction ? (
        <button
          type="button"
          className="text-sm font-medium text-brand-700 hover:underline"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
