import type { ReaderMode } from '../types/mevzuat';

const LAW_MODES: { mode: ReaderMode; label: string }[] = [
  { mode: 'konu', label: 'Konular' },
  { mode: 'gk', label: 'Kanun' },
  { mode: 'gy', label: 'Yönetmelik' },
];
const QUESTION_MODES: { mode: ReaderMode; label: string }[] = [
  { mode: 'sinav', label: 'Sınavlar' },
  { mode: 'soru', label: 'Diğer sorular' },
];
const TAB = 'rounded-full px-3.5 py-1.5 text-sm font-medium';
const TAB_ON = 'bg-accent text-shell';
const TAB_OFF = 'text-slate-300 hover:bg-white/10';
const PLACEHOLDER: Record<ReaderMode, string> = {
  konu: 'Tüm derlemede ara…',
  gk: 'Kanun maddelerinde ara…',
  gy: 'Yönetmelikte ara…',
  soru: 'Diğer sorularda ara…',
  sinav: 'Bütün sınav sorularında ara…',
  kaynak: 'Açık belgede ara…',
};

interface HeaderBarProps {
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  term: string;
  onTermChange: (term: string) => void;
  summary: string;
  /** Diğer not dosyalarının konu sekmeleri (Tarife, Genelge ve Tebliğler…). */
  groups: { id: string; title: string }[];
  activeGroup: string | null;
  onGroupChange: (groupId: string) => void;
}

/** Üst çubuk: başlık, bölüm sekmeleri ve arama. */
export function HeaderBar(props: HeaderBarProps): JSX.Element {
  const { mode, onModeChange, term, onTermChange, summary, groups, activeGroup, onGroupChange } = props;
  const modeTab = ({ mode: value, label }: { mode: ReaderMode; label: string }): JSX.Element => (
    <button key={value} type="button" aria-pressed={value === mode} onClick={() => onModeChange(value)} className={`${TAB} ${value === mode ? TAB_ON : TAB_OFF}`}>
      {label}
    </button>
  );
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-shell/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
        <div className="mr-auto">
          <p className="text-sm font-bold tracking-wide text-accent">Gümrük Mevzuatı</p>
          <p className="text-[11px] text-slate-400">{summary}</p>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Bölümler">
          {LAW_MODES.map(modeTab)}
          {groups.map((group) => {
            const active = mode === 'kaynak' && group.id === activeGroup;
            return (
              <button key={group.id} type="button" aria-pressed={active} onClick={() => onGroupChange(group.id)} className={`${TAB} ${active ? TAB_ON : TAB_OFF}`}>
                {group.title}
              </button>
            );
          })}
          {QUESTION_MODES.map(modeTab)}
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
