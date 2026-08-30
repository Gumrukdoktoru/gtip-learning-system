export type HubTab = 'all' | 'video' | 'instagram' | 'document' | 'quiz';

export const HUB_TAB_LABELS: Record<HubTab, string> = {
  all: 'Tümü',
  video: 'Videolar',
  instagram: 'Instagram',
  document: 'Belgeler',
  quiz: 'Test',
};

const TAB_ORDER: HubTab[] = ['all', 'video', 'instagram', 'document', 'quiz'];

export interface HubTabsProps {
  value: HubTab;
  onChange: (tab: HubTab) => void;
}

export function HubTabs({ value, onChange }: HubTabsProps): JSX.Element {
  return (
    <div role="tablist" aria-label="İçerik türü" className="flex flex-wrap gap-2">
      {TAB_ORDER.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          className={[
            'rounded-lg px-4 py-2 text-sm font-medium transition',
            value === tab
              ? 'bg-brand-600 text-white'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
          ].join(' ')}
          onClick={() => onChange(tab)}
        >
          {HUB_TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );
}
