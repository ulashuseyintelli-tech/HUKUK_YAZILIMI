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
 *  - KESİNLEŞMİŞ talep (status==='APPROVED' + executionStatus==='SUCCEEDED') listelenmez ve detayı çekilmez;
 *    "Kesinleştir" başarılı olunca talep karttan düşer. Yürütme işareti SUCCEEDED OLMAYAN onaylı talep
 *    (NOT_RUN / RUNNING / FAILED / STALE) düğmesiyle kalır. Kapanmış talepler (reddedildi / iptal / revizyon /
 *    değişiklikle onaylandı) bu kuraldan ETKİLENMEZ: düğmesiz listelenmeye devam eder.
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
    officeApprovalApi: { ...actual.officeApprovalApi, getMine: vi.fn(), getDetail: vi.fn(), approve: vi.fn(), cancel: vi.fn() },
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
const cancelMock = officeApprovalApi.cancel as unknown as ReturnType<typeof vi.fn>;
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

/**
 * Kesinleşmiş talep kartta kalmaz. Kesinleştirme talebin karar durumunu DEĞİŞTİRMEZ (APPROVED kalır); yalnız
 * yürütme işaretini SUCCEEDED yapar. Kart bu işarete bakmadığı için ödemesi kaydedilmiş talep "Onaylandı ·
 * [Kesinleştir]" olarak kalıyordu (gerçek tarayıcıda ölçüldü; ikinci tıklama backend'de idempotentReplay).
 */
describe('PendingPayoutRequests — kesinleşmiş talep (yürütme işareti SUCCEEDED)', () => {
  const intent = (amount: string, idempotencyKey: string) => ({
    caseId: 'case-1',
    caseClientId: 'cc-1',
    amount,
    currency: 'TRY',
    note: null,
    idempotencyKey,
  });

  beforeEach(() => {
    getMineMock.mockReset();
    getDetailMock.mockReset();
    approveMock.mockReset();
    finalizePayoutMock.mockReset();
  });

  it('kesinleşmiş talep listelenmez ve detayı çekilmez (kart görünmez)', async () => {
    getMineMock.mockResolvedValue([summaryRow({ status: 'APPROVED', executionStatus: 'SUCCEEDED' })]);
    getDetailMock.mockResolvedValue(detailRow({ status: 'APPROVED', executionStatus: 'SUCCEEDED' }));

    const { container } = renderWidget();
    await waitFor(() => expect(getMineMock).toHaveBeenCalled());
    // Detay isteği atılacak olsaydı bu noktada atılmış olurdu (aynı beklemeyi kontrol testi de kullanır).
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getDetailMock).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('kesinleşmiş + kesinleştirme bekleyen birlikte: yalnız bekleyen satır görünür, başlık sayısı 1', async () => {
    getMineMock.mockResolvedValue([
      summaryRow({ id: 'oar-done', targetRef: 'k-done', status: 'APPROVED', executionStatus: 'SUCCEEDED' }),
      summaryRow({ id: 'oar-open', targetRef: 'k-open', status: 'APPROVED', executionStatus: 'NOT_RUN' }),
    ]);
    getDetailMock.mockImplementation(async (id: string) =>
      id === 'oar-open'
        ? detailRow({ id: 'oar-open', targetRef: 'k-open', savedIntent: intent('600', 'k-open') })
        : detailRow({ id: 'oar-done', targetRef: 'k-done', executionStatus: 'SUCCEEDED', savedIntent: intent('700', 'k-done') }),
    );

    renderWidget();
    await waitFor(() => expect(screen.getByText(/600,00/)).toBeTruthy());

    expect(screen.queryByText(/700,00/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /Kesinleştir/ })).toHaveLength(1);
    expect(screen.getByText('1')).toBeTruthy(); // başlık sayısı yalnız listelenen talepleri sayar
    expect(getDetailMock).toHaveBeenCalledTimes(1);
    expect(getDetailMock).toHaveBeenCalledWith('oar-open');
  });

  it('özet listesi bayatken (NOT_RUN) detay SUCCEEDED dönerse satır gösterilmez', async () => {
    getMineMock.mockResolvedValue([summaryRow({ status: 'APPROVED', executionStatus: 'NOT_RUN' })]);
    getDetailMock.mockResolvedValue(
      detailRow({ status: 'APPROVED', executionStatus: 'SUCCEEDED', executedAt: '2026-07-04T02:00:00.000Z' }),
    );

    const { container } = renderWidget();
    await waitFor(() => expect(getDetailMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByRole('button', { name: /Kesinleştir/ })).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('"Kesinleştir" başarılı olunca talep karttan düşer (yenilenen liste SUCCEEDED döner)', async () => {
    let finalized = false;
    getMineMock.mockImplementation(async () => [
      summaryRow({ status: 'APPROVED', executionStatus: finalized ? 'SUCCEEDED' : 'NOT_RUN' }),
    ]);
    getDetailMock.mockImplementation(async () =>
      detailRow({ status: 'APPROVED', executionStatus: finalized ? 'SUCCEEDED' : 'NOT_RUN' }),
    );
    finalizePayoutMock.mockImplementation(async () => {
      finalized = true;
      return { created: true, payoutId: 'p1' };
    });

    const { container } = renderWidget();
    await waitFor(() => expect(screen.getByRole('button', { name: /Kesinleştir/ })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Kesinleştir/ }));

    await waitFor(() => expect(finalizePayoutMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it.each(['NOT_RUN', 'RUNNING', 'FAILED', 'STALE'])(
    'yürütme işareti %s olan onaylı talep düğmesiyle kalır (yalnız SUCCEEDED düşer)',
    async (executionStatus) => {
      getMineMock.mockResolvedValue([summaryRow({ status: 'APPROVED', executionStatus })]);
      getDetailMock.mockResolvedValue(detailRow({ status: 'APPROVED', executionStatus }));

      renderWidget();
      await waitFor(() => expect(screen.getByRole('button', { name: /Kesinleştir/ })).toBeTruthy());
      expect(screen.getByText('Onaylandı')).toBeTruthy();
    },
  );

  it.each([
    ['REJECTED', 'Reddedildi'],
    ['CANCELLED', 'İptal Edildi'],
    ['REVISION_REQUESTED', 'Revizyon İstendi'],
    ['APPROVED_WITH_CHANGES', 'Değişiklikle Onaylandı'],
  ])('kapanmış talep (%s) düğmesiz listelenmeye devam eder', async (status, label) => {
    getMineMock.mockResolvedValue([summaryRow({ status, executionStatus: 'NOT_RUN' })]);
    getDetailMock.mockResolvedValue(detailRow({ status, executionStatus: 'NOT_RUN' }));

    renderWidget();
    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('kural APPROVED + SUCCEEDED birlikte: karar APPROVED değilse SUCCEEDED işareti satırı düşürmez', async () => {
    // Ödeme akışında üretilmeyen bir birleşim (finalize yalnız APPROVED talebi kabul eder); kuralın sınırını sabitler.
    getMineMock.mockResolvedValue([summaryRow({ status: 'APPROVED_WITH_CHANGES', executionStatus: 'SUCCEEDED' })]);
    getDetailMock.mockResolvedValue(detailRow({ status: 'APPROVED_WITH_CHANGES', executionStatus: 'SUCCEEDED' }));

    renderWidget();
    await waitFor(() => expect(screen.getByText('Değişiklikle Onaylandı')).toBeTruthy());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('iki bekleyen talepten biri kesinleşince diğeri ekranda kalır (kart bir an bile kaybolmaz)', async () => {
    let finalized = false;
    getMineMock.mockImplementation(async () => [
      summaryRow({ id: 'oar-a', targetRef: 'k-a', status: 'APPROVED', executionStatus: finalized ? 'SUCCEEDED' : 'NOT_RUN' }),
      summaryRow({ id: 'oar-b', targetRef: 'k-b', status: 'APPROVED', executionStatus: 'NOT_RUN' }),
    ]);
    // Kesinleştirmeden SONRAKİ detay yanıtları elle serbest bırakılır: liste yenilenmiş, yeni detay henüz gelmemişken
    // ekranın ne gösterdiği ölçülür.
    const pending: Array<() => void> = [];
    getDetailMock.mockImplementation((id: string) => {
      const row =
        id === 'oar-a'
          ? detailRow({ id: 'oar-a', targetRef: 'k-a', executionStatus: finalized ? 'SUCCEEDED' : 'NOT_RUN', savedIntent: intent('700', 'k-a') })
          : detailRow({ id: 'oar-b', targetRef: 'k-b', savedIntent: intent('600', 'k-b') });
      if (!finalized) return Promise.resolve(row);
      return new Promise((resolve) => pending.push(() => resolve(row)));
    });
    finalizePayoutMock.mockImplementation(async () => {
      finalized = true;
      return { created: true, payoutId: 'p-a' };
    });

    renderWidget();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Kesinleştir/ })).toHaveLength(2));
    const rowA = screen.getByText(/700,00/).closest('div.border') as HTMLElement;
    fireEvent.click(rowA.querySelector('button') as HTMLButtonElement);

    // Liste yenilendi (iki çağrı: ilk yükleme + kesinleştirme sonrası); detay yanıtları hâlâ bekliyor.
    await waitFor(() => expect(getMineMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByText(/700,00/)).toBeNull());
    expect(screen.getByText(/600,00/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Kesinleştir/ })).toHaveLength(1);

    // Bekleyen detay yanıtları geldikten sonra da aynı.
    pending.splice(0).forEach((release) => release());
    await new Promise((resolve) => setTimeout(resolve, 50));
    pending.splice(0).forEach((release) => release());
    await waitFor(() => expect(screen.getByText(/600,00/)).toBeTruthy());
    expect(screen.queryByText(/700,00/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /Kesinleştir/ })).toHaveLength(1);
  });

  // Satır 8 (owner kararı 7): talep sahibi kendi BEKLEYEN talebini kartta geri çekebilir. Kural sunucudadır
  // (yalnız talep sahibi, yalnız PENDING_APPROVAL); görünürlük yetkinin yerine geçmez.
  describe('Geri Çek (kendi bekleyen talep)', () => {
    const pendingDetail = (over: Partial<Record<string, unknown>> = {}) => detailRow({ status: 'PENDING_APPROVAL', approverUserId: null, decidedAt: null, ...over });

    it('yalnız PENDING_APPROVAL satırında görünür; onaylı satırda YOK', async () => {
      getMineMock.mockResolvedValue([summaryRow({ id: 'oar-p', status: 'PENDING_APPROVAL' }), summaryRow({ id: 'oar-a', status: 'APPROVED' })]);
      getDetailMock.mockImplementation(async (id: string) =>
        id === 'oar-p' ? pendingDetail({ id: 'oar-p' }) : detailRow({ id: 'oar-a', savedIntent: { caseId: 'case-1', caseClientId: 'cc-1', amount: '700', currency: 'TRY', note: null, idempotencyKey: 'k2' } }),
      );
      renderWidget();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Kesinleştir' })).toBeTruthy());
      expect(screen.getAllByRole('button', { name: 'Geri Çek' })).toHaveLength(1);
      const approvedRow = screen.getByText(/700,00/).closest('div.border') as HTMLElement;
      expect(approvedRow.textContent).not.toContain('Geri Çek');
    });

    it('tıklayınca officeApprovalApi.cancel(id) çağrılır ve talep listeleri yenilenir', async () => {
      getMineMock.mockResolvedValue([summaryRow({ id: 'oar-p', status: 'PENDING_APPROVAL' })]);
      getDetailMock.mockResolvedValue(pendingDetail({ id: 'oar-p' }));
      cancelMock.mockResolvedValue({ ...pendingDetail({ id: 'oar-p' }), status: 'CANCELLED' });
      renderWidget();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Geri Çek' })).toBeTruthy());
      const before = getMineMock.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Geri Çek' }));
      await waitFor(() => expect(cancelMock).toHaveBeenCalledWith('oar-p'));
      await waitFor(() => expect(getMineMock.mock.calls.length).toBeGreaterThan(before));
      expect(approveMock).not.toHaveBeenCalled();
      expect(finalizePayoutMock).not.toHaveBeenCalled();
    });

    it('sunucu reddederse mesaj aynen gösterilir; talep satırı kalır', async () => {
      getMineMock.mockResolvedValue([summaryRow({ id: 'oar-p', status: 'PENDING_APPROVAL' })]);
      getDetailMock.mockResolvedValue(pendingDetail({ id: 'oar-p' }));
      cancelMock.mockRejectedValue(new Error('Yalnız talep sahibi geri çekebilir.'));
      renderWidget();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Geri Çek' })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Geri Çek' }));
      await waitFor(() => expect(screen.getByText('Yalnız talep sahibi geri çekebilir.')).toBeTruthy());
      expect(screen.getByRole('button', { name: 'Geri Çek' })).toBeTruthy();
    });
  });
});
