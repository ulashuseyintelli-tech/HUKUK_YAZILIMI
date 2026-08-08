import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DisclosureAuditPanel } from '@/components/client-disclosure/DisclosureAuditPanel';
import type {
  OfficeDisclosureActionCapabilities,
  OfficeDisclosureDetail,
} from '@/lib/api/client-financial-disclosure';

const getTimeline = vi.fn();
const retryPublication = vi.fn();

vi.mock('@/lib/api/client-financial-disclosure', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client-financial-disclosure')>();
  return {
    ...original,
    clientFinancialDisclosureApi: {
      getTimeline: (...args: unknown[]) => getTimeline(...args),
      retryPublication: (...args: unknown[]) => retryPublication(...args),
    },
  };
});

const noActions: OfficeDisclosureActionCapabilities = {
  canRequestOfficeApproval: false,
  canCompleteOfficeApproval: false,
  canRequestContentApproval: false,
  canCompleteContentApproval: false,
  canPublish: false,
  canRetryPublication: false,
  canReverse: false,
  canSupersede: false,
};

const pendingDelivery: OfficeDisclosureDetail['delivery'] = {
  state: 'PENDING',
  sendRequestedAt: '2026-08-08T08:30:00.000Z',
  providerAcceptedAt: null,
  publishedAt: null,
};

function renderPanel({
  actions = noActions,
  delivery = pendingDelivery,
}: {
  actions?: OfficeDisclosureActionCapabilities;
  delivery?: OfficeDisclosureDetail['delivery'];
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DisclosureAuditPanel
        clientId="client-scope"
        versionId="version-secret-id"
        delivery={delivery}
        actions={actions}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getTimeline.mockResolvedValue({
    surface: 'OFFICE_TIMELINE',
    versionId: 'version-secret-id',
    events: [
      {
        type: 'VERSION_CREATED',
        occurredAt: '2026-08-08T08:00:00.000Z',
        actor: 'OFFICE_USER',
      },
      {
        type: 'SEND_REQUESTED',
        occurredAt: '2026-08-08T08:30:00.000Z',
        actor: 'SYSTEM',
      },
    ],
  });
  retryPublication.mockResolvedValue({ status: 'PUBLISHED' });
});

describe('DisclosureAuditPanel X1-B05', () => {
  it('curated olayları kullanıcı etiketleriyle gösterir ve teknik kimliği render etmez', async () => {
    const view = renderPanel();

    expect(await screen.findByText('Bildirim sürümü oluşturuldu')).toBeInTheDocument();
    expect(screen.getByText('Teslim işlemi başlatıldı')).toBeInTheDocument();
    expect(screen.getByText(/Büro kullanıcısı/)).toBeInTheDocument();
    expect(screen.getByText(/Sistem/)).toBeInTheDocument();
    expect(view.container.textContent).not.toContain('version-secret-id');
  });

  it('timeline yükleme hatasında backend ayrıntısını göstermeden generic mesaj verir', async () => {
    getTimeline.mockRejectedValue(new Error('actorId=secret providerMessageId=secret'));
    const view = renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Audit zaman çizelgesi yüklenemedi.',
    );
    expect(view.container.textContent).not.toContain('actorId');
    expect(view.container.textContent).not.toContain('providerMessageId');
  });

  it('SEND_FAILED durumunu anlamlı açıklar ancak capability yoksa retry aksiyonu sunmaz', async () => {
    renderPanel({
      delivery: { ...pendingDelivery, state: 'FAILED_RETRY_AVAILABLE' },
    });

    expect(await screen.findByText('Bildirim sürümü oluşturuldu')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Teslim sağlayıcısı bildirimi kabul etmedi');
    expect(
      screen.queryByRole('button', { name: 'Kontrollü teslim retry’ını başlat' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/tekrar gönder/i)).not.toBeInTheDocument();
    expect(retryPublication).not.toHaveBeenCalled();
  });

  it('kontrollü retry komutunu yalnız server capability true olduğunda ayrı aksiyonla çağırır', async () => {
    renderPanel({
      actions: { ...noActions, canRetryPublication: true },
      delivery: { ...pendingDelivery, state: 'FAILED_RETRY_AVAILABLE' },
    });
    const button = await screen.findByRole('button', {
      name: 'Kontrollü teslim retry’ını başlat',
    });
    fireEvent.click(button);

    await waitFor(() => expect(retryPublication).toHaveBeenCalledWith('version-secret-id'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Kontrollü teslim retry’ı işlendi; güncel durum yenilendi.',
    );
    expect(screen.queryByText(/tekrar gönder/i)).not.toBeInTheDocument();
  });

  it('retry reddinde sağlayıcı hata gövdesini ekrana taşımaz', async () => {
    retryPublication.mockRejectedValue(new Error('raw SMTP failure providerMessageId=secret'));
    const view = renderPanel({
      actions: { ...noActions, canRetryPublication: true },
      delivery: { ...pendingDelivery, state: 'FAILED_RETRY_AVAILABLE' },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Kontrollü teslim retry’ını başlat' }),
    );

    await waitFor(() =>
      expect(screen.getAllByRole('alert').some((node) =>
        node.textContent?.includes('Kontrollü teslim retry’ı tamamlanamadı.'),
      )).toBe(true),
    );
    expect(view.container.textContent).not.toContain('SMTP');
    expect(view.container.textContent).not.toContain('providerMessageId');
  });
});
