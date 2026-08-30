import { buildInstagramEmbedUrl, buildYouTubeEmbedUrl } from '@gtip/shared';
import type { MediaItem } from '@gtip/shared';
import { useState } from 'react';

import { Alert } from '../components/alert';
import { EmptyState } from '../components/empty-state';
import { HubHero } from '../components/hub-hero';
import { HubTabs, type HubTab } from '../components/hub-tabs';
import { MediaCard } from '../components/media-card';
import { Modal } from '../components/modal';
import { Pagination } from '../components/pagination';
import { QuizPanel } from '../components/quiz/quiz-panel';
import { ResourceCard } from '../components/resource-card';
import { SectionHeader } from '../components/section-header';
import { Spinner } from '../components/spinner';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { useMedia } from '../hooks/use-media';
import { useResourceDownload } from '../hooks/use-resource-download';
import { useResources } from '../hooks/use-resources';
import { useSiteConfig } from '../hooks/use-site-config';

/** The overview shows only the newest few of each shelf; a tab shows them all. */
const OVERVIEW_PAGE_SIZE = 3;
const TAB_PAGE_SIZE = 12;

/**
 * The page students land on.
 *
 * One search box drives three independent lists — YouTube videos synced from
 * the channel feed, Instagram posts curated by the coach, and uploaded
 * PDF/HTML documents — so a student can look for a topic without caring which
 * platform it came from.
 */
export function LearningHubPage(): JSX.Element {
  const site = useSiteConfig();
  const [tab, setTab] = useState<HubTab>('all');
  const [searchDraft, setSearchDraft] = useState('');
  const search = useDebouncedValue(searchDraft, 300);
  const [openItem, setOpenItem] = useState<MediaItem | null>(null);

  const isOverview = tab === 'all';
  const isQuiz = tab === 'quiz';
  const showVideos = isOverview || tab === 'video';
  const showInstagram = isOverview || tab === 'instagram';
  const showDocuments = isOverview || tab === 'document';
  const pageSize = isOverview ? OVERVIEW_PAGE_SIZE : TAB_PAGE_SIZE;

  const videos = useMedia({
    source: 'youtube',
    search,
    enabled: showVideos && !isQuiz,
    pageSize,
  });
  const posts = useMedia({
    source: 'instagram',
    search,
    enabled: showInstagram && !isQuiz,
    pageSize: isOverview ? OVERVIEW_PAGE_SIZE : 9,
  });
  const documents = useResources({
    search,
    enabled: showDocuments && !isQuiz,
    pageSize,
  });
  const { download, downloadingId, error: downloadError } =
    useResourceDownload();

  const isLoading =
    !isQuiz &&
    ((showVideos && videos.isLoading) ||
    (showInstagram && posts.isLoading) ||
    (showDocuments && documents.isLoading));

  const totalShown =
    (videos.data?.items.length ?? 0) +
    (posts.data?.items.length ?? 0) +
    (documents.data?.items.length ?? 0);

  const errors = [videos.error, posts.error, documents.error, downloadError]
    .filter((message): message is string => Boolean(message))
    // The same outage can surface from several lists at once.
    .filter((message, index, all) => all.indexOf(message) === index);

  return (
    <div className="flex flex-col gap-8">
      <HubHero site={site} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <HubTabs value={tab} onChange={setTab} />

        {isQuiz ? null : (
          <div className="sm:w-80">
            <label className="sr-only" htmlFor="hub-search">
              Ara
            </label>
            <input
              id="hub-search"
              type="search"
              className="field"
              placeholder="Konu, video veya belge ara"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </div>
        )}
      </div>

      {isQuiz ? <QuizPanel /> : null}

      {errors.map((message) => (
        <Alert key={message} tone="error">
          {message}
        </Alert>
      ))}

      {isLoading ? <Spinner /> : null}

      {isOverview && !isLoading ? (
        <section className="card flex flex-col items-start gap-3 border-brand-200 bg-brand-50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Deneme Sınavı
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Çoktan seçmeli sorularla kendinizi deneyin. Giriş gerekmez,
              sonucunuz kaydedilmez.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setTab('quiz')}
          >
            Teste başla
          </button>
        </section>
      ) : null}

      {!isQuiz && !isLoading && totalShown === 0 ? (
        <EmptyState
          title={search ? 'Aramanıza uygun içerik yok' : 'Henüz içerik yok'}
          description={
            search
              ? 'Farklı bir kelime deneyin veya sekmeyi değiştirin.'
              : 'Yeni videolar, gönderiler ve belgeler burada listelenecek.'
          }
        />
      ) : null}

      {showVideos && !videos.isLoading && (videos.data?.items.length ?? 0) > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Videolar"
            count={videos.data?.pagination.total}
            {...(isOverview
              ? { actionLabel: 'Tümünü gör', onAction: () => setTab('video') }
              : {})}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.data?.items.map((item) => (
              <MediaCard key={item.id} item={item} onOpen={setOpenItem} />
            ))}
          </div>
          {isOverview ? null : (
            <Pagination
              pagination={videos.data!.pagination}
              onPageChange={videos.setPage}
            />
          )}
        </section>
      ) : null}

      {showInstagram &&
      !posts.isLoading &&
      (posts.data?.items.length ?? 0) > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Instagram"
            count={posts.data?.pagination.total}
            {...(isOverview
              ? {
                  actionLabel: 'Tümünü gör',
                  onAction: () => setTab('instagram'),
                }
              : {})}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.data?.items.map((item) => (
              <MediaCard key={item.id} item={item} onOpen={setOpenItem} />
            ))}
          </div>
          {isOverview ? null : (
            <Pagination
              pagination={posts.data!.pagination}
              onPageChange={posts.setPage}
            />
          )}
        </section>
      ) : null}

      {showDocuments &&
      !documents.isLoading &&
      (documents.data?.items.length ?? 0) > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Belgeler"
            count={documents.data?.pagination.total}
            {...(isOverview
              ? { actionLabel: 'Tümünü gör', onAction: () => setTab('document') }
              : {})}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {documents.data?.items.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                onDownload={download}
                isDownloading={downloadingId === resource.id}
              />
            ))}
          </div>
          {isOverview ? null : (
            <Pagination
              pagination={documents.data!.pagination}
              onPageChange={documents.setPage}
            />
          )}
        </section>
      ) : null}

      {openItem ? (
        <Modal title={openItem.title} onClose={() => setOpenItem(null)}>
          {openItem.source === 'youtube' ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <iframe
                src={buildYouTubeEmbedUrl(openItem.externalId)}
                title={openItem.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              {/* Instagram's own frame. It only loads once a reader opens the
                  post, so no third-party request leaves the page on its own. */}
              <iframe
                src={buildInstagramEmbedUrl(openItem.externalId)}
                title={openItem.title}
                loading="lazy"
                className="h-[560px] w-full border-0"
              />
            </div>
          )}

          {openItem.description ? (
            <p className="mt-4 whitespace-pre-line text-sm text-slate-600">
              {openItem.description}
            </p>
          ) : null}

          <a
            href={openItem.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline"
          >
            {openItem.source === 'youtube'
              ? 'YouTube’da aç'
              : 'Instagram’da aç'}
          </a>
        </Modal>
      ) : null}
    </div>
  );
}
