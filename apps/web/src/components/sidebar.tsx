import type { MevzuatIndex, ReaderMode } from '../types/mevzuat';
import { SidebarNav } from './sidebar-nav';

const MODES: { mode: ReaderMode; label: string }[] = [
  { mode: 'konu', label: 'Konular' },
  { mode: 'gk', label: 'Kanun' },
  { mode: 'gy', label: 'Yönetmelik' },
  { mode: 'soru', label: 'Diğer sorular' },
  { mode: 'sinav', label: 'Sınavlar' },
];
const PLACEHOLDER: Record<ReaderMode, string> = {
  konu: 'Tüm derlemede ara…',
  gk: 'Kanun maddelerinde ara…',
  gy: 'Yönetmelikte ara…',
  soru: 'Diğer sorularda ara…',
  sinav: 'Bütün sınav sorularında ara…',
};

interface SidebarProps {
  index: MevzuatIndex;
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  term: string;
  onTermChange: (term: string) => void;
  activeId: string | null;
  activeTopic: number | null;
  openTopics: ReadonlySet<number>;
  onToggleTopic: (topicId: number, open: boolean) => void;
  onToggleAll: () => void;
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const { index, mode, onModeChange, term, onTermChange, openTopics, onToggleAll } = props;
  const allOpen = openTopics.size === index.topics.length;
  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
      <div className="flex flex-wrap gap-1 rounded-md bg-black/5 p-1" role="group" aria-label="Görüntülenecek dizin">
        {MODES.map(({ mode: value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={value === mode}
            onClick={() => onModeChange(value)}
            className={`flex-1 whitespace-nowrap rounded px-2 py-1.5 text-xs font-semibold ${value === mode ? 'bg-ink text-white' : 'hover:bg-black/5'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={term}
        onChange={(event) => onTermChange(event.target.value)}
        placeholder={PLACEHOLDER[mode]}
        aria-label={PLACEHOLDER[mode]}
        className="w-full rounded-md border border-paper-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink"
      />
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-mute">İçindekiler</span>
        {mode === 'konu' && (
          <button type="button" onClick={onToggleAll} aria-expanded={allOpen} className="text-xs text-ink-soft hover:underline">
            {allOpen ? 'Hepsini daralt' : 'Hepsini genişlet'}
          </button>
        )}
      </div>
      <div className="max-h-[45vh] overflow-auto pr-1 lg:max-h-none lg:flex-1">
        <SidebarNav {...props} />
      </div>
    </aside>
  );
}
