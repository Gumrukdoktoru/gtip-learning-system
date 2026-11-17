import type { Folder, MevzuatIndex, ReaderMode } from '../types/mevzuat';
import { SidebarNav } from './sidebar-nav';

interface SidebarProps {
  index: MevzuatIndex;
  mode: ReaderMode;
  activeId: string | null;
  activeTopic: number | null;
  openTopics: ReadonlySet<number>;
  onToggleTopic: (topicId: number, open: boolean) => void;
  onToggleAll: () => void;
  folders: Folder[];
}

/** İçindekiler paneli (geniş ekranda sağda, dar ekranda içeriğin üstünde açılır). */
export function Sidebar(props: SidebarProps): JSX.Element {
  const { index, mode, openTopics, onToggleAll } = props;
  const allOpen = openTopics.size === index.topics.length;
  return (
    <aside className="order-first text-slate-200 lg:order-last lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-auto">
      <details open className="rounded-xl border border-white/10 bg-white/5 p-3">
        <summary className="flex cursor-pointer items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          İçindekiler
          {mode === 'konu' && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                onToggleAll();
              }}
              aria-expanded={allOpen}
              className="text-xs normal-case tracking-normal text-accent hover:underline"
            >
              {allOpen ? 'Hepsini daralt' : 'Hepsini genişlet'}
            </button>
          )}
        </summary>
        <div className="mt-3 max-h-[40vh] overflow-auto pr-1 lg:max-h-none">
          <SidebarNav {...props} />
        </div>
      </details>
    </aside>
  );
}
