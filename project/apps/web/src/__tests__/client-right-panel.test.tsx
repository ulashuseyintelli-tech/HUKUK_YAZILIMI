import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientProfile } from '@/components/client/client-profile';
import { ClientRightPanel } from '@/components/client/client-right-panel';
import { api, type ClientActionCatalogItem, type ClientOperatingSnapshot } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      getClient: vi.fn(),
      getCases: vi.fn(),
      getClientActionCatalog: vi.fn(),
      getClientOperatingSnapshot: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  getClient: ReturnType<typeof vi.fn>;
  getCases: ReturnType<typeof vi.fn>;
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
    missingFields: ['email'],
    followUpStatus: null,
    openTaskCount: 1,
    overdueTaskCount: 0,
    nextFollowUpAt: null,
    escalationLevel: null,
  },
  poa: { status: 'expiring', activeCount: 1, nearestValidUntil: '2026-07-20T00:00:00.000Z' },
  intake: { status: 'none', latestSubmission: null, latestLink: null },
  notification: { status: 'none', latest: null },
  signals: [
    {
      key: 'poa.expiring',
      label: 'POA expires soon',
      description: 'A limited active POA expires within 30 days.',
      severity: 'warning',
      actionKey: 'poa.reminder.send',
      target: { clientId: 'client-1' },
    },
  ],
  ...over,
});

const visibleActions = () => [
  action({ key: 'contact.update_missing_info', label: 'Contact update', href: '/clients/client-1/edit', order: 10 }),
  action({ key: 'activity.view_timeline', label: 'Activity timeline', category: 'activity', href: '/clients/client-1', order: 20 }),
  action({
    key: 'document.request.send',
    label: 'Document request',
    category: 'document',
    enabled: true,
    href: undefined,
    requiredState: 'DOCUMENT_REQUEST_READY',
    order: 30,
  }),
  action({
    key: 'intake.link.send',
    label: 'Existing link send',
    category: 'intake',
    enabled: false,
    href: undefined,
    disabledReason: 'Existing-link resend remains disabled.',
    order: 40,
  }),
  action({ key: 'case.open_related', label: 'Hidden case action', category: 'case', visibility: 'hidden', order: 50 }),
];

const client = {
  id: 'client-1',
  type: 'PERSON',
  firstName: 'Ada',
  lastName: 'Lovelace',
  tckn: '12345678901',
  phone: '555 000 00 00',
  email: 'ada@example.com',
  contacts: [],
  addresses: [],
  powerOfAttorneys: [],
};

describe('ClientRightPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getClientOperatingSnapshot.mockResolvedValue({ data: snapshot() });
    apiMock.getClientActionCatalog.mockResolvedValue({ data: visibleActions() });
    apiMock.getClient.mockResolvedValue({ data: client });
    apiMock.getCases.mockResolvedValue({ data: [] });
  });

  it('renders snapshot signals and visible action summaries without running commands', async () => {
    const onNavigateActions = vi.fn();
    const onNavigateActivity = vi.fn();

    render(
      <ClientRightPanel
        clientId="client-1"
        onNavigateActions={onNavigateActions}
        onNavigateActivity={onNavigateActivity}
      />,
    );

    await waitFor(() => expect(screen.getByText('POA expires soon')).toBeTruthy());

    expect(apiMock.getClientOperatingSnapshot).toHaveBeenCalledWith('client-1');
    expect(apiMock.getClientActionCatalog).toHaveBeenCalledWith('client-1');
    expect(screen.getByText('Dikkat')).toBeTruthy();
    expect(screen.getByText('Orta risk')).toBeTruthy();
    expect(screen.getByText('Contact update')).toBeTruthy();
    expect(screen.getByText('Document request')).toBeTruthy();
    expect(screen.getByText('Existing-link resend remains disabled.')).toBeTruthy();
    expect(screen.queryByText('Hidden case action')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Islemler'de ac/i }));
    expect(onNavigateActions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Aktiviteyi ac/i }));
    expect(onNavigateActivity).toHaveBeenCalledTimes(1);
  });

  it('renders inside ClientProfile as a read-only side panel', async () => {
    render(<ClientProfile clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Operasyon paneli')).toBeTruthy());

    expect(apiMock.getClient).toHaveBeenCalledWith('client-1');
    expect(apiMock.getCases).toHaveBeenCalledWith({ clientId: 'client-1', limit: 100 });
    expect(apiMock.getClientOperatingSnapshot).toHaveBeenCalledWith('client-1');
    expect(apiMock.getClientActionCatalog).toHaveBeenCalledWith('client-1');
    expect(screen.getByText('Read-only durum ve aksiyon ozeti')).toBeTruthy();
  });

  it('shows a safe empty signal state', async () => {
    apiMock.getClientOperatingSnapshot.mockResolvedValue({ data: snapshot({ health: 'healthy', riskLevel: 'low', signals: [] }) });

    render(<ClientRightPanel clientId="client-1" onNavigateActions={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Kritik veya uyarı sinyali yok.')).toBeTruthy());
    expect(screen.getByText('Saglikli')).toBeTruthy();
    expect(screen.getByText('Dusuk risk')).toBeTruthy();
  });

  it('renders error state when read models fail', async () => {
    apiMock.getClientOperatingSnapshot.mockRejectedValue(new Error('snapshot failed'));

    render(<ClientRightPanel clientId="client-1" onNavigateActions={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Operasyon paneli yuklenemedi.')).toBeTruthy());
  });
});
