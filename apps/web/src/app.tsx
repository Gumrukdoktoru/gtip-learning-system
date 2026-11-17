import { useEffect, useMemo, useState } from 'react';
import { OtherQuestions } from './components/other-questions';
import { HeaderBar } from './components/header-bar';
import { Reader } from './components/reader';
import { ReaderContext } from './components/reader-context';
import { SearchResults } from './components/search-results';
import { Sidebar } from './components/sidebar';
import { useHashRoute } from './hooks/use-hash-route';
import { useExamGroups, useIndex, useSearch, useTopic } from './hooks/use-mevzuat';
import type { MevzuatIndex, ReaderMode } from './types/mevzuat';
import { QUESTIONS_HASH, articleHash, topicHash } from './utils/route';

const FOLDER_TOPIC_BASE = 1000;
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
  const core = [...topicOf.keys()];
  for (const group of index.groups)
    for (const folder of group.folders) for (const topic of folder.topics) for (const article of topic.articles) topicOf.set(article.id, topic.id);
  const gk = index.gk.map((entry) => entry.id);
  const gy = index.gy.map((entry) => entry.id);
  return { topicOf, knownRefs: new Set([...gk, ...gy]), order: { konu: core, gk, gy, soru: [], sinav: [], kaynak: [] } };
}

function modeForArticle(id: string, current: ReaderMode, topicId: number | undefined): ReaderMode {
  if ((topicId ?? 0) >= FOLDER_TOPIC_BASE) return 'kaynak';
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
  const groups = index.data?.groups ?? [];
  const activeGroup = groups.find((g) => g.folders.some((f) => f.topics.some((t) => t.id === activeTopic))) ?? null;
  const activeFolder = activeGroup?.folders.find((folder) => folder.topics.some((t) => t.id === activeTopic));
  const searchTopics = !index.data
    ? null
    : mode === 'kaynak'
      ? (activeFolder?.topics.map((t) => t.id) ?? [])
      : index.data.topics.map((t) => t.id);
  const search = useSearch(searchTopics, mode === 'kaynak' ? `folder-${activeFolder?.id}` : 'core', questionsView ? '' : term, mode);
  const otherQuestions = useExamGroups(route.kind === 'questions' ? route.view : null);

  useEffect(() => setTerm(''), [route]);
  useEffect(() => {
    if (route.kind === 'questions') setMode(route.view === 'sinav' ? 'sinav' : 'soru');
    else if (route.kind === 'topic') setMode(route.id >= FOLDER_TOPIC_BASE ? 'kaynak' : 'konu');
    else if (route.kind === 'article') setMode((current) => modeForArticle(route.id, current, lookup?.topicOf.get(route.id)));
  }, [route, lookup]);
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
    if (next === 'kaynak') {
      return;
    } else if ((activeTopic ?? 0) >= FOLDER_TOPIC_BASE && next !== 'soru' && next !== 'sinav') {
      window.location.hash = articleHash(first ?? lookup.order.konu[0] ?? '');
    } else if (next === 'soru' || next === 'sinav') window.location.hash = QUESTIONS_HASH[next === 'sinav' ? 'sinav' : 'diger'];
    else if (questionsView) window.location.hash = articleHash(first ?? lookup.order.konu[0] ?? '');
    else if (next !== 'konu' && first && !(activeId && lookup.order[next].includes(activeId))) {
      window.location.hash = articleHash(first);
    }
  };
  const changeGroup = (groupId: string): void => {
    setTerm('');
    const first = groups.find((g) => g.id === groupId)?.folders[0]?.topics[0]?.id;
    if (first !== undefined && activeGroup?.id !== groupId) window.location.hash = topicHash(first);
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
      <HeaderBar
        mode={mode}
        onModeChange={changeMode}
        term={term}
        onTermChange={setTerm}
        summary={`${index.data.topics.length} konu · ${lookup.topicOf.size} madde · çıkmış sorular`}
        groups={groups}
        activeGroup={activeGroup?.id ?? null}
        onGroupChange={changeGroup}
      />
      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0 rounded-2xl bg-paper p-4 shadow-2xl sm:p-8">
          <div className="mb-6 border-b border-paper-line pb-5">
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
            <OtherQuestions
              title={route.kind === 'questions' && route.view === 'sinav' ? 'Çıkmış sınavlar (2010–2026)' : 'Diğer sınav soruları'}
              groups={otherQuestions}
              term={term}
            />
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
        <Sidebar
          index={index.data}
          mode={mode}
          activeId={searching ? null : activeId}
          activeTopic={activeTopic}
          openTopics={openTopics}
          onToggleTopic={toggleTopic}
          onToggleAll={toggleAll}
          folders={activeGroup?.folders ?? []}
        />
      </div>
    </ReaderContext.Provider>
  );
}
