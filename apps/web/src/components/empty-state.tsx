export interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({
  title,
  description,
}: EmptyStateProps): JSX.Element {
  return (
    <div className="card px-6 py-12 text-center">
      <p className="text-base font-medium text-slate-700">{title}</p>
      {description ? (
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}
