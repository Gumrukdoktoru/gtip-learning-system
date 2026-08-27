import type { ReactNode } from 'react';

export type AlertTone = 'error' | 'success' | 'info';

const TONE_CLASSES: Record<AlertTone, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-brand-200 bg-brand-50 text-brand-800',
};

export interface AlertProps {
  tone?: AlertTone;
  children: ReactNode;
}

export function Alert({ tone = 'info', children }: AlertProps): JSX.Element {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${TONE_CLASSES[tone]}`}
    >
      {children}
    </div>
  );
}
