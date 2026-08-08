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

vi.mock('@/lib/api/client-financial-disclosure', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client-financial-disclosure')>();
  return {
    ...original,
    clientFinancialDisclosureApi: {
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
  canPublish: false,
  canRetryPublication: false,
  canReverse: false,
  canSupersede: false,
};

function renderPanel(actions: OfficeDisclosureActionCapabilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DisclosureApprovalPanel
        clientId="client-scope"
        versionId="version-scope"
        actions={actions}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requestOfficeApproval.mockResolvedValue({ status: 'OFFICE_APPROVAL_PENDING' });
  completeOfficeApproval.mockResolvedValue({ status: 'OFFICE_APPROVED' });
  requestContentApproval.mockResolvedValue({ status: 'CONTENT_APPROVAL_PENDING' });
  completeContentApproval.mockResolvedValue({ status: 'CONTENT_APPROVED' });
  publish.mockResolvedValue({ status: 'PUBLISHED' });
});

describe('DisclosureApprovalPanel X1-B04', () => {
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
    const first = renderPanel({ ...noActions, canCompleteContentApproval: true });
    fireEvent.click(screen.getByRole('button', { name: 'İçerik onayını tamamla' }));
    await waitFor(() => expect(completeContentApproval).toHaveBeenCalledWith('version-scope'));
    first.unmount();

    renderPanel({ ...noActions, canPublish: true });
    fireEvent.click(screen.getByRole('button', { name: 'Yayınla ve gönder' }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith('version-scope'));
  });

  it('backend/provider hata ayrıntısını ekrana taşımadan generic fail-closed mesaj gösterir', async () => {
    publish.mockRejectedValue(new Error('providerMessageId=secret raw SMTP failure'));
    const view = renderPanel({ ...noActions, canPublish: true });
    fireEvent.click(screen.getByRole('button', { name: 'Yayınla ve gönder' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Yayın ve teslim işlemi tamamlanamadı.',
    );
    expect(view.container.textContent).not.toContain('providerMessageId');
    expect(view.container.textContent).not.toContain('SMTP');
  });
});
