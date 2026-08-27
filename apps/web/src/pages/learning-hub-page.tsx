import { buildYouTubeEmbedUrl } from '@gtip/shared';
import type { MediaItem } from '@gtip/shared';
import { useState } from 'react';

import { Alert } from '../components/alert';
import { EmptyState } from '../components/empty-state';
import { HubHero } from '../components/hub-hero';
import { HubTabs, type HubTab } from '../components/hub-tabs';
import { InstagramCard } from '../components/instagram-card';
import { Modal } from '../components/modal';
import { Pagination } from '../components/pagination';
import { ResourceCard } from '../components/resource-card';
import { SectionHeader } from '../components/section-header';
import { Spinner } from '../components/spinner';
import { VideoCard } from '../components/video-card';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { useMedia } from '../hooks/use-media';
import { useResourceDownload } from '../hooks/use-resource-download';
import { useResources } from '../hooks/use-resources';
import { useSiteConfig } from '../hooks/use-site-config';

/** Overview shows a taste of each shelf; a focused tab shows the full list. */
const OVERVIEW_PAGE_SIZE = 6;
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
  const [playing, setPlaying] = useState<MediaItem | null>(null);

  const isOverview = tab === 'all';
  const showVideos = isOverview || tab === 'video';
  const showInstagram = isOverview || tab === 'instagram';
  const showDocuments = isOverview || tab === 'document';
  const pageSize = isOverview ? OVERVIEW_PAGE_SIZE : TAB_PAGE_SIZE;

  const videos = useMedia({
    source: 'youtube',
    search,
    enabled: showVideos,
    pageSize,
  });
  const posts = useMedia({
    source: 'instagram',
    search,
    enabled: showInstagram,
    pageSize: isOverview ? 3 : 9,
  });
  const documents = useResources({ search, enabled: showDocuments, pageSize });
  const { download, downloadingId, error: downloadError } =
    useResourceDownload();

  const isLoading =
    (showVideos && videos.isLoading) ||
    (showInstagram && posts.isLoading) ||
    (showDocuments && documents.isLoading);

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
      </div>

      {errors.map((message) => (
        <Alert key={message} tone="error">
          {message}
        </Alert>
      ))}

      {isLoading ? <Spinner /> : null}

      {!isLoading && totalShown === 0 ? (
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
              <VideoCard key={item.id} item={item} onPlay={setPlaying} />
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
              <InstagramCard key={item.id} item={item} allowEmbed={!isOverview} />
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

      {playing ? (
        <Modal title={playing.title} onClose={() => setPlaying(null)}>
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              src={buildYouTubeEmbedUrl(playing.externalId)}
              title={playing.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
          {playing.description ? (
            <p className="mt-4 whitespace-pre-line text-sm text-slate-600">
              {playing.description}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
