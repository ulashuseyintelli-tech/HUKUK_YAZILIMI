/**
 * Müvekkile ödeme kesinleştirilince "Muhasebe Defteri" paneli de yenilenir.
 *
 * Neden var: panel (FinancialStatementPanel) ödemeyi günlükten okur; kesinleştirme yeni bir günlük satırı yazar.
 * Kesinleştirme başarısında panelin sorgusu geçersiz kılınmazsa aynı ekranda "Müvekkile Borç (Net)" güncel,
 * panel kapanışı ise eski değerde kalır (gerçek tarayıcıda ölçüldü, 2026-10-01: ₺1.100,00 ↔ ₺1.200,00; sayfa
 * yenilenince düzeliyordu).
 *
 * Yöntem: iki bileşen sayfadaki gibi AYNI QueryClient altında birlikte render edilir (sayfa sorgu ayarlarıyla:
 * staleTime 60 sn). Sorgu anahtarı testte yeniden YAZILMAZ — panelin kendi sorgusunun ikinci kez çalıştığı ölçülür;
 * böylece anahtar bir tarafta değişirse test düşer.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialStatementPanel } from '@/components/client-accounting/FinancialStatementPanel';
import { PendingPayoutRequests } from '@/components/client-accounting/PendingPayoutRequests';
import { clientAccountingApi } from '@/lib/api/client-accounting';
import { financialStatementApi, type FinancialStatementReadReport } from '@/lib/api/financial-statement';
import { officeApprovalApi } from '@/lib/api/office-approval';

vi.mock('@/lib/api/financial-statement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/financial-statement')>();
  return {
    ...actual,
    financialStatementApi: { ...actual.financialStatementApi, getClientCaseStatement: vi.fn() },
  };
});

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

const getStatementMock = financialStatementApi.getClientCaseStatement as unknown as ReturnType<typeof vi.fn>;
const getMineMock = officeApprovalApi.getMine as unknown as ReturnType<typeof vi.fn>;
const getDetailMock = officeApprovalApi.getDetail as unknown as ReturnType<typeof vi.fn>;
const finalizePayoutMock = clientAccountingApi.finalizePayout as unknown as ReturnType<typeof vi.fn>;

const movement = (lineNo: number, direction: 'CREDIT' | 'DEBIT', amount: string, sourceType: string, sourceAction: string) => ({
  lineNo,
  statementDate: '2026-06-15T10:30:00.000Z',
  accountCode: 'CLIENT_PAYABLE',
  direction,
  amount,
  currency: 'TRY',
  caseId: 'case-1',
  clientId: 'client-1',
  caseClientId: 'cc-1',
  source: { sourceType, sourceAction, displayRef: `${sourceType}:${sourceAction}` },
  note: null,
});

const report = (movements: ReturnType<typeof movement>[], closing: string): FinancialStatementReadReport => ({
  tenantId: 't1',
  statementType: 'CLIENT_CASE_STATEMENT',
  surface: 'FINANCIAL_STATEMENT',
  sourceBasis: 'JOURNAL_DERIVED_PROJECTION',
  period: { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z', dateBasis: 'postedAt' },
  currency: 'TRY',
  scope: { caseId: 'case-1', clientId: 'client-1', caseClientId: 'cc-1' },
  opening: { amount: '0.00', currency: 'TRY' },
  movements,
  closing: { amount: closing, currency: 'TRY' },
  reconciliation: { status: 'READY', trialBalanceEvidenceStatus: 'BALANCED', legalLedgerComparisonStatus: 'PENDING', warnings: [] },
});

const BEFORE = report([movement(1, 'CREDIT', '1500.00', 'COLLECTION_DISPOSITION_LINE', 'posted')], '1500.00');
const AFTER = report(
  [
    movement(1, 'CREDIT', '1500.00', 'COLLECTION_DISPOSITION_LINE', 'posted'),
    movement(2, 'DEBIT', '300.00', 'CLIENT_PAYOUT', 'recorded'),
  ],
  '1200.00',
);

const approval = {
  id: 'oar-1',
  actionCode: 'CLIENT_PAYOUT_POST',
  targetType: 'CLIENT_PAYOUT_REQUEST',
  targetRef: 'k1',
  status: 'APPROVED',
  executionStatus: 'NOT_RUN',
  requesterUserId: 'u1',
  approverUserId: 'u1',
  hasReplacement: false,
  reason: null,
  createdAt: '2026-07-04T00:00:00.000Z',
  decidedAt: '2026-07-04T01:00:00.000Z',
  expiresAt: null,
};
const approvalDetail = {
  ...approval,
  savedIntent: { caseId: 'case-1', caseClientId: 'cc-1', amount: '300', currency: 'TRY', note: null, idempotencyKey: 'k1' },
  payloadHash: 'hash1',
  replacementSavedIntent: null,
  replacementPayloadHash: null,
  decisionNote: null,
  executedAt: null,
};

function renderBoth() {
  // Sayfanın sorgu ayarları (app/providers.tsx): veri 60 sn taze sayılır, odak değişiminde yeniden çekilmez.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60 * 1000, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <PendingPayoutRequests caseId="case-1" caseClientId="cc-1" />
      <FinancialStatementPanel caseId="case-1" clientId="client-1" caseClientId="cc-1" currency="TRY" caseOpenedAt="2026-01-10T00:00:00.000Z" />
    </QueryClientProvider>,
  );
}

describe('ödeme kesinleştirme → Muhasebe Defteri paneli', () => {
  // Hermetiklik: üç API modülü mock'lu; yine de gerçek ağ çağrısı (taban adres localhost:8080) çıkarsa asılı kalır ve sayılır.
  const fetchStub = vi.fn(() => new Promise<Response>(() => {}));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchStub);
    getMineMock.mockResolvedValue([approval]);
    getDetailMock.mockResolvedValue(approvalDetail);
  });

  afterEach(() => {
    expect(fetchStub).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('kesinleştirme başarılı olunca panel yeniden okunur ve ödeme satırı ile yeni kapanış görünür', async () => {
    getStatementMock.mockResolvedValueOnce(BEFORE).mockResolvedValue(AFTER);
    finalizePayoutMock.mockResolvedValue({ created: true, payoutId: 'p1' });

    renderBoth();
    await screen.findByText('1 hareket');
    expect(screen.getByText('Kapanış:').textContent).toContain('1.500,00');
    expect(getStatementMock).toHaveBeenCalledTimes(1);

    fireEvent.click(await screen.findByRole('button', { name: /Kesinleştir/ }));

    await waitFor(() => expect(finalizePayoutMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getStatementMock).toHaveBeenCalledTimes(2));
    await screen.findByText('2 hareket');
    expect(screen.getByText('Kapanış:').textContent).toContain('1.200,00');
    expect(screen.getByText('CLIENT_PAYOUT:recorded')).toBeInTheDocument();
  });

  it('kesinleştirme başarısız olursa panel yeniden okunmaz', async () => {
    getStatementMock.mockResolvedValue(BEFORE);
    finalizePayoutMock.mockRejectedValue(new Error("payout (300) outstanding'i (0) aşamaz"));

    renderBoth();
    await screen.findByText('1 hareket');

    fireEvent.click(await screen.findByRole('button', { name: /Kesinleştir/ }));

    expect(await screen.findByText(/müvekkile borcunu \(net\) aşıyor/)).toBeInTheDocument();
    expect(getStatementMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1 hareket')).toBeInTheDocument();
  });
});
