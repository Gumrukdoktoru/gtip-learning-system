import { useEffect, useState } from 'react';
import { loadTopics, loadArticleQuestions, loadIndex, loadExamGroups, loadTopic, loadTopicQuestions } from '../services/mevzuat-data';
import type { ArticleBlock, ExamGroup, MevzuatIndex, Question, ReaderMode, Topic } from '../types/mevzuat';
import { trLower } from '../utils/text';

export interface Loadable<T> {
  data: T | null;
  error: string | null;
}

function useLoad<T>(load: (() => Promise<T>) | null, key: string): Loadable<T> {
  const [state, setState] = useState<Loadable<T> & { key: string }>({ data: null, error: null, key });
  useEffect(() => {
    if (!load) return;
    let active = true;
    load().then(
      (data) => active && setState({ data, error: null, key }),
      (error: unknown) =>
        active && setState({ data: null, error: error instanceof Error ? error.message : 'Yükleme hatası', key }),
    );
    return () => {
      active = false;
    };
    // `load` her çizimde yeniden oluşur; yeniden yüklemeyi `key` belirler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : { data: null, error: null };
}

export function useIndex(retry: number): Loadable<MevzuatIndex> {
  return useLoad(loadIndex, `index-${retry}`);
}

export function useTopic(topicId: number | null, retry: number): Loadable<Topic> {
  return useLoad(topicId === null ? null : () => loadTopic(topicId), `topic-${topicId}-${retry}`);
}

export interface SearchHit {
  topic: Topic;
  article: ArticleBlock;
}

const MODE_SOURCE: Record<ReaderMode, string | null> = { konu: null, gk: 'GK', gy: 'GY', soru: null, sinav: null, kaynak: null };
const searchText = new WeakMap<ArticleBlock, string>();

function articleText(article: ArticleBlock): string {
  let text = searchText.get(article);
  if (text === undefined) {
    text = trLower([article.label, article.title, ...article.p].join('\n'));
    searchText.set(article, text);
  }
  return text;
}

export function findHits(topics: Topic[], term: string, mode: ReaderMode): SearchHit[] {
  const needle = trLower(term.trim());
  const source = MODE_SOURCE[mode];
  const hits: SearchHit[] = [];
  for (const topic of topics) {
    for (const block of topic.blocks) {
      if (mode === 'kaynak' && block.t === 'p' && trLower(block.x).includes(needle)) {
        // Ek kaynaklarda madde olmayan düz metin de aranır; sonuç konuya bağlanır.
        hits.push({
          topic,
          article: { t: 'a', id: `konu-${topic.id}`, src: '', no: '', label: 'Metin', title: '', doc: '', p: [block.x] },
        });
        continue;
      }
      if (block.t === 'q') {
        const text = [...block.kok, ...block.siklar].join('\n');
        if (mode === 'kaynak' && trLower(text).includes(needle))
          hits.push({ topic, article: { t: 'a', id: `konu-${topic.id}`, src: '', no: '', label: block.no, title: '', doc: '', p: [...block.kok, ...block.siklar] } });
        continue;
      }
      if (mode === 'kaynak' && block.t === 't') {
        for (const row of block.rows) {
          const text = row.join(' · ');
          if (trLower(text).includes(needle))
            hits.push({ topic, article: { t: 'a', id: `konu-${topic.id}`, src: '', no: '', label: 'Tablo satırı', title: '', doc: '', p: [text] } });
        }
        continue;
      }
      if (block.t !== 'a' || (source && block.src !== source)) continue;
      if (articleText(block).includes(needle)) hits.push({ topic, article: block });
    }
  }
  return hits;
}

/** Arama yapıldığında verilen konuları (bir kez) indirir ve eşleşen maddeleri döndürür. */
export function useSearch(topicIds: number[] | null, scope: string, term: string, mode: ReaderMode): Loadable<SearchHit[]> {
  const active = topicIds !== null && term.trim().length >= 2;
  const all = useLoad(active && topicIds ? () => loadTopics(topicIds) : null, active ? `search-${scope}` : 'idle');
  if (!active || !all.data) return { data: null, error: all.error };
  return { data: findHits(all.data, term, mode), error: null };
}

const NO_QUESTIONS: Question[] = [];

/** Bir maddeye bağlı çıkmış sınav soruları (dosya bir kez indirilir). */
export function useArticleQuestions(articleId: string): Question[] {
  const all = useLoad(loadArticleQuestions, 'article-questions');
  return all.data?.[articleId] ?? NO_QUESTIONS;
}

/** Bir konu sayfasının (Tarife, Sair Mevzuat vb.) çıkmış soruları; dosya ilk gereken konuda bir kez indirilir. */
export function useTopicQuestions(topicId: number | null): Question[] {
  const all = useLoad(topicId === null ? null : loadTopicQuestions, topicId === null ? 'idle' : 'topic-questions');
  if (topicId === null || !all.data) return NO_QUESTIONS;
  const entry = all.data[String(topicId)];
  const list = typeof entry === 'string' ? all.data[entry] : entry;
  return Array.isArray(list) ? list : NO_QUESTIONS;
}

/** kind null ise hiçbir şey yüklenmez. */
export function useExamGroups(kind: 'diger' | 'sinav' | null): Loadable<ExamGroup[]> {
  return useLoad(kind ? () => loadExamGroups(kind) : null, kind ? `exam-groups-${kind}` : 'idle');
}
