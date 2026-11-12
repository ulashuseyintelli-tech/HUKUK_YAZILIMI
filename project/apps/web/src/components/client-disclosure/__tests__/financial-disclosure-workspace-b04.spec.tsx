import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DisclosureApprovalPanel } from '@/components/client-disclosure/DisclosureApprovalPanel';
import type { OfficeDisclosureActionCapabilities } from '@/lib/api/client-financial-disclosure';

const requestOfficeApproval = vi.fn();
const completeOfficeApproval = vi.fn();
const requestContentApproval = vi.fn();
const completeContentApproval = vi.fn();
const publish = vi.fn();
const getInbox = vi.fn();
const getRecipientSelection = vi.fn();
let activeActor = { id: 'fd-office-actor', tenantId: 'fd-office-tenant' };

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: activeActor }) }));

vi.mock('@/lib/api/client-financial-disclosure', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client-financial-disclosure')>();
  return {
    ...original,
    clientFinancialDisclosureApi: {
      getRecipientSelection: (...args: unknown[]) => getRecipientSelection(...args),
      requestOfficeApproval: (...args: unknown[]) => requestOfficeApproval(...args),
      completeOfficeApproval: (...args: unknown[]) => completeOfficeApproval(...args),
      requestContentApproval: (...args: unknown[]) => requestContentApproval(...args),
      completeContentApproval: (...args: unknown[]) => completeContentApproval(...args),
      publish: (...args: unknown[]) => publish(...args),
    },
  };
});

vi.mock('@/lib/api/office-approval', () => ({
  officeApprovalApi: {
    getInbox: (...args: unknown[]) => getInbox(...args),
  },
}));

const noActions: OfficeDisclosureActionCapabilities = {
  canRequestOfficeApproval: false,
  canCompleteOfficeApproval: false,
  canRequestContentApproval: false,
  canCompleteContentApproval: false,
  canReconcileConsumedApproval: false,
  canPublish: false,
  canRetryPublication: false,
  canReverse: false,
  canSupersede: false,
};

function renderPanel(actions: OfficeDisclosureActionCapabilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DisclosureApprovalPanel
        clientId="client-scope"
        versionId="version-scope"
        actions={actions}
      />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  activeActor = { id: 'fd-office-actor', tenantId: 'fd-office-tenant' };
  getRecipientSelection.mockReset();
  getRecipientSelection.mockResolvedValue({
    surface: 'OFFICE_RECIPIENT_SELECTION',
    options: [{ email: 'client@example.test', label: 'Müvekkil iletişim kaydı' }],
    selectedRecipient: null,
  });
  requestOfficeApproval.mockResolvedValue({ status: 'OFFICE_APPROVAL_PENDING' });
  completeOfficeApproval.mockResolvedValue({ status: 'OFFICE_APPROVED' });
  requestContentApproval.mockResolvedValue({ status: 'CONTENT_APPROVAL_PENDING' });
  completeContentApproval.mockResolvedValue({ status: 'CONTENT_APPROVED' });
  publish.mockResolvedValue({ status: 'PUBLISHED' });
});

describe('DisclosureApprovalPanel X1-B04', () => {
  it('CL-R10 HTTP 200 SEND_FAILED is not publication success', async () => {
    publish.mockResolvedValue({ status: 'SEND_FAILED' });
    getRecipientSelection.mockResolvedValue({ surface: 'OFFICE_RECIPIENT_SELECTION', options: [], selectedRecipient: { email: 'client@example.test' } });
    renderPanel({ ...noActions, canPublish: true });
    const button = screen.getByRole('button', { name: 'Yayınla ve gönder' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Bildirim yayımlanmadı');
    expect(screen.queryByText('Yayın ve teslim işlemi tamamlandı.')).not.toBeInTheDocument();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('staff capability projeksiyonunda nihai onay ve yayın aksiyonlarını göstermez veya çağırmaz', () => {
    renderPanel(noActions);

    expect(screen.getByText('Bu sürüm için kullanılabilir işlem bulunmuyor.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ofis onayını tamamla' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'İçerik onayını tamamla' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yayınla ve gönder' })).not.toBeInTheDocument();
    expect(getInbox).not.toHaveBeenCalled();
    expect(completeOfficeApproval).not.toHaveBeenCalled();
    expect(completeContentApproval).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('ofis onay talebini yalnız server capability true olduğunda gönderir', async () => {
    renderPanel({ ...noActions, canRequestOfficeApproval: true });
    fireEvent.click(screen.getByRole('button', { name: 'Ofis onayına gönder' }));

    await waitFor(() => expect(requestOfficeApproval).toHaveBeenCalledWith('version-scope'));
    expect(await screen.findByRole('status')).toHaveTextContent('Ofis onay talebi oluşturuldu.');
  });

  it('eligible approver inbox bağını internal ID göstermeden canonical complete komutuna taşır', async () => {
    getInbox.mockResolvedValue([
      {
        id: 'unrelated-request-id',
        actionCode: 'CLIENT_FINANCIAL_DISCLOSURE_APPROVE',
        targetType: 'ClientFinancialDisclosureVersion',
        targetRef: 'other-version',
      },
      {
        id: 'approval-request-secret-id',
        actionCode: 'CLIENT_FINANCIAL_DISCLOSURE_APPROVE',
        targetType: 'ClientFinancialDisclosureVersion',
        targetRef: 'version-scope',
      },
    ]);
    const view = renderPanel({ ...noActions, canCompleteOfficeApproval: true });
    fireEvent.click(screen.getByRole('button', { name: 'Ofis onayını tamamla' }));

    await waitFor(() => {
      expect(getInbox).toHaveBeenCalledWith('PENDING_APPROVAL');
      expect(completeOfficeApproval).toHaveBeenCalledWith(
        'version-scope',
        'approval-request-secret-id',
      );
    });
    expect(view.container.textContent).not.toContain('approval-request-secret-id');
  });

  it('içerik talebinde alıcıyı canonical mühürleme komutuna aynen bağlar', async () => {
    renderPanel({ ...noActions, canRequestContentApproval: true });
    await screen.findByRole('option', { name: /client@example.test/ });
    fireEvent.change(screen.getByLabelText('Onaylanacak alıcı e-postası'), {
      target: { value: 'client@example.test' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'İçerik onayına gönder' }).closest('form')!);

    await waitFor(() =>
      expect(requestContentApproval).toHaveBeenCalledWith(
        'version-scope',
        'client@example.test',
      ),
    );
  });

  it('final content approval ve publish çağrılarını yalnız ayrı capability bayraklarıyla açar', async () => {
    getRecipientSelection.mockResolvedValue({
      surface: 'OFFICE_RECIPIENT_SELECTION', options: [], selectedRecipient: { email: 'client@example.test' },
    });
    const first = renderPanel({ ...noActions, canCompleteContentApproval: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'İçerik onayını tamamla' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'İçerik onayını tamamla' }));
    await waitFor(() => expect(completeContentApproval).toHaveBeenCalledWith('version-scope'));
    first.unmount();

    renderPanel({ ...noActions, canPublish: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yayınla ve gönder' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Yayınla ve gönder' }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith('version-scope'));
  });

  it('backend/provider hata ayrıntısını ekrana taşımadan generic fail-closed mesaj gösterir', async () => {
    publish.mockRejectedValue(new Error('providerMessageId=secret raw SMTP failure'));
    getRecipientSelection.mockResolvedValue({ surface: 'OFFICE_RECIPIENT_SELECTION', options: [], selectedRecipient: { email: 'client@example.test' } });
    const view = renderPanel({ ...noActions, canPublish: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yayınla ve gönder' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Yayınla ve gönder' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Yayın ve teslim işlemi tamamlanamadı.',
    );
    expect(view.container.textContent).not.toContain('providerMessageId');
    expect(view.container.textContent).not.toContain('SMTP');
  });

  it('5a serbest adres alanı açmaz; kayıtlı olmayan adresle onay istemez', async () => {
    renderPanel({ ...noActions, canRequestContentApproval: true });
    await screen.findByRole('option', { name: /client@example.test/ });
    expect(screen.queryByRole('textbox', { name: 'Onaylanacak alıcı e-postası' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'outside@example.test' } });
    fireEvent.submit(screen.getByRole('button', { name: 'İçerik onayına gönder' }).closest('form')!);
    expect(requestContentApproval).not.toHaveBeenCalled();
  });

  it('5a alıcı GET reddini boş kayıt ya da başarı olarak göstermez', async () => {
    getRecipientSelection.mockRejectedValue(new Error('private provider detail'));
    const view = renderPanel({ ...noActions, canRequestContentApproval: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('Müvekkilin alıcı kayıtları yüklenemedi');
    expect(screen.queryByText('Müvekkil kayıtlarında seçilebilir e-posta adresi yok.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'İçerik onayına gönder' })).toBeDisabled();
    expect(view.container.textContent).not.toContain('private provider detail');
    expect(requestContentApproval).not.toHaveBeenCalled();
  });

  it('5a gerçek boş seçenek listesinde alıcı uydurmaz', async () => {
    getRecipientSelection.mockResolvedValue({ surface: 'OFFICE_RECIPIENT_SELECTION', options: [], selectedRecipient: null });
    renderPanel({ ...noActions, canRequestContentApproval: true });
    await screen.findByText('Müvekkil kayıtlarında seçilebilir e-posta adresi yok.');
    expect(screen.getByRole('button', { name: 'İçerik onayına gönder' })).toBeDisabled();
    expect(requestContentApproval).not.toHaveBeenCalled();
  });

  it('5a mühürlü alıcı yüklenmeden içerik onayı veya yayın düğmesi çalışmaz', async () => {
    getRecipientSelection.mockReturnValue(new Promise(() => {}));
    renderPanel({ ...noActions, canCompleteContentApproval: true, canPublish: true });
    fireEvent.click(screen.getByRole('button', { name: 'İçerik onayını tamamla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yayınla ve gönder' }));
    expect(completeContentApproval).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('5a aktör değişince önceki aktörün alıcı önbelleğini göstermez', async () => {
    const actions = { ...noActions, canRequestContentApproval: true };
    const view = renderPanel(actions);
    await screen.findByRole('option', { name: /client@example.test/ });
    activeActor = { ...activeActor, id: 'different-actor' };
    getRecipientSelection.mockRejectedValue(new Error('forbidden'));
    view.rerender(<QueryClientProvider client={view.queryClient}><DisclosureApprovalPanel clientId="client-scope" versionId="version-scope" actions={actions} /></QueryClientProvider>);
    expect(screen.queryByRole('option', { name: /client@example.test/ })).not.toBeInTheDocument();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'İçerik onayına gönder' })).toBeDisabled();
  });

  it('5a müvekkil/sürüm değişince eski seçim ve geç gelen başarı yeni ekrana taşınmaz', async () => {
    let finish!: (value: unknown) => void;
    requestContentApproval.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const actions = { ...noActions, canRequestContentApproval: true };
    const view = renderPanel(actions);
    await screen.findByRole('option', { name: /client@example.test/ });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'client@example.test' } });
    fireEvent.submit(screen.getByRole('button', { name: 'İçerik onayına gönder' }).closest('form')!);
    await waitFor(() => expect(requestContentApproval).toHaveBeenCalledWith('version-scope', 'client@example.test'));
    getRecipientSelection.mockResolvedValue({ surface: 'OFFICE_RECIPIENT_SELECTION', options: [{ email: 'next@example.test', label: 'Yeni müvekkil' }], selectedRecipient: null });
    view.rerender(<QueryClientProvider client={view.queryClient}><DisclosureApprovalPanel clientId="next-client" versionId="next-version" actions={actions} /></QueryClientProvider>);
    await screen.findByRole('option', { name: /next@example.test/ });
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(view.container.textContent).not.toContain('client@example.test');
    finish({ status: 'CONTENT_APPROVAL_PENDING' });
    await waitFor(() => expect(screen.getByRole('combobox')).not.toBeDisabled());
    expect(screen.queryByText('İçerik ve alıcı onaya gönderildi.')).not.toBeInTheDocument();
    expect(requestContentApproval).toHaveBeenCalledTimes(1);
  });
});
