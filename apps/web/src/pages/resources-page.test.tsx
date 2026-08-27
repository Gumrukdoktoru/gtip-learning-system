import type { PaginatedData, PublicResource } from '@gtip/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResourcesPage } from './resources-page';

const { fetchResources, fetchDownloadTicket } = vi.hoisted(() => ({
  fetchResources: vi.fn(),
  fetchDownloadTicket: vi.fn(),
}));

vi.mock('../services/resource-service', () => ({
  fetchResources,
  fetchDownloadTicket,
  isAdminResource: (resource: object) => 'storageKey' in resource,
}));

function buildResource(
  overrides: Partial<PublicResource> = {},
): PublicResource {
  return {
    id: '0d6f6f6c-0000-4000-8000-000000000001',
    title: 'İthalatta Gözetim Uygulaması Tebliği',
    description: 'Gözetim belgesi düzenlenmesine ilişkin usul ve esaslar.',
    category: 'teblig',
    originalFileName: 'gozetim-tebligi.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 245_760,
    downloadCount: 3,
    createdAt: '2024-08-27T18:30:00.000Z',
    ...overrides,
  };
}

function buildPage(
  items: PublicResource[],
  total = items.length,
): PaginatedData<PublicResource> {
  return {
    items,
    pagination: { page: 1, pageSize: 12, total, totalPages: 1 },
  };
}

describe('ResourcesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the resources returned by the API', async () => {
    fetchResources.mockResolvedValue(buildPage([buildResource()]));

    render(<ResourcesPage />);

    expect(
      await screen.findByText('İthalatta Gözetim Uygulaması Tebliği'),
    ).toBeInTheDocument();

    // Scoped to the card: "Tebliğ" also appears in the category filter.
    const card = within(screen.getByRole('article'));

    expect(card.getByText('Tebliğ')).toBeInTheDocument();
    expect(card.getByText('PDF')).toBeInTheDocument();
    expect(card.getByText('240 KB')).toBeInTheDocument();
    expect(card.getByText('3 indirme')).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    fetchResources.mockResolvedValue(buildPage([]));

    render(<ResourcesPage />);

    expect(await screen.findByText('Kayıt bulunamadı')).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    fetchResources.mockRejectedValue(new Error('boom'));

    render(<ResourcesPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kaynaklar yüklenemedi.',
    );
  });

  it('sends the search term to the API after debouncing', async () => {
    const user = userEvent.setup();

    fetchResources.mockResolvedValue(buildPage([buildResource()]));

    render(<ResourcesPage />);
    await screen.findByText('İthalatta Gözetim Uygulaması Tebliği');

    await user.type(screen.getByLabelText('Ara'), 'gözetim');

    await waitFor(
      () => {
        expect(fetchResources).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'gözetim', page: 1 }),
          expect.anything(),
        );
      },
      { timeout: 2000 },
    );
  });

  it('opens the ticket URL when a resource is downloaded', async () => {
    const user = userEvent.setup();
    const open = vi.fn();

    vi.stubGlobal('open', open);
    fetchResources.mockResolvedValue(buildPage([buildResource()]));
    fetchDownloadTicket.mockResolvedValue({
      url: 'https://cdn.example.com/69655/public/uploads/1-gozetim.pdf',
      fileName: 'gozetim-tebligi.pdf',
      mimeType: 'application/pdf',
    });

    render(<ResourcesPage />);
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
