import { MEDIA_SOURCE_LABELS } from '@gtip/shared';
import type { MediaSource, YouTubeSyncResult } from '@gtip/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert } from '../components/alert';
import { EmptyState } from '../components/empty-state';
import { Pagination } from '../components/pagination';
import { Spinner } from '../components/spinner';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { useMedia } from '../hooks/use-media';
import { useSiteConfig } from '../hooks/use-site-config';
import { ApiRequestError } from '../services/api-client';
import {
  addInstagramItem,
  deleteMediaItem,
  syncYouTube,
  updateMediaItem,
} from '../services/media-service';
import { formatDate } from '../utils/format';

const instagramFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Gönderi adresi gerekli.')
    .refine(
      (value) => /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\//.test(value),
      'Bir gönderi/reel adresi girin (örn. https://www.instagram.com/p/XXXX/).',
    ),
  title: z.string().trim().min(3, 'Başlık en az 3 karakter olmalı.').max(200),
  description: z.string().trim().max(2000).default(''),
});

type InstagramFormValues = z.infer<typeof instagramFormSchema>;

function describeError(cause: unknown, fallback: string): string {
  return cause instanceof ApiRequestError ? cause.message : fallback;
}

export function AdminSocialPage(): JSX.Element {
  const site = useSiteConfig();
  const [searchDraft, setSearchDraft] = useState('');
  const [sourceFilter, setSourceFilter] = useState<MediaSource | ''>('');
  const search = useDebouncedValue(searchDraft, 300);

  const { data, isLoading, error, setPage, reload } = useMedia({
    pageSize: 20,
    search,
    ...(sourceFilter ? { source: sourceFilter } : {}),
  });

  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<YouTubeSyncResult | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InstagramFormValues>({
    resolver: zodResolver(instagramFormSchema),
    defaultValues: { url: '', title: '', description: '' },
  });

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

  const onSync = async (): Promise<void> => {
    setIsSyncing(true);
    setActionError(null);
    setSyncResult(null);

    try {
      setSyncResult(await syncYouTube());
      reload();
    } catch (cause) {
      setActionError(describeError(cause, 'YouTube senkronizasyonu başarısız.'));
    } finally {
      setIsSyncing(false);
    }
  };

  const onAddPost = handleSubmit(async (values) => {
    setActionError(null);

    try {
      await addInstagramItem(values);
      reset();
      reload();
    } catch (cause) {
      setActionError(describeError(cause, 'Gönderi eklenemedi.'));
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Sosyal İçerik</h1>
        <p className="mt-1 text-sm text-slate-600">
          YouTube videoları kanal akışından otomatik gelir; Instagram
          gönderilerini adresini yapıştırarak eklersiniz.
        </p>
      </div>

      {actionError ? <Alert tone="error">{actionError}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {syncResult ? (
        <Alert tone="success">
          {syncResult.channelTitle}: {syncResult.fetched} video okundu,{' '}
          {syncResult.created} yeni, {syncResult.updated} güncellendi.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-base font-semibold text-slate-900">YouTube</h2>
          {site.youtubeConnected ? (
            <>
              <p className="text-sm text-slate-600">
                Kanal akışı düzenli olarak kendiliğinden okunur. Yeni bir videoyu
                hemen yayına almak için elle tetikleyebilirsiniz.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isSyncing}
                  onClick={onSync}
                >
                  {isSyncing ? 'Senkronize ediliyor…' : 'Şimdi senkronize et'}
                </button>
                {site.youtubeChannelUrl ? (
                  <a
                    href={site.youtubeChannelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    Kanalı aç
                  </a>
                ) : null}
              </div>
            </>
          ) : (
            <Alert tone="info">
              Kanal bağlı değil. <code>.env</code> dosyasında{' '}
              <code>YOUTUBE_CHANNEL</code> değerini kanal kimliğiniz,
              @kullanıcı adınız veya kanal adresinizle doldurun.
            </Alert>
          )}
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-base font-semibold text-slate-900">
            Instagram gönderisi ekle
          </h2>
          <form className="flex flex-col gap-3" onSubmit={onAddPost} noValidate>
            <div>
              <label className="label" htmlFor="ig-url">
                Gönderi adresi
              </label>
              <input
                id="ig-url"
                type="url"
                className="field"
                placeholder="https://www.instagram.com/p/XXXXXXXXXXX/"
                {...register('url')}
              />
              {errors.url ? (
                <p className="mt-1 text-xs text-red-600">{errors.url.message}</p>
              ) : null}
            </div>

            <div>
              <label className="label" htmlFor="ig-title">
                Başlık
              </label>
              <input
                id="ig-title"
                type="text"
                className="field"
                {...register('title')}
              />
              {errors.title ? (
                <p className="mt-1 text-xs text-red-600">
                  {errors.title.message}
                </p>
              ) : null}
            </div>

            <div>
              <label className="label" htmlFor="ig-description">
                Açıklama
              </label>
              <textarea
                id="ig-description"
                rows={3}
                className="field"
                {...register('description')}
              />
            </div>

            <button
              type="submit"
              className="btn-primary self-start"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Ekleniyor…' : 'Gönderiyi ekle'}
            </button>
          </form>
        </section>
      </div>

      <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="media-search">
            Ara
          </label>
          <input
            id="media-search"
            type="search"
            className="field"
            placeholder="Başlık veya açıklama"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <label className="label" htmlFor="media-source">
            Kaynak
          </label>
          <select
            id="media-source"
            className="field"
            value={sourceFilter}
            onChange={(event) =>
              setSourceFilter(event.target.value as MediaSource | '')
            }
          >
            <option value="">Tümü</option>
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
      </div>

      {isLoading ? <Spinner /> : null}

      {!isLoading && data && data.items.length === 0 ? (
        <EmptyState
          title="Henüz içerik yok"
          description="YouTube senkronizasyonunu çalıştırın veya bir Instagram gönderisi ekleyin."
        />
      ) : null}

      {!isLoading && data && data.items.length > 0 ? (
        <>
          <div className="card overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Başlık</th>
                  <th className="px-4 py-3 font-medium">Kaynak</th>
                  <th className="px-4 py-3 font-medium">Yayın tarihi</th>
                  <th className="px-4 py-3 text-right font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((item) => {
                  const isBusy = busyId === item.id;

                  return (
                    <tr key={item.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {item.title}
                        </p>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-xs text-brand-700 hover:underline"
                        >
                          {item.url}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            item.source === 'youtube'
                              ? 'whitespace-nowrap rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700'
                              : 'whitespace-nowrap rounded-full bg-pink-50 px-2 py-1 text-xs font-medium text-pink-700'
                          }
                        >
                          {MEDIA_SOURCE_LABELS[item.source]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDate(item.publishedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 whitespace-nowrap">
                          <button
                            type="button"
                            className="btn-secondary whitespace-nowrap"
                            disabled={isBusy}
                            onClick={() =>
                              runAction(item.id, () =>
                                updateMediaItem(item.id, {
                                  isPinned: !item.isPinned,
                                }),
                              )
                            }
                          >
                            {item.isPinned ? 'Sabitlemeyi kaldır' : 'Öne çıkar'}
                          </button>
                          <button
                            type="button"
                            className="btn-danger whitespace-nowrap"
                            disabled={isBusy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `“${item.title}” listeden kaldırılsın mı?`,
                                )
                              ) {
                                void runAction(item.id, () =>
                                  deleteMediaItem(item.id),
                                );
                              }
                            }}
                          >
                            Kaldır
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
