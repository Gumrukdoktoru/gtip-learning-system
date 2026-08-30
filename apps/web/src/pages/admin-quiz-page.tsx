import {
  MAX_QUIZ_OPTIONS,
  MIN_QUIZ_OPTIONS,
  QUIZ_DIFFICULTIES,
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_OPTION_LETTERS,
} from '@gtip/shared';
import type { QuizDifficulty, QuizQuestion } from '@gtip/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert } from '../components/alert';
import { EmptyState } from '../components/empty-state';
import { Pagination } from '../components/pagination';
import { Spinner } from '../components/spinner';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { ApiRequestError } from '../services/api-client';
import {
  createQuizQuestion,
  deleteQuizQuestion,
  fetchQuizQuestions,
  updateQuizQuestion,
} from '../services/quiz-service';

interface FormState {
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  topic: string;
  difficulty: QuizDifficulty;
  isPublished: boolean;
}

const EMPTY_FORM: FormState = {
  question: '',
  options: ['', '', '', ''],
  correctOptionIndex: 0,
  explanation: '',
  topic: '',
  difficulty: 'orta',
  isPublished: true,
};

function describeError(cause: unknown, fallback: string): string {
  return cause instanceof ApiRequestError ? cause.message : fallback;
}

/** Client-side mirror of the API's rules, so mistakes surface before saving. */
function validate(form: FormState): string | null {
  if (form.question.trim().length < 10) {
    return 'Soru metni en az 10 karakter olmalı.';
  }

  if (form.topic.trim().length < 2) {
    return 'Konu adı girin.';
  }

  const filled = form.options.filter((option) => option.trim().length > 0);

  if (filled.length < MIN_QUIZ_OPTIONS) {
    return `En az ${MIN_QUIZ_OPTIONS} şık doldurun.`;
  }

  if (form.options.some((option) => option.trim().length === 0)) {
    return 'Boş şık bırakmayın; kullanmayacağınız şıkkı kaldırın.';
  }

  if (form.correctOptionIndex >= form.options.length) {
    return 'Doğru cevabı işaretleyin.';
  }

  return null;
}

export function AdminQuizPage(): JSX.Element {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [searchDraft, setSearchDraft] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const search = useDebouncedValue(searchDraft, 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchQuizQuestions>
  > | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(search ? { search } : {}),
      ...(topicFilter ? { topic: topicFilter } : {}),
    }),
    [page, search, topicFilter],
  );

  useEffect(() => setPage(1), [search, topicFilter]);

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);
    fetchQuizQuestions(query, controller.signal)
      .then((result) => {
        setData(result);
        setIsLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setActionError(describeError(cause, 'Sorular yüklenemedi.'));
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [query, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const topics = useMemo(() => {
    const seen = new Set<string>();

    for (const item of data?.items ?? []) {
      seen.add(item.topic);
    }

    return [...seen].sort((left, right) => left.localeCompare(right, 'tr'));
  }, [data]);

  function resetForm(): void {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
  }

  function startEditing(question: QuizQuestion): void {
    setForm({
      question: question.question,
      options: [...question.options],
      correctOptionIndex: question.correctOptionIndex,
      explanation: question.explanation,
      topic: question.topic,
      difficulty: question.difficulty,
      isPublished: question.isPublished,
    });
    setEditingId(question.id);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSave(): Promise<void> {
    const problem = validate(form);

    setFormError(problem);
    setActionError(null);
    setNotice(null);

    if (problem) {
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        question: form.question.trim(),
        options: form.options.map((option) => option.trim()),
        correctOptionIndex: form.correctOptionIndex,
        explanation: form.explanation.trim(),
        topic: form.topic.trim(),
        difficulty: form.difficulty,
        isPublished: form.isPublished,
      };

      if (editingId) {
        await updateQuizQuestion(editingId, payload);
        setNotice('Soru güncellendi.');
      } else {
        await createQuizQuestion(payload);
        setNotice('Soru eklendi.');
      }

      resetForm();
      reload();
    } catch (cause) {
      setFormError(describeError(cause, 'Soru kaydedilemedi.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function runAction(
    id: string,
    action: () => Promise<unknown>,
  ): Promise<void> {
    setBusyId(id);
    setActionError(null);

    try {
      await action();
      reload();
    } catch (cause) {
      setActionError(describeError(cause, 'İşlem tamamlanamadı.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Test Soruları</h1>
        <p className="mt-1 text-sm text-slate-600">
          Öğrenciler bu sorulardan rastgele çekilen deneme sınavlarını çözer.
          Yalnızca “Yayında” olan sorular sınavlara girer.
        </p>
      </div>

      {actionError ? <Alert tone="error">{actionError}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-base font-semibold text-slate-900">
          {editingId ? 'Soruyu düzenle' : 'Yeni soru'}
        </h2>

        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <div>
          <label className="label" htmlFor="q-text">
            Soru metni
          </label>
          <textarea
            id="q-text"
            rows={3}
            className="field"
            value={form.question}
            onChange={(event) =>
              setForm({ ...form, question: event.target.value })
            }
          />
        </div>

        <fieldset>
          <legend className="label">Şıklar ve doğru cevap</legend>
          <div className="flex flex-col gap-2">
            {form.options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={form.correctOptionIndex === index}
                    onChange={() =>
                      setForm({ ...form, correctOptionIndex: index })
                    }
                    aria-label={`${QUIZ_OPTION_LETTERS[index]} şıkkı doğru cevap`}
                  />
                  {QUIZ_OPTION_LETTERS[index]}
                </label>
                <input
                  type="text"
                  className="field"
                  aria-label={`${QUIZ_OPTION_LETTERS[index]} şıkkı`}
                  value={option}
                  onChange={(event) => {
                    const options = [...form.options];

                    options[index] = event.target.value;
                    setForm({ ...form, options });
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary whitespace-nowrap"
                  disabled={form.options.length <= MIN_QUIZ_OPTIONS}
                  onClick={() => {
                    const options = form.options.filter(
                      (_, itemIndex) => itemIndex !== index,
                    );

                    setForm({
                      ...form,
                      options,
                      // Keep the answer pointing at the same option.
                      correctOptionIndex:
                        form.correctOptionIndex > index
                          ? form.correctOptionIndex - 1
                          : Math.min(
                              form.correctOptionIndex,
                              options.length - 1,
                            ),
                    });
                  }}
                >
                  Kaldır
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary mt-2"
            disabled={form.options.length >= MAX_QUIZ_OPTIONS}
            onClick={() => setForm({ ...form, options: [...form.options, ''] })}
          >
            Şık ekle
          </button>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="q-topic">
              Konu
            </label>
            <input
              id="q-topic"
              type="text"
              list="quiz-topics"
              className="field"
              placeholder="Gümrük Kanunu"
              value={form.topic}
              onChange={(event) =>
                setForm({ ...form, topic: event.target.value })
              }
            />
            <datalist id="quiz-topics">
              {topics.map((topic) => (
                <option key={topic} value={topic} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="label" htmlFor="q-difficulty">
              Zorluk
            </label>
            <select
              id="q-difficulty"
              className="field"
              value={form.difficulty}
              onChange={(event) =>
                setForm({
                  ...form,
                  difficulty: event.target.value as QuizDifficulty,
                })
              }
            >
              {QUIZ_DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {QUIZ_DIFFICULTY_LABELS[level]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="q-explanation">
            Açıklama (sonuç ekranında gösterilir)
          </label>
          <textarea
            id="q-explanation"
            rows={2}
            className="field"
            value={form.explanation}
            onChange={(event) =>
              setForm({ ...form, explanation: event.target.value })
            }
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(event) =>
              setForm({ ...form, isPublished: event.target.checked })
            }
          />
          Yayında (sınavlara dahil edilsin)
        </label>

        <div className="flex gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={isSaving}
            onClick={() => void onSave()}
          >
            {isSaving ? 'Kaydediliyor…' : editingId ? 'Değişikliği kaydet' : 'Soruyu ekle'}
          </button>
          {editingId ? (
            <button type="button" className="btn-secondary" onClick={resetForm}>
              Vazgeç
            </button>
          ) : null}
        </div>
      </section>

      <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="q-search">
            Ara
          </label>
          <input
            id="q-search"
            type="search"
            className="field"
            placeholder="Soru metni veya açıklama"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <label className="label" htmlFor="q-topic-filter">
            Konu
          </label>
          <select
            id="q-topic-filter"
            className="field"
            value={topicFilter}
            onChange={(event) => setTopicFilter(event.target.value)}
          >
            <option value="">Tümü</option>
            {topics.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? <Spinner /> : null}

      {!isLoading && data && data.items.length === 0 ? (
        <EmptyState
          title="Henüz soru yok"
          description="Yukarıdaki formdan ilk soruyu ekleyin."
        />
      ) : null}

      {!isLoading && data && data.items.length > 0 ? (
        <>
          <div className="card overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Soru</th>
                  <th className="px-4 py-3 font-medium">Konu</th>
                  <th className="px-4 py-3 font-medium">Zorluk</th>
                  <th className="px-4 py-3 font-medium">Durum</th>
                  <th className="px-4 py-3 text-right font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((item) => {
                  const isBusy = busyId === item.id;

                  return (
                    <tr key={item.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="line-clamp-2 font-medium text-slate-900">
                          {item.question}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Doğru cevap:{' '}
                          {QUIZ_OPTION_LETTERS[item.correctOptionIndex]}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.topic}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {QUIZ_DIFFICULTY_LABELS[item.difficulty]}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            item.isPublished
                              ? 'whitespace-nowrap rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700'
                              : 'whitespace-nowrap rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700'
                          }
                        >
                          {item.isPublished ? 'Yayında' : 'Taslak'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 whitespace-nowrap">
                          <button
                            type="button"
                            className="btn-secondary whitespace-nowrap"
                            onClick={() => startEditing(item)}
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            className="btn-secondary whitespace-nowrap"
                            disabled={isBusy}
                            onClick={() =>
                              runAction(item.id, () =>
                                updateQuizQuestion(item.id, {
                                  isPublished: !item.isPublished,
                                }),
                              )
                            }
                          >
                            {item.isPublished ? 'Taslağa al' : 'Yayına al'}
                          </button>
                          <button
                            type="button"
                            className="btn-danger whitespace-nowrap"
                            disabled={isBusy}
                            onClick={() => {
                              if (window.confirm('Soru silinsin mi?')) {
                                void runAction(item.id, () =>
                                  deleteQuizQuestion(item.id),
                                );
                              }
                            }}
                          >
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      ) : null}
    </div>
  );
}
