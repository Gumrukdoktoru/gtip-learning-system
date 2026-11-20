import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { loadRefs } from '../services/mevzuat-data';
import type { RefPreviewData } from '../types/mevzuat';
import { articleHash } from '../utils/route';

const OPEN_DELAY_MS = 220;
const PREVIEW_WIDTH = 440;

interface RefLinkProps {
  target: string;
  text: string;
}

function previewPosition(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(PREVIEW_WIDTH, window.innerWidth - 24);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const below = window.innerHeight - rect.bottom > 280 || rect.top < 280;
  return below
    ? { left, top: rect.bottom + 6, width }
    : { left, bottom: window.innerHeight - rect.top + 6, width };
}

/** Metin içi madde atfı: üzerine gelince önizleme açar, tıklayınca maddeye gider. */
export function RefLink({ target, text }: RefLinkProps): JSX.Element {
  const anchor = useRef<HTMLAnchorElement>(null);
  const timer = useRef<number>();
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const [preview, setPreview] = useState<RefPreviewData | null>(null);

  const open = (): void => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!anchor.current) return;
      setStyle(previewPosition(anchor.current));
      loadRefs().then(
        (refs) => setPreview(refs[target] ?? null),
        () => setPreview(null),
      );
    }, OPEN_DELAY_MS);
  };
  const close = (): void => {
    window.clearTimeout(timer.current);
    setStyle(null);
  };

  useEffect(() => {
    if (!style) return;
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [style]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <>
      <a
        ref={anchor}
        href={articleHash(target)}
        className="border-b border-dotted border-current font-medium text-kanun hover:bg-rose-50 data-[kind=gy]:text-yonetmelik data-[kind=gy]:hover:bg-teal-50 data-[kind=yy]:text-yys data-[kind=yy]:hover:bg-violet-50"
        data-kind={target.slice(0, 2)}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={close}
      >
        {text}
      </a>
      {style && preview && (
        <span
          role="tooltip"
          style={style}
          className="fixed z-30 block max-h-72 overflow-hidden rounded-lg border border-paper-line bg-white p-4 text-left font-sans text-sm leading-relaxed text-ink shadow-xl"
        >
          <strong className="block text-xs uppercase tracking-widest text-ink-mute">{preview.label}</strong>
          {preview.title && <span className="mb-1 block font-semibold">{preview.title}</span>}
          {preview.p.slice(0, 6).map((paragraph, i) => (
            <span key={i} className="mt-1 block">
              {paragraph}
            </span>
          ))}
          {(preview.more || preview.p.length > 6) && <span className="mt-1 block text-ink-mute">…</span>}
        </span>
      )}
    </>
  );
}
