/**
 * ACCT-5B — FinancialStatementPanel (Muhasebe Defteri) testleri.
 *
 * Doğrulanan kontrat:
 *  - getClientCaseStatement caseId/clientId/caseClientId/currency + varsayılan dönem (from/to) ile çağrılır.
 *  - Tarih değişince yeni from/to ile refetch.
 *  - opening/closing + hareket satırları render edilir; ham accountCode/direction sızmaz (Türkçe etiket).
 *  - loading/error/empty state.
 *  - mutation tetikleyici YOK (yalnız getClientCaseStatement çağrılır).
 *  - "Müvekkil Ekstresi"nden ayrıştıran uyarı metni var.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialStatementPanel } from '@/components/client-accounting/FinancialStatementPanel';
import { financialStatementApi, type FinancialStatementReadReport } from '@/lib/api/financial-statement';

vi.mock('@/lib/api/financial-statement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/financial-statement')>();
  return {
    ...actual,
    financialStatementApi: { ...actual.financialStatementApi, getClientCaseStatement: vi.fn() },
  };
});

const getStatementMock = financialStatementApi.getClientCaseStatement as unknown as ReturnType<typeof vi.fn>;

const SAMPLE: FinancialStatementReadReport = {
  tenantId: 't1',
  statementType: 'CLIENT_CASE_STATEMENT',
  surface: 'FINANCIAL_STATEMENT',
  sourceBasis: 'JOURNAL_DERIVED_PROJECTION',
  period: { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z', dateBasis: 'postedAt' },
  currency: 'TRY',
  scope: { caseId: 'case-1', clientId: 'client-1', caseClientId: 'cc-1' },
  opening: { amount: '0.00', currency: 'TRY' },
  movements: [
    {
      lineNo: 1,
      statementDate: '2026-06-15T10:30:00.000Z',
      accountCode: 'CLIENT_PAYABLE',
      direction: 'CREDIT',
      amount: '1500.00',
      currency: 'TRY',
      caseId: 'case-1',
      clientId: 'client-1',
      caseClientId: 'cc-1',
      source: { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted', displayRef: 'COLLECTION_DISPOSITION_LINE:posted' },
      note: null,
    },
  ],
  closing: { amount: '1500.00', currency: 'TRY' },
  reconciliation: {
    status: 'READY',
    trialBalanceEvidenceStatus: 'BALANCED',
    legalLedgerComparisonStatus: 'PENDING',
    warnings: [{ code: 'LEGAL_LEDGER_COMPARISON_NOT_AUTHORITATIVE', message: 'Legal ledger comparison is reconciliation evidence, not a legal authority switch.' }],
  },
};

function renderPanel(props: Partial<Parameters<typeof FinancialStatementPanel>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FinancialStatementPanel
        caseId="case-1"
        clientId="client-1"
        caseClientId="cc-1"
        currency="TRY"
        caseOpenedAt="2026-01-10T00:00:00.000Z"
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('FinancialStatementPanel (ACCT-5B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStatementMock.mockResolvedValue(SAMPLE);
  });

  it('caseId/clientId/caseClientId/currency + varsayılan dönem (caseOpenedAt→bugün) ile çağrılır', async () => {
    renderPanel();
    await waitFor(() => expect(getStatementMock).toHaveBeenCalledTimes(1));
    const params = getStatementMock.mock.calls[0][0];
    expect(params).toMatchObject({ caseId: 'case-1', clientId: 'client-1', caseClientId: 'cc-1', currency: 'TRY' });
    expect(params.from).toBe('2026-01-10T00:00:00.000Z');
    expect(params.to).toMatch(/T23:59:59\.999Z$/);
  });

  it('caseOpenedAt yoksa 90 gün geriye varsayılan dönem başlar', async () => {
    renderPanel({ caseOpenedAt: null });
    await waitFor(() => expect(getStatementMock).toHaveBeenCalledTimes(1));
    const params = getStatementMock.mock.calls[0][0];
    expect(params.from).not.toBe('2026-01-10T00:00:00.000Z');
    expect(params.from).toMatch(/T00:00:00\.000Z$/);
  });

  it('açılış/kapanış + hareket satırını render eder; ham accountCode/direction sızmaz', async () => {
    renderPanel();
    await screen.findByText('1 hareket');
    expect(screen.getByText('Müvekkile Borç')).toBeInTheDocument(); // CLIENT_PAYABLE → Türkçe etiket
    expect(screen.getByText('Alacak')).toBeInTheDocument(); // CREDIT → Türkçe
    expect(screen.queryByText('CLIENT_PAYABLE')).toBeNull();
    expect(screen.queryByText('CREDIT')).toBeNull();
    const table = screen.getByRole('table');
    expect(within(table).getByText('COLLECTION_DISPOSITION_LINE:posted')).toBeInTheDocument();
  });

  it('"Müvekkil Ekstresi"nden ayrıştıran uyarı metni gösterilir', async () => {
    renderPanel();
    expect(screen.getByText(/Müvekkil Ekstresi/)).toBeInTheDocument();
    expect(screen.getByText(/\(snapshot\) ALMAZ/)).toBeInTheDocument();
  });

  it('tarih değişince yeni from/to ile refetch edilir', async () => {
    const { container } = renderPanel();
    await waitFor(() => expect(getStatementMock).toHaveBeenCalledTimes(1));
    const dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-02-01' } });
    await waitFor(() => {
      const last = getStatementMock.mock.calls.at(-1)![0];
      expect(last.from).toBe('2026-02-01T00:00:00.000Z');
    });
  });

  it('empty (hareket yok) → boş-dönem mesajı', async () => {
    getStatementMock.mockResolvedValue({ ...SAMPLE, movements: [] });
    renderPanel();
    expect(await screen.findByText('Seçili dönemde defter hareketi bulunmuyor.')).toBeInTheDocument();
  });

  it('error state → "yüklenemedi"', async () => {
    getStatementMock.mockRejectedValue(new Error('boom'));
    renderPanel();
    expect(await screen.findByText('Muhasebe defteri yüklenemedi.')).toBeInTheDocument();
  });

  it('mutation tetikleyici YOK (yalnız getClientCaseStatement çağrılır; create/approve/onayla butonu yok)', async () => {
    renderPanel();
    await waitFor(() => expect(getStatementMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Oluştur|Onayla|Yenile|Kaydet/ })).toBeNull();
  });
});
