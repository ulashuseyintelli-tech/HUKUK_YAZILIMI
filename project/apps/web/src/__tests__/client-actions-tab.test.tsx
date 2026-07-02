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
      createClientWorkspaceIntakeLinkAndDeliver: vi.fn(),
      sendClientWorkspacePoaReminder: vi.fn(),
      sendClientWorkspaceTemplateNotification: vi.fn(),
      sendClientWorkspaceDocumentRequest: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  getClientActionCatalog: ReturnType<typeof vi.fn>;
  getClientOperatingSnapshot: ReturnType<typeof vi.fn>;
  createClientWorkspaceIntakeLink: ReturnType<typeof vi.fn>;
  createClientWorkspaceIntakeLinkAndDeliver: ReturnType<typeof vi.fn>;
  sendClientWorkspacePoaReminder: ReturnType<typeof vi.fn>;
  sendClientWorkspaceTemplateNotification: ReturnType<typeof vi.fn>;
  sendClientWorkspaceDocumentRequest: ReturnType<typeof vi.fn>;
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
    apiMock.createClientWorkspaceIntakeLinkAndDeliver.mockResolvedValue({
      link: { id: 'link-2', clientId: 'client-1', caseId: 'case-1', scope: ['ADDRESS'] },
      delivery: { id: 'delivery-1', status: 'sent', channel: 'EMAIL', notificationId: 'notification-1', attemptCount: 1 },
    });
    apiMock.sendClientWorkspacePoaReminder.mockResolvedValue({
      clientId: 'client-1',
      status: 'sent',
      scanned: 1,
      recipients: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
    });
    apiMock.sendClientWorkspaceTemplateNotification.mockResolvedValue({
      clientId: 'client-1',
      caseId: 'case-1',
      templateCode: 'GENEL_BILGILENDIRME',
      status: 'sent',
      notificationId: 'notification-1',
    });
    apiMock.sendClientWorkspaceDocumentRequest.mockResolvedValue({
      clientId: 'client-1',
      caseId: 'case-1',
      documentCodes: ['GENEL_BELGE'],
      status: 'sent',
      documentRequestId: 'document-request-1',
      notificationId: 'notification-1',
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

    expect(screen.getAllByText(/Intake linki olu/i)[0]).toBeTruthy();
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

    await waitFor(() => expect(screen.getAllByText(/Intake linki olu/i)[0]).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Olu/i }));
    expect(screen.getByText(/stenen bilgi kategorileri/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Link olu.tur$/i }));

    await waitFor(() => expect(apiMock.createClientWorkspaceIntakeLink).toHaveBeenCalledTimes(1));
    expect(apiMock.createClientWorkspaceIntakeLink).toHaveBeenCalledWith('client-1', 'case-1', {
      scope: ['ADDRESS'],
      expiresAt: undefined,
      maxUses: undefined,
    });
    expect(await screen.findByText('https://form.example.com/intake/raw-token')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kopyala/i })).toBeTruthy();
    await waitFor(() => expect(apiMock.getClientActionCatalog).toHaveBeenCalledTimes(2));
    expect(apiMock.getClientOperatingSnapshot).toHaveBeenCalledTimes(2);
  });

  it('creates and delivers an intake link without expecting raw URL in the response', async () => {
    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getAllByText(/Intake linki olu/i)[0]).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Olu/i }));
    fireEvent.click(screen.getByRole('button', { name: /e-posta ile g.nder/i }));

    await waitFor(() => expect(apiMock.createClientWorkspaceIntakeLinkAndDeliver).toHaveBeenCalledTimes(1));
    expect(apiMock.createClientWorkspaceIntakeLinkAndDeliver).toHaveBeenCalledWith('client-1', 'case-1', {
      scope: ['ADDRESS'],
      expiresAt: undefined,
      maxUses: undefined,
    });
    expect(await screen.findByText(/e-posta g.nderildi/i)).toBeTruthy();
    expect(screen.queryByText('https://form.example.com/intake/raw-token')).toBeNull();
    await waitFor(() => expect(apiMock.getClientActionCatalog).toHaveBeenCalledTimes(2));
    expect(apiMock.getClientOperatingSnapshot).toHaveBeenCalledTimes(2);
  });

  it.each<[string, string, RegExp]>([
    ['intake.delivery_failed', 'Intake link delivery failed', /Önceki g.nderim ba.ar.s.z oldu/i],
    ['intake.delivery_stuck', 'Intake link delivery is stuck', /Önceki g.nderim tamamlanmadan kald./i],
  ])('opens the retry-as-new flow from %s signal without using existing-link resend', async (key, label, copyMatcher) => {
    apiMock.getClientOperatingSnapshot.mockResolvedValue({
      data: snapshot({
        signals: [
          {
            key,
            label,
            description: 'Delivery needs manual attention.',
            severity: 'warning',
            actionKey: 'intake.link.create',
            target: { clientId: 'client-1', caseId: 'case-1' },
          },
        ],
      }),
    });

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
    expect(screen.getByText(copyMatcher)).toBeTruthy();
    expect(screen.getByText(/Eski link otomatik iptal edilmez/i)).toBeTruthy();
    expect(screen.getByText('Intake link sending requires dispatch and idempotency contracts.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kapal/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Yeni link olu.tur ve e-posta ile g.nder/i }));

    await waitFor(() => expect(screen.getByText(/Yeniden yeni link olu.tur ve g.nder/i)).toBeTruthy());
    expect(screen.getByText(/mevcut linki yeniden g.nderme veya ayn. link retry/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Link olu.tur ve e-posta ile g.nder$/i }));

    await waitFor(() => expect(apiMock.createClientWorkspaceIntakeLinkAndDeliver).toHaveBeenCalledTimes(1));
    expect(apiMock.createClientWorkspaceIntakeLinkAndDeliver).toHaveBeenCalledWith('client-1', 'case-1', {
      scope: ['ADDRESS'],
      expiresAt: undefined,
      maxUses: undefined,
    });
    expect(apiMock.createClientWorkspaceIntakeLink).not.toHaveBeenCalled();
    expect(await screen.findByText(/e-posta g.nderildi/i)).toBeTruthy();
    expect(screen.queryByText('https://form.example.com/intake/raw-token')).toBeNull();
  });

  it('sends an enabled POA reminder action through the workspace command endpoint', async () => {
    mockReady([
      action({
        key: 'poa.reminder.send',
        category: 'poa',
        enabled: true,
        href: undefined,
        target: { clientId: 'client-1' },
        requiredState: 'POA_EXPIRING_ACTIVE',
        order: 35,
      }),
    ]);

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText(/Vekalet hat.rlatmas./i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^G.nder$/i }));

    await waitFor(() => expect(apiMock.sendClientWorkspacePoaReminder).toHaveBeenCalledTimes(1));
    expect(apiMock.sendClientWorkspacePoaReminder).toHaveBeenCalledWith('client-1');
    expect(await screen.findByText(/Vekalet hat.rlatmas. g.nderildi/i)).toBeTruthy();
    expect(screen.getByText(/G.nderilen: 1, ba.ar.s.z: 0, atlanan: 0/i)).toBeTruthy();
    await waitFor(() => expect(apiMock.getClientActionCatalog).toHaveBeenCalledTimes(2));
    expect(apiMock.getClientOperatingSnapshot).toHaveBeenCalledTimes(2);
  });

  it('keeps disabled POA reminder unavailable and does not call the command endpoint', async () => {
    mockReady([
      action({
        key: 'poa.reminder.send',
        category: 'poa',
        enabled: false,
        disabledReason: 'Yakinda bitecek aktif vekalet yok.',
        href: undefined,
        target: { clientId: 'client-1' },
        order: 35,
      }),
    ]);

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Yakinda bitecek aktif vekalet yok.')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Kapal/i })).toBeTruthy();
    expect(apiMock.sendClientWorkspacePoaReminder).not.toHaveBeenCalled();
  });

  it('shows POA reminder command failure without optimistic success', async () => {
    apiMock.sendClientWorkspacePoaReminder.mockRejectedValueOnce(new Error('POA reminder failed'));
    mockReady([
      action({
        key: 'poa.reminder.send',
        category: 'poa',
        enabled: true,
        href: undefined,
        target: { clientId: 'client-1' },
        requiredState: 'POA_EXPIRING_ACTIVE',
        order: 35,
      }),
    ]);

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText(/Vekalet hat.rlatmas./i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^G.nder$/i }));

    await waitFor(() => expect(apiMock.sendClientWorkspacePoaReminder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('POA reminder failed')).toBeTruthy();
    expect(screen.queryByText(/Vekalet hat.rlatmas. g.nderildi/i)).toBeNull();
  });


  it('sends an enabled template notification with selected allowlist template', async () => {
    mockReady([
      action({
        key: 'notification.template.send',
        label: 'Sablon bildirimi gonder',
        category: 'notification',
        enabled: true,
        href: undefined,
        target: { clientId: 'client-1', caseId: 'case-1' },
        requiredState: 'TEMPLATE_NOTIFICATION_READY',
        order: 36,
      }),
    ]);

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText(/ablon bildirim/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Sec/i }));
    fireEvent.change(screen.getByLabelText(/Sablon/i), { target: { value: 'DOSYA_DURUMU' } });
    fireEvent.click(screen.getByRole('button', { name: /^Sablon bildirimi gonder$/i }));

    await waitFor(() => expect(apiMock.sendClientWorkspaceTemplateNotification).toHaveBeenCalledTimes(1));
    expect(apiMock.sendClientWorkspaceTemplateNotification).toHaveBeenCalledWith('client-1', {
      templateCode: 'DOSYA_DURUMU',
      caseId: 'case-1',
    });
    expect(await screen.findByText(/Sablon bildirimi gonderildi/i)).toBeTruthy();
    expect(screen.getByText(/Yanitta alici, govde, dedupe/i)).toBeTruthy();
    expect(screen.queryByText(/@example/i)).toBeNull();
    expect(screen.queryByText(/dedupe-key/i)).toBeNull();
    await waitFor(() => expect(apiMock.getClientActionCatalog).toHaveBeenCalledTimes(2));
    expect(apiMock.getClientOperatingSnapshot).toHaveBeenCalledTimes(2);
  });

  it('keeps disabled template notification unavailable', async () => {
    mockReady([
      action({
        key: 'notification.template.send',
        label: 'Sablon bildirimi gonder',
        category: 'notification',
        enabled: false,
        disabledReason: 'Sablon bildirimi icin uygun alici yok.',
        href: undefined,
        target: { clientId: 'client-1' },
        order: 36,
      }),
    ]);

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Sablon bildirimi icin uygun alici yok.')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Kapal/i })).toBeTruthy();
    expect(apiMock.sendClientWorkspaceTemplateNotification).not.toHaveBeenCalled();
  });

  it('shows template notification failure without optimistic success', async () => {
    apiMock.sendClientWorkspaceTemplateNotification.mockRejectedValueOnce(new Error('Template send failed'));
    mockReady([
      action({
        key: 'notification.template.send',
        label: 'Sablon bildirimi gonder',
        category: 'notification',
        enabled: true,
        href: undefined,
        target: { clientId: 'client-1' },
        requiredState: 'TEMPLATE_NOTIFICATION_READY',
        order: 36,
      }),
    ]);

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText(/ablon bildirim/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Sec/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Sablon bildirimi gonder$/i }));

    await waitFor(() => expect(apiMock.sendClientWorkspaceTemplateNotification).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Template send failed')).toBeTruthy();
    expect(screen.queryByText(/Sablon bildirimi gonderildi/i)).toBeNull();
  });

  it('sends an enabled document request with selected allowlist document codes', async () => {
    mockReady([
      action({
        key: 'document.request.send',
        label: 'Belge talebi gonder',
        category: 'document',
        enabled: true,
        href: undefined,
        target: { clientId: 'client-1', caseId: 'case-1' },
        requiredState: 'DOCUMENT_REQUEST_READY',
        order: 37,
      }),
    ]);

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Belge talebi gonder')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Sec/i }));
    expect(screen.getByText(/Belge talebi tipleri/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Dosya evraki'));
    fireEvent.click(screen.getByRole('button', { name: /^Belge talebi gonder$/i }));

    await waitFor(() => expect(apiMock.sendClientWorkspaceDocumentRequest).toHaveBeenCalledTimes(1));
    expect(apiMock.sendClientWorkspaceDocumentRequest).toHaveBeenCalledWith('client-1', {
      documentCodes: ['GENEL_BELGE', 'DOSYA_EVRAKI'],
      caseId: 'case-1',
    });
    expect(await screen.findByText(/Belge talebi gonderildi/i)).toBeTruthy();
    expect(screen.getByText(/Yanitta alici, govde, token, dedupe/i)).toBeTruthy();
    expect(screen.queryByText(/@example/i)).toBeNull();
    expect(screen.queryByText(/dedupe-key/i)).toBeNull();
    await waitFor(() => expect(apiMock.getClientActionCatalog).toHaveBeenCalledTimes(2));
    expect(apiMock.getClientOperatingSnapshot).toHaveBeenCalledTimes(2);
  });

  it('keeps disabled document request unavailable', async () => {
    mockReady([
      action({
        key: 'document.request.send',
        label: 'Belge talebi gonder',
        category: 'document',
        enabled: false,
        disabledReason: 'Document request requires the active V1 email template.',
        href: undefined,
        target: { clientId: 'client-1' },
        order: 37,
      }),
    ]);

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Document request requires the active V1 email template.')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Kapal/i })).toBeTruthy();
    expect(apiMock.sendClientWorkspaceDocumentRequest).not.toHaveBeenCalled();
  });

  it('shows document request failure without optimistic success', async () => {
    apiMock.sendClientWorkspaceDocumentRequest.mockRejectedValueOnce(new Error('Document request failed'));
    mockReady([
      action({
        key: 'document.request.send',
        label: 'Belge talebi gonder',
        category: 'document',
        enabled: true,
        href: undefined,
        target: { clientId: 'client-1', caseId: 'case-1' },
        requiredState: 'DOCUMENT_REQUEST_READY',
        order: 37,
      }),
    ]);

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Belge talebi gonder')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Sec/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Belge talebi gonder$/i }));

    await waitFor(() => expect(apiMock.sendClientWorkspaceDocumentRequest).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Document request failed')).toBeTruthy();
    expect(screen.queryByText(/Belge talebi gonderildi/i)).toBeNull();
  });

  it('validates empty document request selection before calling the command endpoint', async () => {
    mockReady([
      action({
        key: 'document.request.send',
        label: 'Belge talebi gonder',
        category: 'document',
        enabled: true,
        href: undefined,
        target: { clientId: 'client-1', caseId: 'case-1' },
        requiredState: 'DOCUMENT_REQUEST_READY',
        order: 37,
      }),
    ]);

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Belge talebi gonder')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Sec/i }));
    fireEvent.click(screen.getByLabelText('Genel belge'));
    fireEvent.click(screen.getByRole('button', { name: /^Belge talebi gonder$/i }));

    await waitFor(() => expect(screen.getByText(/en az bir belge talebi/i)).toBeTruthy());
    expect(apiMock.sendClientWorkspaceDocumentRequest).not.toHaveBeenCalled();
  });

  it('shows failed delivery status without optimistic success', async () => {
    apiMock.createClientWorkspaceIntakeLinkAndDeliver.mockResolvedValueOnce({
      link: { id: 'link-2', clientId: 'client-1', caseId: 'case-1', scope: ['ADDRESS'] },
      delivery: { id: 'delivery-1', status: 'failed', channel: 'EMAIL', attemptCount: 1, error: 'SMTP unavailable' },
    });

    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getAllByText(/Intake linki olu/i)[0]).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Olu/i }));
    fireEvent.click(screen.getByRole('button', { name: /e-posta ile g.nder/i }));

    await waitFor(() => expect(apiMock.createClientWorkspaceIntakeLinkAndDeliver).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/g.nderilemedi/i)).toBeTruthy();
    expect(screen.getByText('SMTP unavailable')).toBeTruthy();
    expect(screen.queryByText(/e-posta g.nderildi/i)).toBeNull();
  });

  it('validates empty intake scope before calling the command endpoint', async () => {
    render(<ClientActionsTab clientId="client-1" />);

    await waitFor(() => expect(screen.getAllByText(/Intake linki olu/i)[0]).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Olu/i }));
    fireEvent.click(screen.getByLabelText('Adres'));
    fireEvent.click(screen.getByRole('button', { name: /^Link olu.tur$/i }));

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
