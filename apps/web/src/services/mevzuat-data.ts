import type { ArticleQuestions, ExamGroup, MevzuatIndex, RefMap, Topic, TopicQuestions } from '../types/mevzuat';

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;
const cache = new Map<string, Promise<unknown>>();

function loadJson<T>(file: string): Promise<T> {
  let pending = cache.get(file) as Promise<T> | undefined;
  if (!pending) {
    pending = fetch(DATA_BASE + file).then((response) => {
      if (!response.ok) throw new Error(`${file} yüklenemedi (${response.status})`);
      return response.json() as Promise<T>;
    });
    // Başarısız istek önbellekte kalmasın ki "yeniden dene" çalışsın.
    pending.catch(() => cache.delete(file));
    cache.set(file, pending);
  }
  return pending;
}

const bundleOf = new Map<number, string>();

export function loadIndex(): Promise<MevzuatIndex> {
  return loadJson<MevzuatIndex>('index.json').then((index) => {
    for (const group of index.groups)
      for (const folder of group.folders) for (const topic of folder.topics) if (topic.file) bundleOf.set(topic.id, topic.file);
    return index;
  });
}

export function loadTopic(topicId: number): Promise<Topic> {
  const bundle = bundleOf.get(topicId);
  if (!bundle) return loadJson<Topic>(`konu-${topicId}.json`);
  return loadJson<Topic[]>(bundle).then((topics) => {
    const topic = topics.find((item) => item.id === topicId);
    if (!topic) throw new Error('Konu pakette bulunamadı');
    return topic;
  });
}

export function loadTopics(topicIds: number[]): Promise<Topic[]> {
  return Promise.all(topicIds.map(loadTopic));
}

export function loadRefs(): Promise<RefMap> {
  return loadJson<RefMap>('refs.json');
}

export function loadArticleQuestions(): Promise<ArticleQuestions> {
  return loadJson<ArticleQuestions>('sorular-madde.json');
}

export function loadTopicQuestions(): Promise<TopicQuestions> {
  return loadJson<TopicQuestions>('sorular-konu.json');
}

export function loadExamGroups(kind: 'diger' | 'sinav'): Promise<ExamGroup[]> {
  return loadJson<ExamGroup[]>(`sorular-${kind}.json`);
}
