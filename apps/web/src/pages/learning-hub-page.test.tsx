import type {
  MediaItem,
  PaginatedData,
  PublicResource,
  SiteConfig,
} from '@gtip/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LearningHubPage } from './learning-hub-page';

const { fetchResources, fetchDownloadTicket, fetchMedia, fetchSiteConfig } =
  vi.hoisted(() => ({
    fetchResources: vi.fn(),
    fetchDownloadTicket: vi.fn(),
    fetchMedia: vi.fn(),
    fetchSiteConfig: vi.fn(),
  }));

vi.mock('../services/resource-service', () => ({
  fetchResources,
  fetchDownloadTicket,
  isAdminResource: (resource: object) => 'storageKey' in resource,
}));

vi.mock('../services/media-service', () => ({
  fetchMedia,
  fetchSiteConfig,
}));

const SITE: SiteConfig = {
  title: 'Gümrük Doktoru Akademi',
  tagline: 'Öğrenciler için derlenmiş çalışma kaynakları.',
  youtubeChannelUrl: 'https://www.youtube.com/@gumrukdoktoru',
  instagramProfileUrl: 'https://www.instagram.com/gumrukdoktoru/',
  youtubeConnected: true,
};

function page<T>(items: T[], pageSize = 6): PaginatedData<T> {
  return {
    items,
    pagination: {
      page: 1,
      pageSize,
      total: items.length,
      totalPages: 1,
    },
  };
}

function video(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'video-1',
    source: 'youtube',
    externalId: 'aaaaaaaaaaa',
    url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    title: 'GTİP Sınıflandırma Dersi 1',
    description: 'Armonize Sistem mantığı.',
    thumbnailUrl: 'https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg',
    publishedAt: '2024-08-20T09:00:00.000Z',
    isPinned: false,
    createdAt: '2024-08-20T09:00:00.000Z',
    updatedAt: '2024-08-20T09:00:00.000Z',
    ...overrides,
  };
}

function post(overrides: Partial<MediaItem> = {}): MediaItem {
  const { thumbnailUrl: _unused, ...base } = video();

  return {
    ...base,
    id: 'post-1',
    source: 'instagram',
    externalId: 'CzQ1x8Zx1Zx',
    url: 'https://www.instagram.com/p/CzQ1x8Zx1Zx/',
    title: 'Beyanname tescil ipucu',
    description: '30 saniyede özet.',
    ...overrides,
  };
}

function document(overrides: Partial<PublicResource> = {}): PublicResource {
  return {
    id: 'doc-1',
    title: 'İthalatta Gözetim Tebliği',
    description: 'Gözetim belgesi usul ve esasları.',
    category: 'teblig',
    originalFileName: 'gozetim-tebligi.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 245_760,
    downloadCount: 3,
    createdAt: '2024-08-27T18:30:00.000Z',
    ...overrides,
  };
}

/** Routes the two media calls (youtube / instagram) to their own fixtures. */
function mockMedia(videos: MediaItem[], posts: MediaItem[]): void {
  fetchMedia.mockImplementation(async (query: { source?: string }) =>
    query.source === 'instagram' ? page(posts) : page(videos),
  );
}

describe('LearningHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSiteConfig.mockResolvedValue(SITE);
    mockMedia([video()], [post()]);
    fetchResources.mockResolvedValue(page([document()]));
  });

  it('shows the three shelves together on the overview', async () => {
    render(<LearningHubPage />);

    expect(
      await screen.findByRole('heading', { name: /Videolar/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Instagram/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Belgeler/ })).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: 'GTİP Sınıflandırma Dersi 1' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Beyanname tescil ipucu' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'İthalatta Gözetim Tebliği' }),
    ).toBeInTheDocument();
  });

  it('renders the channel and profile links from the site config', async () => {
    render(<LearningHubPage />);

    expect(
      await screen.findByRole('link', { name: 'YouTube kanalı' }),
    ).toHaveAttribute('href', 'https://www.youtube.com/@gumrukdoktoru');
    expect(
      screen.getByRole('link', { name: 'Instagram profili' }),
    ).toHaveAttribute('href', 'https://www.instagram.com/gumrukdoktoru/');
  });

  it('opens a video in a dialog with the no-cookie embed', async () => {
    const user = userEvent.setup();

    render(<LearningHubPage />);

    await user.click(
      await screen.findByRole('button', {
        name: 'GTİP Sınıflandırma Dersi 1 videosunu oynat',
      }),
    );

    const dialog = within(screen.getByRole('dialog'));

    expect(
      dialog.getByTitle('GTİP Sınıflandırma Dersi 1'),
    ).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/aaaaaaaaaaa?rel=0',
    );

    await user.click(dialog.getByRole('button', { name: 'Kapat' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the video dialog on Escape', async () => {
    const user = userEvent.setup();

    render(<LearningHubPage />);
    await user.click(
      await screen.findByRole('button', {
        name: 'GTİP Sınıflandırma Dersi 1 videosunu oynat',
      }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('narrows to one shelf when a tab is selected', async () => {
    const user = userEvent.setup();

    render(<LearningHubPage />);
    await screen.findByRole('heading', { name: /Videolar/ });

    await user.click(screen.getByRole('tab', { name: 'Belgeler' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Videolar/ }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('İthalatta Gözetim Tebliği')).toBeInTheDocument();
  });

  it('opens an Instagram post in a dialog with the official embed', async () => {
    const user = userEvent.setup();

    render(<LearningHubPage />);
    await screen.findByRole('heading', { name: /Instagram/ });

    // No third-party iframe until the reader opens the post.
    expect(screen.queryByTitle('Beyanname tescil ipucu')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Beyanname tescil ipucu gönderisini aç',
      }),
    );

    const dialog = within(screen.getByRole('dialog'));

    expect(dialog.getByTitle('Beyanname tescil ipucu')).toHaveAttribute(
      'src',
      'https://www.instagram.com/p/CzQ1x8Zx1Zx/embed/captioned',
    );
    expect(dialog.getByRole('link', { name: /Instagram/ })).toHaveAttribute(
      'href',
      'https://www.instagram.com/p/CzQ1x8Zx1Zx/',
    );
  });

  it('shows an uploaded cover on an Instagram card', async () => {
    mockMedia(
      [video()],
      [
        post({
          thumbnailUrl: 'http://localhost:3000/api/v1/media/post-1/cover',
        }),
      ],
    );

    render(<LearningHubPage />);
    await screen.findByRole('heading', { name: /Instagram/ });

    const card = screen
      .getByRole('button', { name: 'Beyanname tescil ipucu gönderisini aç' });

    expect(within(card).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      'http://localhost:3000/api/v1/media/post-1/cover',
    );
  });

  it('falls back to a titled panel when a post has no cover', async () => {
    render(<LearningHubPage />);
    await screen.findByRole('heading', { name: /Instagram/ });

    const card = screen
      .getByRole('button', { name: 'Beyanname tescil ipucu gönderisini aç' });

    // No <img> at all, so no broken-image icon; a branded panel stands in.
    expect(within(card).queryByRole('presentation', { hidden: true })).toBeNull();
    expect(within(card).getByText('Instagram')).toBeInTheDocument();
  });

  it('sends one debounced search term to every shelf', async () => {
    const user = userEvent.setup();

    render(<LearningHubPage />);
    await screen.findByRole('heading', { name: /Videolar/ });

    await user.type(screen.getByLabelText('Ara'), 'gözetim');

    await waitFor(
      () => {
        expect(fetchResources).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'gözetim' }),
          expect.anything(),
        );
        expect(fetchMedia).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'gözetim', source: 'youtube' }),
          expect.anything(),
        );
      },
      { timeout: 2000 },
    );
  });

  it('shows an empty state when nothing matches', async () => {
    mockMedia([], []);
    fetchResources.mockResolvedValue(page([]));

    render(<LearningHubPage />);

    expect(await screen.findByText('Henüz içerik yok')).toBeInTheDocument();
  });

  it('still renders the shelves that loaded when one fails', async () => {
    fetchResources.mockRejectedValue(new Error('boom'));

    render(<LearningHubPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kaynaklar yüklenemedi.',
    );
    expect(screen.getByText('GTİP Sınıflandırma Dersi 1')).toBeInTheDocument();
  });

  it('falls back to neutral copy when the site config fails', async () => {
    fetchSiteConfig.mockRejectedValue(new Error('boom'));

    render(<LearningHubPage />);

    expect(
      await screen.findByRole('heading', { name: 'Gümrük Mevzuatı Kaynakları' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'YouTube kanalı' }),
    ).not.toBeInTheDocument();
  });

  it('downloads a document through the ticket URL', async () => {
    const user = userEvent.setup();
    const open = vi.fn();

    vi.stubGlobal('open', open);
    fetchDownloadTicket.mockResolvedValue({
      url: 'https://cdn.example.com/69655/public/uploads/1-gozetim.pdf',
      fileName: 'gozetim-tebligi.pdf',
      mimeType: 'application/pdf',
    });

    render(<LearningHubPage />);
    await user.click(await screen.findByRole('button', { name: 'İndir' }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(
        'https://cdn.example.com/69655/public/uploads/1-gozetim.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });

    vi.unstubAllGlobals();
  });
});
