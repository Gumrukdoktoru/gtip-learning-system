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

export interface TableBlock {
  t: 't';
  rows: string[][];
}

/** Çözümlü soru: kök + şıklar, altında cevap ve (varsa) çözüm satırları. */
export interface SolvedQuestionBlock {
  t: 'q';
  /** "Soru 12", "Örnek 1", "2025 GM · Soru 32" */
  no: string;
  kok: string[];
  siklar: string[];
  /** Doğru şıkkın harfi; kaynakta yoksa boş. */
  cevap: string;
  cozum: string[];
}

export type Block = ArticleBlock | TextBlock | TableBlock | SolvedQuestionBlock;

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
  /** Konunun içinde bulunduğu paket dosyası (yalnızca diğer not dosyalarında). */
  file?: string;
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
  /** Diğer not dosyaları, konu sekmelerine göre (konu kimlikleri 1000 ve üzeri). */
  groups: SourceGroup[];
}

export interface SourceGroup {
  id: string;
  title: string;
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
  /** Notlardaki dayanak hüküm (otomatik seçilir). id: madde kimliği ya da "konu-<konu kimliği>". */
  dayanak?: ArticleLink & { metin: string };
}

export interface ArticleLink {
  id: string;
  ad: string;
}

export type ArticleQuestions = Record<string, Question[]>;

/**
 * Konu kimliği -> o konunun çıkmış soruları (sorular-konu.json). Değer metin ise soruların
 * tutulduğu eş konunun kimliğidir (aynı faslın başka klasördeki sayfası).
 */
export type TopicQuestions = Record<string, Question[] | string>;

export interface ExamGroup {
  sinav: string;
  yil?: number;
  /** Kitapçıktaki soru sayısı ve kaynaklarda bulunamayan soru numaraları. */
  toplam?: number;
  eksik?: number[];
  sorular: Question[];
}
