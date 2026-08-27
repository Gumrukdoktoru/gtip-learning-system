export interface SpinnerProps {
  label?: string;
}

export function Spinner({ label = 'Yükleniyor…' }: SpinnerProps): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
