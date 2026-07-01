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
      createClientWorkspaceIntakeLink: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  getClientActionCatalog: ReturnType<typeof vi.fn>;
  getClientOperatingSnapshot: ReturnType<typeof vi.fn>;
  createClientWorkspaceIntakeLink: ReturnType<typeof vi.fn>;
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

const enabledIntakeCreate = action({
  key: 'intake.link.create',
  category: 'intake',
  enabled: true,
  href: undefined,
  target: { clientId: 'client-1', caseId: 'case-1' },
  requiredState: 'INTAKE_CREATE_AVAILABLE',
  order: 30,
});

describe('ClientActionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.createClientWorkspaceIntakeLink.mockResolvedValue({
      link: { id: 'link-1', clientId: 'client-1', caseId: 'case-1', scope: ['ADDRESS'] },
      rawToken: 'raw-token',
      intakeUrl: 'https://form.example.com/intake/raw-token',
    });
    mockReady([
      action({ key: 'contact.update_missing_info', order: 10, href: '/clients/client-1/edit' }),
      action({ key: 'activity.view_timeline', category: 'activity', order: 20, href: '/clients/client-1' }),
      enabledIntakeCreate,
      action({
        key: 'intake.link.send',
        category: 'intake',
        enabled: false,
        disabledReason: 'Intake link sending requires dispatch and idempotency contracts.',
        href: undefined,
        order: 40,
      }),
      action({ key: 'case.open_related', category: 'case', visibility: 'hidden', order: 50 }),
    ]);
  });

  it('fetches action catalog and operating snapshot for the client', async () => {
    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText(/leti.*im bilgilerini/i)).toBeTruthy());

    expect(apiMock.getClientActionCatalog).toHaveBeenCalledWith('client-1');
    expect(apiMock.getClientOperatingSnapshot).toHaveBeenCalledWith('client-1');
    expect(screen.getByText('Durum')).toBeTruthy();
    expect(screen.getByText('Dikkat')).toBeTruthy();
    expect(screen.getByText('Contact information is incomplete')).toBeTruthy();
  });

  it('renders enabled navigation and keeps send action disabled', async () => {
    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText(/leti.*im bilgilerini/i)).toBeTruthy());

    expect(screen.getByText('Intake linki oluştur')).toBeTruthy();
    expect(screen.getByText('Intake link sending requires dispatch and idempotency contracts.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kapal/i })).toBeTruthy();
    expect(screen.queryByText(/lgili dosyalar/i)).toBeNull();
  });

  it('uses callback navigation for activity instead of creating a mutation control', async () => {
    const onNavigateActivity = vi.fn();

    render(<ClientActionsTab clientId="client-1" onNavigateActivity={onNavigateActivity} />);

    await waitFor(() => expect(screen.getByText(/Aktiviteyi/i)).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: /A/ })[0]);

    expect(onNavigateActivity).toHaveBeenCalledTimes(1);
    expect(apiMock.createClientWorkspaceIntakeLink).not.toHaveBeenCalled();
  });

  it('creates an intake link from the enabled action without body clientId', async () => {
    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Intake linki oluştur')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Olu/i }));
    expect(screen.getByText(/stenen bilgi kategorileri/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Link olu/i }));

    await waitFor(() => expect(apiMock.createClientWorkspaceIntakeLink).toHaveBeenCalledTimes(1));
    expect(apiMock.createClientWorkspaceIntakeLink).toHaveBeenCalledWith('client-1', 'case-1', {
      scope: ['ADDRESS'],
      expiresAt: undefined,
      maxUses: undefined,
    });
    expect(await screen.findByText('https://form.example.com/intake/raw-token')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kopyala/i })).toBeTruthy();
  });

  it('validates empty intake scope before calling the command endpoint', async () => {
    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Intake linki oluştur')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Olu/i }));
    fireEvent.click(screen.getByLabelText('Adres'));
    fireEvent.click(screen.getByRole('button', { name: /Link olu/i }));

    await waitFor(() => expect(screen.getByText(/en az bir kategori/i)).toBeTruthy());
    expect(apiMock.createClientWorkspaceIntakeLink).not.toHaveBeenCalled();
  });

  it('does not render a create command when action lacks case target', async () => {
    mockReady([
      action({
        key: 'intake.link.create',
        category: 'intake',
        enabled: false,
        disabledReason: 'Select a related case before creating an intake link.',
        href: undefined,
        target: { clientId: 'client-1' },
        order: 10,
      }),
    ]);

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Select a related case before creating an intake link.')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Kapal/i })).toBeTruthy();
    expect(apiMock.createClientWorkspaceIntakeLink).not.toHaveBeenCalled();
  });

  it('renders loading and error states', async () => {
    apiMock.getClientActionCatalog.mockReturnValue(new Promise(() => {}));
    apiMock.getClientOperatingSnapshot.mockReturnValue(new Promise(() => {}));

    const { rerender } = render(<ClientActionsTab clientId="client-1" />);
    expect(screen.getByText(/lemler y.*kleniyor/i)).toBeTruthy();

    apiMock.getClientActionCatalog.mockRejectedValue(new Error('failed'));
    apiMock.getClientOperatingSnapshot.mockResolvedValue({ data: snapshot() });
    rerender(<ClientActionsTab clientId="client-2" />);

    await waitFor(() => expect(screen.getByText(/lemler y.*klenemedi/i)).toBeTruthy());
  });
});
