export type SourceCode = 'GK' | 'GY' | '';
export type ReaderMode = 'konu' | 'gk' | 'gy' | 'soru' | 'sinav' | 'kaynak';

export interface ArticleBlock {
  t: 'a';
  id: string;
  src: SourceCode;
  no: string;
  label: string;
  title: string;
  doc: string;
  p: string[];
}

export interface TextBlock {
  /** h: ara başlık, d: belge başlığı, p: serbest paragraf */
  t: 'h' | 'd' | 'p';
  x: string;
}

export type Block = ArticleBlock | TextBlock;

export interface Topic {
  id: number;
  title: string;
  blocks: Block[];
}

export interface TopicArticleRef {
  id: string;
  label: string;
  title: string;
}

export interface TopicSummary {
  id: number;
  title: string;
  articles: TopicArticleRef[];
}

export interface LawEntry {
  id: string;
  no: string;
  title: string;
  topic: number;
}

export interface MevzuatIndex {
  topics: TopicSummary[];
  gk: LawEntry[];
  gy: LawEntry[];
  /** Ek kaynak dosyaları; her biri ayrı klasör (konu kimlikleri 1000 ve üzeri). */
  folders: Folder[];
}

export interface Folder {
  id: number;
  title: string;
  topics: TopicSummary[];
}

export interface RefPreviewData {
  label: string;
  title: string;
  topic: number;
  p: string[];
  more: boolean;
}

export type RefMap = Record<string, RefPreviewData>;

export interface Question {
  id: string;
  /** "Soru 46 · Gümrük Müşavir Yardımcılığı Sınavı · 20 Ekim 2012" */
  sinav: string;
  kok: string[];
  siklar: string[];
  /** Doğru şıkkın harfi; iptal vb. durumlarda açıklama metni. */
  cevap: string;
  /** Sorunun bağlı olduğu maddeler (id boşsa madde derlemede ayrı açılamıyor). */
  madde?: ArticleLink[];
  /** Metin benzerliğiyle otomatik bulunan ilgili madde. */
  ilgili?: ArticleLink;
  /** Notlardaki dayanak hüküm (otomatik seçilir). */
  dayanak?: ArticleLink & { metin: string };
}

export interface ArticleLink {
  id: string;
  ad: string;
}

export type ArticleQuestions = Record<string, Question[]>;

export interface ExamGroup {
  sinav: string;
  yil?: number;
  /** Kitapçıktaki soru sayısı ve kaynaklarda bulunamayan soru numaraları. */
  toplam?: number;
  eksik?: number[];
  sorular: Question[];
}
