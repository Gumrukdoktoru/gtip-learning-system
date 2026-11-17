import type { ReaderMode } from '../types/mevzuat';

const MODES: { mode: ReaderMode; label: string }[] = [
  { mode: 'konu', label: 'Konular' },
  { mode: 'gk', label: 'Kanun' },
  { mode: 'gy', label: 'Yönetmelik' },
  { mode: 'kaynak', label: 'Ek kaynaklar' },
  { mode: 'sinav', label: 'Sınavlar' },
  { mode: 'soru', label: 'Diğer sorular' },
];
const PLACEHOLDER: Record<ReaderMode, string> = {
  konu: 'Tüm derlemede ara…',
  gk: 'Kanun maddelerinde ara…',
  gy: 'Yönetmelikte ara…',
  soru: 'Diğer sorularda ara…',
  sinav: 'Bütün sınav sorularında ara…',
  kaynak: 'Açık klasörde ara…',
};

interface HeaderBarProps {
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  term: string;
  onTermChange: (term: string) => void;
  summary: string;
}

/** Üst çubuk: başlık, bölüm sekmeleri ve arama. */
export function HeaderBar({ mode, onModeChange, term, onTermChange, summary }: HeaderBarProps): JSX.Element {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-shell/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
        <div className="mr-auto">
          <p className="text-sm font-bold tracking-wide text-accent">Gümrük Mevzuatı</p>
          <p className="text-[11px] text-slate-400">{summary}</p>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Bölümler">
          {MODES.map(({ mode: value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === mode}
              onClick={() => onModeChange(value)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                value === mode ? 'bg-accent text-shell' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <input
          type="search"
          value={term}
          onChange={(event) => onTermChange(event.target.value)}
          placeholder={PLACEHOLDER[mode]}
          aria-label={PLACEHOLDER[mode]}
          className="w-full rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white outline-none placeholder:text-slate-400 focus:border-accent sm:w-72"
        />
      </div>
    </header>
  );
}
