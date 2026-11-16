import { useEffect, useMemo, useState } from 'react';
import { OtherQuestions } from './components/other-questions';
import { Reader } from './components/reader';
import { ReaderContext } from './components/reader-context';
import { SearchResults } from './components/search-results';
import { Sidebar } from './components/sidebar';
import { useHashRoute } from './hooks/use-hash-route';
import { useIndex, useOtherQuestions, useSearch, useTopic } from './hooks/use-mevzuat';
import type { MevzuatIndex, ReaderMode } from './types/mevzuat';
import { QUESTIONS_HASH, articleHash } from './utils/route';

const MIN_FONT = 14;
const MAX_FONT = 26;
const TOOL_BUTTON = 'rounded-md border border-paper-line px-3 py-1.5 text-xs hover:bg-black/5';

interface Lookup {
  topicOf: Map<string, number>;
  knownRefs: Set<string>;
  order: Record<ReaderMode, string[]>;
}

function buildLookup(index: MevzuatIndex): Lookup {
  const topicOf = new Map<string, number>();
  for (const topic of index.topics) for (const article of topic.articles) topicOf.set(article.id, topic.id);
  const gk = index.gk.map((entry) => entry.id);
  const gy = index.gy.map((entry) => entry.id);
  return { topicOf, knownRefs: new Set([...gk, ...gy]), order: { konu: [...topicOf.keys()], gk, gy, soru: [] } };
}

function modeForArticle(id: string, current: ReaderMode): ReaderMode {
  if (current === 'konu') return 'konu';
  return id.startsWith('gk-') ? 'gk' : id.startsWith('gy-') ? 'gy' : 'konu';
}

export function App(): JSX.Element {
  const [retry, setRetry] = useState(0);
  const index = useIndex(retry);
  const route = useHashRoute();
  const [mode, setMode] = useState<ReaderMode>('konu');
  const [term, setTerm] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [openTopics, setOpenTopics] = useState<ReadonlySet<number>>(new Set());

  const lookup = useMemo(() => (index.data ? buildLookup(index.data) : null), [index.data]);
  const activeId = route.kind === 'article' ? route.id : route.kind === 'home' ? (lookup?.order.konu[0] ?? null) : null;
  const activeTopic = route.kind === 'topic' ? route.id : activeId ? (lookup?.topicOf.get(activeId) ?? null) : null;
  const topic = useTopic(lookup ? activeTopic : null, retry);
  const questionsView = route.kind === 'questions';
  const searching = !questionsView && term.trim().length >= 2;
  const search = useSearch(index.data, questionsView ? '' : term, mode);
  const otherQuestions = useOtherQuestions(questionsView);

  useEffect(() => setTerm(''), [route]);
  useEffect(() => {
    if (route.kind === 'questions') setMode('soru');
    else if (route.kind === 'topic') setMode('konu');
    else if (route.kind === 'article') setMode((current) => modeForArticle(route.id, current));
  }, [route]);
  useEffect(() => {
    if (activeTopic !== null) setOpenTopics((open) => (open.has(activeTopic) ? open : new Set(open).add(activeTopic)));
  }, [activeTopic]);
  useEffect(() => {
    document.documentElement.style.setProperty('--reading-size', `${fontSize}px`);
  }, [fontSize]);

  const context = useMemo(
    () => ({ knownRefs: lookup?.knownRefs ?? new Set<string>(), term: searching || questionsView ? term.trim() : '' }),
    [lookup, searching, questionsView, term],
  );

  if (index.error) {
    return (
      <p className="p-8 text-kanun">
        Derleme yüklenemedi: {index.error}{' '}
        <button type="button" className="underline" onClick={() => setRetry(retry + 1)}>
          Yeniden dene
        </button>
      </p>
    );
  }
  if (!index.data || !lookup) return <p className="p-8 text-ink-mute">Derleme yükleniyor…</p>;

  const order = lookup.order[mode];
  const position = activeId ? order.indexOf(activeId) : -1;
  const changeMode = (next: ReaderMode): void => {
    setMode(next);
    setTerm('');
    const first = lookup.order[next][0];
    if (next === 'soru') window.location.hash = QUESTIONS_HASH;
    else if (questionsView) window.location.hash = articleHash(first ?? lookup.order.konu[0] ?? '');
    else if (next !== 'konu' && first && !(activeId && lookup.order[next].includes(activeId))) {
      window.location.hash = articleHash(first);
    }
  };
  const toggleTopic = (topicId: number, open: boolean): void =>
    setOpenTopics((current) => {
      if (current.has(topicId) === open) return current;
      const next = new Set(current);
      if (open) next.add(topicId);
      else next.delete(topicId);
      return next;
    });
  const toggleAll = (): void =>
    setOpenTopics(openTopics.size === index.data!.topics.length ? new Set() : new Set(index.data!.topics.map((t) => t.id)));

  return (
    <ReaderContext.Provider value={context}>
      <header className="flex flex-wrap items-center justify-between gap-2 bg-ink px-5 py-3.5 text-white sm:px-9">
        <span className="text-xs font-semibold tracking-[0.22em]">GÜMRÜK MEVZUATI OKUYUCU</span>
        <span className="text-xs text-white/70">
          {index.data.topics.length} konu · {lookup.topicOf.size} madde
        </span>
      </header>
      <div className="mx-auto grid max-w-[1400px] gap-8 p-4 sm:p-8 lg:grid-cols-[290px_minmax(0,1fr)]">
        <Sidebar
          index={index.data}
          mode={mode}
          onModeChange={changeMode}
          term={term}
          onTermChange={setTerm}
          activeId={searching ? null : activeId}
          activeTopic={activeTopic}
          openTopics={openTopics}
          onToggleTopic={toggleTopic}
          onToggleAll={toggleAll}
        />
        <main className="min-w-0">
          <div className="mb-6 border-b border-paper-line pb-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink-mute">Konu esaslı derleme</p>
            <h1 className="my-2 font-read text-4xl tracking-tight">Gümrük Mevzuatı</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className={TOOL_BUTTON} aria-label="Yazıyı büyüt" onClick={() => setFontSize(Math.min(MAX_FONT, fontSize + 1))}>
                A+
              </button>
              <button type="button" className={TOOL_BUTTON} aria-label="Yazıyı küçült" onClick={() => setFontSize(Math.max(MIN_FONT, fontSize - 1))}>
                A−
              </button>
              <button type="button" className={TOOL_BUTTON} aria-pressed={showAll} onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Tek madde görünümü' : 'Konunun bütün maddeleri'}
              </button>
              <span className="ml-auto flex gap-3 text-[11px] font-semibold">
                <span className="text-kanun">GK · Kanun</span>
                <span className="text-yonetmelik">GY · Yönetmelik</span>
                <span className="text-diger">Diğer mevzuat</span>
              </span>
            </div>
          </div>
          {questionsView ? (
            <OtherQuestions groups={otherQuestions} term={term} />
          ) : searching ? (
            <SearchResults term={term.trim()} result={search} />
          ) : (
            <Reader
              topic={topic}
              activeId={activeId}
              whole={showAll || route.kind === 'topic'}
              previousId={position > 0 ? (order[position - 1] ?? null) : null}
              nextId={position >= 0 ? (order[position + 1] ?? null) : null}
              onRetry={() => setRetry(retry + 1)}
            />
          )}
        </main>
      </div>
    </ReaderContext.Provider>
  );
}
