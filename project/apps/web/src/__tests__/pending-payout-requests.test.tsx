/**
 * PAYOUT-APPROVAL-2 PR-2b — PendingPayoutRequests: Approval Inbox'ın generic olduğu (actionCode-özel
 * "sonraki aksiyon" YOK) boşluğu talep sahibi tarafında kapatan widget.
 *
 * Doğrulanan kontrat:
 *  - getMine() sonucu actionCode!=='CLIENT_PAYOUT_POST' olanlar HARİÇ tutulur.
 *  - savedIntent.caseId/caseClientId bu widget'ın prop'larıyla EŞLEŞMEYENLER gösterilmez (başka dosya).
 *  - status==='PENDING_APPROVAL' olan satırlarda "Onayla" butonu görünür.
 *  - Yalnız status==='APPROVED' olan satırlarda "Kesinleştir" butonu görünür.
 *  - "Onayla" tıklanınca officeApprovalApi.approve(id) çağrılır; başarı sonrası approval query'leri yenilenir.
 *  - "Kesinleştir" tıklanınca finalizePayout(id, savedIntent-türevi payload) çağrılır; başarı sonrası
 *    ilgili query'ler invalidate edilir.
 *  - Liste boşsa (veya hiçbiri bu case/caseClient'a ait değilse) widget HİÇBİR ŞEY render ETMEZ.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingPayoutRequests } from '@/components/client-accounting/PendingPayoutRequests';
import { officeApprovalApi } from '@/lib/api/office-approval';
import { clientAccountingApi } from '@/lib/api/client-accounting';

vi.mock('@/lib/api/office-approval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/office-approval')>();
  return {
    ...actual,
    officeApprovalApi: { ...actual.officeApprovalApi, getMine: vi.fn(), getDetail: vi.fn(), approve: vi.fn() },
  };
});

vi.mock('@/lib/api/client-accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-accounting')>();
  return {
    ...actual,
    clientAccountingApi: { ...actual.clientAccountingApi, finalizePayout: vi.fn() },
  };
});

const getMineMock = officeApprovalApi.getMine as unknown as ReturnType<typeof vi.fn>;
const getDetailMock = officeApprovalApi.getDetail as unknown as ReturnType<typeof vi.fn>;
const approveMock = officeApprovalApi.approve as unknown as ReturnType<typeof vi.fn>;
const finalizePayoutMock = clientAccountingApi.finalizePayout as unknown as ReturnType<typeof vi.fn>;

const summaryRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'oar-1',
  actionCode: 'CLIENT_PAYOUT_POST',
  targetType: 'CLIENT_PAYOUT_REQUEST',
  targetRef: 'k1',
  status: 'APPROVED',
  executionStatus: 'NOT_RUN',
  requesterUserId: 'u1',
  approverUserId: 'u2',
  hasReplacement: false,
  reason: null,
  createdAt: '2026-07-04T00:00:00.000Z',
  decidedAt: '2026-07-04T01:00:00.000Z',
  expiresAt: null,
  ...over,
});

const detailRow = (over: Partial<Record<string, unknown>> = {}) => ({
  ...summaryRow(),
  savedIntent: { caseId: 'case-1', caseClientId: 'cc-1', amount: '400', currency: 'TRY', note: null, idempotencyKey: 'k1' },
  payloadHash: 'hash1',
  replacementSavedIntent: null,
  replacementPayloadHash: null,
  decisionNote: null,
  executedAt: null,
  ...over,
});

function renderWidget(props?: { caseId?: string; caseClientId?: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PendingPayoutRequests caseId={props?.caseId ?? 'case-1'} caseClientId={props?.caseClientId ?? 'cc-1'} />
    </QueryClientProvider>,
  );
}

describe('PendingPayoutRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mine listesi boşsa hiçbir şey render etmez', async () => {
    getMineMock.mockResolvedValue([]);
    const { container } = renderWidget();
    await waitFor(() => expect(getMineMock).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('actionCode CLIENT_PAYOUT_POST olmayanlar HARİÇ tutulur (detay bile çekilmez)', async () => {
    getMineMock.mockResolvedValue([summaryRow({ id: 'oar-x', actionCode: 'COLLECTION_DISPOSITION_POST' })]);
    const { container } = renderWidget();
    await waitFor(() => expect(getMineMock).toHaveBeenCalled());
    expect(getDetailMock).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('savedIntent başka bir case/caseClient\'a aitse gösterilmez (scope filtresi)', async () => {
    getMineMock.mockResolvedValue([summaryRow()]);
    getDetailMock.mockResolvedValue(detailRow({ savedIntent: { caseId: 'OTHER-CASE', caseClientId: 'cc-1', amount: '400', currency: 'TRY', note: null, idempotencyKey: 'k1' } }));
    const { container } = renderWidget();
    await waitFor(() => expect(getDetailMock).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('APPROVED talep için "Kesinleştir" butonu görünür, tıklanınca finalizePayout doğru payload ile çağrılır', async () => {
    getMineMock.mockResolvedValue([summaryRow({ status: 'APPROVED' })]);
    getDetailMock.mockResolvedValue(detailRow({ status: 'APPROVED' }));
    finalizePayoutMock.mockResolvedValue({ created: true, payoutId: 'p1' });

    renderWidget();
    await waitFor(() => expect(screen.getByText(/Kesinleştir/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Kesinleştir/ }));

    await waitFor(() =>
      expect(finalizePayoutMock).toHaveBeenCalledWith('oar-1', {
        caseId: 'case-1',
        caseClientId: 'cc-1',
        amount: '400',
        currency: 'TRY',
        note: undefined,
        idempotencyKey: 'k1',
      }),
    );
  });

  it('PENDING_APPROVAL talep listede görünür ama "Kesinleştir" butonu YOK', async () => {
    getMineMock.mockResolvedValue([summaryRow({ status: 'PENDING_APPROVAL' })]);
    getDetailMock.mockResolvedValue(detailRow({ status: 'PENDING_APPROVAL' }));

    renderWidget();
    await waitFor(() => expect(screen.getByText('Onay Bekliyor')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Kesinleştir/ })).toBeNull();
  });

  it('PENDING_APPROVAL kendi payout talebi icin "Onayla" butonu görünür, tıklanınca approval approve çağrılır', async () => {
    getMineMock.mockResolvedValue([summaryRow({ status: 'PENDING_APPROVAL' })]);
    getDetailMock.mockResolvedValue(detailRow({ status: 'PENDING_APPROVAL' }));
    approveMock.mockResolvedValue(detailRow({ status: 'APPROVED' }));

    renderWidget();
    await waitFor(() => expect(screen.getByRole('button', { name: /Onayla/ })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Onayla/ }));

    await waitFor(() => expect(approveMock).toHaveBeenCalledWith('oar-1'));
    expect(finalizePayoutMock).not.toHaveBeenCalled();
  });

  it('finalize başarısız olursa hata mesajı gösterilir (backend mesajı iletilir)', async () => {
    getMineMock.mockResolvedValue([summaryRow({ status: 'APPROVED' })]);
    getDetailMock.mockResolvedValue(detailRow({ status: 'APPROVED' }));
    finalizePayoutMock.mockRejectedValue(new Error('payout (400) outstanding\'i (0) aşamaz'));

    renderWidget();
    await waitFor(() => expect(screen.getByRole('button', { name: /Kesinleştir/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Kesinleştir/ }));

    await waitFor(() => expect(screen.getByText(/müvekkile borcunu \(net\) aşıyor/)).toBeTruthy());
  });
});
