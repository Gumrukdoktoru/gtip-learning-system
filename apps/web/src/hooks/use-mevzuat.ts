import { useEffect, useState } from 'react';
import { loadAllTopics, loadArticleQuestions, loadIndex, loadOtherQuestions, loadTopic } from '../services/mevzuat-data';
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

const MODE_SOURCE: Record<ReaderMode, string | null> = { konu: null, gk: 'GK', gy: 'GY', soru: null };
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
      if (block.t !== 'a' || (source && block.src !== source)) continue;
      if (articleText(block).includes(needle)) hits.push({ topic, article: block });
    }
  }
  return hits;
}

/** Arama yapıldığında bütün konuları (bir kez) indirir ve eşleşen maddeleri döndürür. */
export function useSearch(index: MevzuatIndex | null, term: string, mode: ReaderMode): Loadable<SearchHit[]> {
  const active = index !== null && term.trim().length >= 2;
  const all = useLoad(active && index ? () => loadAllTopics(index) : null, active ? 'all-topics' : 'idle');
  if (!active || !all.data) return { data: null, error: all.error };
  return { data: findHits(all.data, term, mode), error: null };
}

const NO_QUESTIONS: Question[] = [];

/** Bir maddeye bağlı çıkmış sınav soruları (dosya bir kez indirilir). */
export function useArticleQuestions(articleId: string): Question[] {
  const all = useLoad(loadArticleQuestions, 'article-questions');
  return all.data?.[articleId] ?? NO_QUESTIONS;
}

export function useOtherQuestions(enabled: boolean): Loadable<ExamGroup[]> {
  return useLoad(enabled ? loadOtherQuestions : null, enabled ? 'other-questions' : 'idle');
}
