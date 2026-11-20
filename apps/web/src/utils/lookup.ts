import type { Folder, MevzuatIndex, ReaderMode } from '../types/mevzuat';

/** Kimliği bu değer ve üzeri olan konular diğer not dosyalarındandır (Tarife, Sair Mevzuat…). */
export const FOLDER_TOPIC_BASE = 1000;

/** Madde kimliğinin mevzuat öneki -> o mevzuatın sekmesi. */
const LAW_PREFIXES: [string, ReaderMode][] = [
  ['gk-', 'gk'],
  ['gy-', 'gy'],
  ['yys-', 'yys'],
];

export interface Lookup {
  topicOf: Map<string, number>;
  knownRefs: Set<string>;
  order: Record<ReaderMode, string[]>;
}

export function buildLookup(index: MevzuatIndex): Lookup {
  const topicOf = new Map<string, number>();
  for (const topic of index.topics) for (const article of topic.articles) topicOf.set(article.id, topic.id);
  const core = [...topicOf.keys()];
  for (const group of index.groups)
    for (const folder of group.folders) for (const topic of folder.topics) for (const article of topic.articles) topicOf.set(article.id, topic.id);
  const gk = index.gk.map((entry) => entry.id);
  const gy = index.gy.map((entry) => entry.id);
  const yys = (index.yys ?? []).map((entry) => entry.id);
  return {
    topicOf,
    knownRefs: new Set([...gk, ...gy, ...yys]),
    order: { konu: core, gk, gy, yys, soru: [], sinav: [], kaynak: [] },
  };
}

/** Adresle açılan maddenin sekmesi: Konular'da kalınır, değilse maddenin mevzuatının sekmesi açılır. */
export function modeForArticle(id: string, current: ReaderMode, topicId: number | undefined): ReaderMode {
  if ((topicId ?? 0) >= FOLDER_TOPIC_BASE) return 'kaynak';
  if (current === 'konu') return 'konu';
  return LAW_PREFIXES.find(([prefix]) => id.startsWith(prefix))?.[1] ?? 'konu';
}

/** Aramanın tarayacağı konular ve önbellek anahtarı: YYS sekmesinde yalnızca YYS maddelerinin konusu taranır. */
export function searchScope(index: MevzuatIndex, mode: ReaderMode, folder: Folder | undefined): { topics: number[]; key: string } {
  if (mode === 'kaynak') return { topics: folder?.topics.map((t) => t.id) ?? [], key: `folder-${folder?.id}` };
  if (mode === 'yys') return { topics: [...new Set((index.yys ?? []).map((entry) => entry.topic))], key: 'yys' };
  return { topics: index.topics.map((t) => t.id), key: 'core' };
}
