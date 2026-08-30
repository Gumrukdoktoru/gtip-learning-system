import {
  QUIZ_DIFFICULTIES,
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_OPTION_LETTERS,
} from '@gtip/shared';
import type { QuizDifficulty, QuizImportPreview } from '@gtip/shared';
import { useState } from 'react';

import { Alert } from '../alert';
import { ApiRequestError } from '../../services/api-client';
import {
  previewQuizImport,
  runQuizImport,
} from '../../services/quiz-service';

const FORMAT_EXAMPLE = `## Tarife

1. GTİP kodunun ilk altı hanesi neyi ifade eder?
A) Ulusal alt açılım
B) Armonize Sistem (HS) kodu
C) Kombine Nomanklatür
Cevap: B
Açıklama: İlk 6 hane uluslararası HS kodudur.
Zorluk: kolay`;

export interface QuizImportProps {
  onImported: () => void;
}

function describeError(cause: unknown, fallback: string): string {
  return cause instanceof ApiRequestError ? cause.message : fallback;
}

/**
 * Bulk import from a Markdown or Word file.
 *
 * Nothing is written until the admin has seen the preview: the same parse is
 * shown first, question by question, with the reason any of them cannot be
 * imported.
 */
export function QuizImport({ onImported }: QuizImportProps): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState('');
  const [defaultTopic, setDefaultTopic] = useState('');
  const [defaultDifficulty, setDefaultDifficulty] =
    useState<QuizDifficulty>('orta');
  const [isPublished, setIsPublished] = useState(false);

  const [preview, setPreview] = useState<QuizImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showFormat, setShowFormat] = useState(false);

  const options = {
    ...(defaultTopic.trim() ? { defaultTopic: defaultTopic.trim() } : {}),
    defaultDifficulty,
    isPublished,
  };

  async function onPreview(): Promise<void> {
    setIsBusy(true);
    setError(null);
    setNotice(null);

    try {
      setPreview(await previewQuizImport(options, file, source));
    } catch (cause) {
      setPreview(null);
      setError(describeError(cause, 'Dosya okunamadı.'));
    } finally {
      setIsBusy(false);
    }
  }

  async function onImport(): Promise<void> {
    setIsBusy(true);
    setError(null);

    try {
      const result = await runQuizImport(options, file, source);

      setNotice(
        `${result.created} soru içeri aktarıldı` +
          (result.skipped > 0 ? `, ${result.skipped} soru atlandı.` : '.'),
      );
      setPreview(null);
      setFile(null);
      setSource('');
      onImported();
    } catch (cause) {
      setError(describeError(cause, 'İçe aktarma başarısız.'));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="card flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          Dosyadan içe aktar
        </h2>
        <button
          type="button"
          className="text-sm font-medium text-brand-700 hover:underline"
          onClick={() => setShowFormat((open) => !open)}
        >
          {showFormat ? 'Biçimi gizle' : 'Beklenen biçim'}
        </button>
      </div>

      <p className="text-sm text-slate-600">
        Markdown (.md), düz metin (.txt) veya Word (.docx) dosyasını yükleyin.
        Önce ne anlaşıldığını görürsünüz; aktarma ondan sonra yapılır.
      </p>

      {showFormat ? (
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
          {FORMAT_EXAMPLE}
        </pre>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="import-file">
            Dosya
          </label>
          <input
            id="import-file"
            type="file"
            accept=".md,.txt,.markdown,.docx"
            className="field"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
            }}
          />
        </div>

        <div>
          <label className="label" htmlFor="import-topic">
            Varsayılan konu
          </label>
          <input
            id="import-topic"
            type="text"
            className="field"
            placeholder="Dosyada Konu: yoksa kullanılır"
            value={defaultTopic}
            onChange={(event) => setDefaultTopic(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="import-difficulty">
            Varsayılan zorluk
          </label>
          <select
            id="import-difficulty"
            className="field"
            value={defaultDifficulty}
            onChange={(event) =>
              setDefaultDifficulty(event.target.value as QuizDifficulty)
            }
          >
            {QUIZ_DIFFICULTIES.map((level) => (
              <option key={level} value={level}>
                {QUIZ_DIFFICULTY_LABELS[level]}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(event) => setIsPublished(event.target.checked)}
          />
          Doğrudan yayına al (varsayılan: taslak)
        </label>
      </div>

      {file ? null : (
        <div>
          <label className="label" htmlFor="import-source">
            veya soruları buraya yapıştırın
          </label>
          <textarea
            id="import-source"
            rows={6}
            className="field font-mono text-xs"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setPreview(null);
            }}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-secondary"
          disabled={isBusy || (!file && source.trim().length === 0)}
          onClick={() => void onPreview()}
        >
          {isBusy ? 'Okunuyor…' : 'Önizle'}
        </button>
        {preview && preview.importable > 0 ? (
          <button
            type="button"
            className="btn-primary"
            disabled={isBusy}
            onClick={() => void onImport()}
          >
            {preview.importable} soruyu aktar
          </button>
        ) : null}
      </div>

      {preview ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-700">
            {preview.items.length} soru okundu · {preview.importable}{' '}
            aktarılabilir · {preview.skipped} sorunlu
          </p>

          <ol className="flex flex-col gap-3">
            {preview.items.map((item) => (
              <li
                key={`${item.lineNumber}-${item.question}`}
                className={[
                  'rounded-lg border p-4',
                  item.canImport
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-rose-200 bg-rose-50/40',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500">
                    {item.lineNumber}. satır
                  </span>
                  {item.topic ? (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
                      {item.topic}
                    </span>
                  ) : null}
                  {item.difficulty ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                      {QUIZ_DIFFICULTY_LABELS[item.difficulty]}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-sm font-medium text-slate-900">
                  {item.question || '(soru metni okunamadı)'}
                </p>

                <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-600">
                  {item.options.map((option, optionIndex) => (
                    <li
                      key={option}
                      className={
                        optionIndex === item.correctOptionIndex
                          ? 'font-medium text-emerald-800'
                          : undefined
                      }
                    >
                      {QUIZ_OPTION_LETTERS[optionIndex]}) {option}
                      {optionIndex === item.correctOptionIndex
                        ? ' — doğru cevap'
                        : ''}
                    </li>
                  ))}
                </ul>

                {item.errors.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc text-xs text-rose-700">
                    {item.errors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
