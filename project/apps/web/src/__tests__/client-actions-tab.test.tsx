import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientActionsTab } from '@/components/client/client-actions-tab';
import { api, type ClientActionCatalogItem, type ClientOperatingSnapshot } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      getClientActionCatalog: vi.fn(),
      getClientOperatingSnapshot: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  getClientActionCatalog: ReturnType<typeof vi.fn>;
  getClientOperatingSnapshot: ReturnType<typeof vi.fn>;
};

const action = (over: Partial<ClientActionCatalogItem>): ClientActionCatalogItem => ({
  key: 'contact.update_missing_info',
  label: 'Update contact information',
  description: 'Open contact screen',
  category: 'contact',
  enabled: true,
  visibility: 'visible',
  dangerLevel: 'low',
  target: { clientId: 'client-1' },
  href: '/clients/client-1',
  order: 10,
  ...over,
});

const snapshot = (over: Partial<ClientOperatingSnapshot> = {}): ClientOperatingSnapshot => ({
  clientId: 'client-1',
  health: 'attention',
  riskLevel: 'medium',
  contact: {
    status: 'missing',
    missingFields: ['phone'],
    followUpStatus: 'ACTIVE',
    openTaskCount: 1,
    overdueTaskCount: 0,
    nextFollowUpAt: null,
    escalationLevel: null,
  },
  poa: { status: 'active', activeCount: 1, nearestValidUntil: null },
  intake: { status: 'none', latestSubmission: null, latestLink: null },
  notification: { status: 'none', latest: null },
  signals: [
    {
      key: 'contact.missing_info',
      label: 'Contact information is incomplete',
      description: 'Missing contact fields: phone',
      severity: 'warning',
      actionKey: 'contact.update_missing_info',
      target: { clientId: 'client-1' },
    },
  ],
  ...over,
});

function mockReady(actions: ClientActionCatalogItem[] = []) {
  apiMock.getClientActionCatalog.mockResolvedValue({ data: actions });
  apiMock.getClientOperatingSnapshot.mockResolvedValue({ data: snapshot() });
}

describe('ClientActionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReady([
      action({ key: 'contact.update_missing_info', order: 10, href: '/clients/client-1/edit' }),
      action({ key: 'activity.view_timeline', category: 'activity', order: 20, href: '/clients/client-1' }),
      action({
        key: 'intake.link.create',
        category: 'intake',
        enabled: false,
        disabledReason: 'Intake link creation requires a separate typed command contract.',
        href: undefined,
        order: 30,
      }),
      action({ key: 'case.open_related', category: 'case', visibility: 'hidden', order: 40 }),
    ]);
  });

  it('fetches action catalog and operating snapshot for the client', async () => {
    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('İletişim bilgilerini düzenle')).toBeTruthy());

    expect(apiMock.getClientActionCatalog).toHaveBeenCalledWith('client-1');
    expect(apiMock.getClientOperatingSnapshot).toHaveBeenCalledWith('client-1');
    expect(screen.getByText('Durum')).toBeTruthy();
    expect(screen.getByText('Dikkat')).toBeTruthy();
    expect(screen.getByText('Contact information is incomplete')).toBeTruthy();
  });

  it('renders enabled navigation and keeps future write actions disabled', async () => {
    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('İletişim bilgilerini düzenle')).toBeTruthy());

    expect(screen.getByText('İletişim bilgilerini düzenle').closest('div')?.textContent).toContain('İletişim');
    expect(screen.getByRole('button', { name: 'Kapalı' })).toBeTruthy();
    expect(screen.getByText('Intake link creation requires a separate typed command contract.')).toBeTruthy();
    expect(screen.queryByText('İlgili dosyaları aç')).toBeNull();
  });

  it('uses callback navigation for activity instead of creating a mutation control', async () => {
    const onNavigateActivity = vi.fn();

    render(<ClientActionsTab clientId="client-1" onNavigateActivity={onNavigateActivity} />);

    await waitFor(() => expect(screen.getByText('Aktiviteyi görüntüle')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: 'Aç' })[0]);

    expect(onNavigateActivity).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Gönder$/)).toBeNull();
    expect(screen.queryByText(/Oluştur$/)).toBeNull();
  });

  it('renders loading and error states', async () => {
    apiMock.getClientActionCatalog.mockReturnValue(new Promise(() => {}));
    apiMock.getClientOperatingSnapshot.mockReturnValue(new Promise(() => {}));

    const { rerender } = render(<ClientActionsTab clientId="client-1" />);
    expect(screen.getByText('İşlemler yükleniyor...')).toBeTruthy();

    apiMock.getClientActionCatalog.mockRejectedValue(new Error('failed'));
    apiMock.getClientOperatingSnapshot.mockResolvedValue({ data: snapshot() });
    rerender(<ClientActionsTab clientId="client-2" />);

    await waitFor(() => expect(screen.getByText('İşlemler yüklenemedi.')).toBeTruthy());
  });
});