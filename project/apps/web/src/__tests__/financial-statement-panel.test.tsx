/**
 * ACCT-5B — FinancialStatementPanel (Muhasebe Defteri) testleri.
 *
 * Doğrulanan kontrat:
 *  - getClientCaseStatement caseId/clientId/caseClientId/currency + varsayılan dönem (from/to) ile çağrılır.
 *  - Dönem sınırları Türkiye takvimine göredir (O2): 1 Mayıs = 30 Nisan 21:00 UTC; "bugün" Türkiye günüdür;
 *    varsayılan başlangıç bitişin ötesine düşmez; geçersiz aralık sessizce başka aralığa çevrilmez.
 *  - Tarih değişince yeni from/to ile refetch.
 *  - opening/closing + hareket satırları render edilir; ham accountCode/direction sızmaz (Türkçe etiket).
 *  - Hareketsiz dönemde de açılış / kapanış yazılır (O2-a; açılış sunucuda dönem öncesinden devredilir, O1).
 *  - loading/error/empty state.
 *  - mutation tetikleyici YOK (yalnız getClientCaseStatement çağrılır).
 *  - "Müvekkil Ekstresi"nden ayrıştıran uyarı metni var.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    // Varsayılan "bugün" sabit: 2026-06-20 12:00 TSİ (= 09:00 UTC). Testler gün sınırlarını bu saatle ölçer.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-20T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caseId/clientId/caseClientId/currency + varsayılan dönem (takip tarihi→bugün; Türkiye gün sınırlarıyla) ile çağrılır', async () => {
    renderPanel();
    await waitFor(() => expect(getStatementMock).toHaveBeenCalledTimes(1));
    const params = getStatementMock.mock.calls[0][0];
    expect(params).toMatchObject({ caseId: 'case-1', clientId: 'client-1', caseClientId: 'cc-1', currency: 'TRY' });
    // caseOpenedAt 2026-01-10T00:00Z = 10 Ocak 03:00 TSİ → Türkiye günü 10 Ocak → 9 Ocak 21:00 UTC'de başlar.
    expect(params.from).toBe('2026-01-09T21:00:00.000Z');
    // Bugün 20 Haziran (TSİ) → gün 20 Haziran 20:59:59.999 UTC'de biter.
    expect(params.to).toBe('2026-06-20T20:59:59.999Z');
  });

  it('takip tarihi bilinmiyorsa dönem bugünle başlar (90 günlük geriye dönük sabit pencere yok)', async () => {
    renderPanel({ caseOpenedAt: null });
    await waitFor(() => expect(getStatementMock).toHaveBeenCalledTimes(1));
    const params = getStatementMock.mock.calls[0][0];
    expect(params.from).toBe('2026-06-19T21:00:00.000Z');
    expect(params.to).toBe('2026-06-20T20:59:59.999Z');
  });

  it('takip tarihi bugünden sonraysa varsayılan başlangıç bitişe çekilir; geçersiz dönem hatası görünmez, sorgu atılır', async () => {
    renderPanel({ caseOpenedAt: '2026-07-15T00:00:00.000Z' });
    await waitFor(() => expect(getStatementMock).toHaveBeenCalledTimes(1));
    const params = getStatementMock.mock.calls[0][0];
    expect(params.from).toBe('2026-06-19T21:00:00.000Z');
    expect(params.to).toBe('2026-06-20T20:59:59.999Z');
    expect(screen.queryByText('Başlangıç tarihi bitiş tarihinden sonra olamaz.')).toBeNull();
  });

  it('"bugün" Türkiye gününe göredir: TSİ 00:30 (UTC günü bir önceki gün) iken varsayılan bitiş yeni gündür', async () => {
    // 21 Haziran 00:30 TSİ = 20 Haziran 21:30 UTC. UTC günü kullanılsaydı bitiş 20 Haziran olurdu.
    vi.setSystemTime(new Date('2026-06-20T21:30:00.000Z'));
    renderPanel({ caseOpenedAt: '2026-06-20T21:10:00.000Z' }); // 21 Haziran 00:10 TSİ'de açılan dosya
    await waitFor(() => expect(getStatementMock).toHaveBeenCalledTimes(1));
    const params = getStatementMock.mock.calls[0][0];
    expect(params.from).toBe('2026-06-20T21:00:00.000Z'); // 21 Haziran 00:00 TSİ
    expect(params.to).toBe('2026-06-21T20:59:59.999Z'); // 21 Haziran 23:59:59.999 TSİ
    expect(screen.queryByText('Başlangıç tarihi bitiş tarihinden sonra olamaz.')).toBeNull();
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
      // 1 Şubat 00:00 TSİ = 31 Ocak 21:00 UTC.
      expect(last.from).toBe('2026-01-31T21:00:00.000Z');
    });
  });

  it('kullanıcının girdiği ters aralık sessizce başka aralığa çevrilmez: hata yazılır, sorgu atılmaz', async () => {
    const { container } = renderPanel();
    await waitFor(() => expect(getStatementMock).toHaveBeenCalledTimes(1));
    const dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-07-01' } }); // bitiş (20 Haziran) tarihinden SONRA
    expect(await screen.findByText('Başlangıç tarihi bitiş tarihinden sonra olamaz.')).toBeInTheDocument();
    expect(getStatementMock).toHaveBeenCalledTimes(1);
    // Girilen değerler olduğu gibi kalır (takas / sıkıştırma yok).
    expect((dateInputs[0] as HTMLInputElement).value).toBe('2026-07-01');
    expect((dateInputs[1] as HTMLInputElement).value).toBe('2026-06-20');
  });

  it('tarih alanı boşaltılırsa "tarihi seçin" der (sıralama hatası denmez) ve sorgu atılmaz', async () => {
    const { container } = renderPanel();
    await waitFor(() => expect(getStatementMock).toHaveBeenCalledTimes(1));
    const dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[1], { target: { value: '' } });
    expect(await screen.findByText('Başlangıç ve bitiş tarihini seçin.')).toBeInTheDocument();
    expect(screen.queryByText('Başlangıç tarihi bitiş tarihinden sonra olamaz.')).toBeNull();
    expect(getStatementMock).toHaveBeenCalledTimes(1);
  });

  it('empty (hareket yok) → boş-dönem mesajı', async () => {
    getStatementMock.mockResolvedValue({ ...SAMPLE, movements: [] });
    renderPanel();
    expect(await screen.findByText('Seçili dönemde defter hareketi bulunmuyor.')).toBeInTheDocument();
  });

  it('hareketsiz dönemde de açılış ve kapanış yazılır (dönem öncesinden devredilen bakiye)', async () => {
    getStatementMock.mockResolvedValue({
      ...SAMPLE,
      movements: [],
      opening: { amount: '1200.00', currency: 'TRY' },
      closing: { amount: '1200.00', currency: 'TRY' },
    });
    renderPanel();
    expect(await screen.findByText('Seçili dönemde defter hareketi bulunmuyor.')).toBeInTheDocument();
    const summary = screen.getByText(/Açılış:/).closest('div') as HTMLElement;
    expect(summary.textContent).toMatch(/Açılış:\s*₺1\.200,00/);
    expect(summary.textContent).toMatch(/Kapanış:\s*₺1\.200,00/);
    expect(screen.getByText('0 hareket')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('dönem öncesi hareket varken hareketli dönem açılışı sunucudan olduğu gibi gösterir; istemci bakiye HESAPLAMAZ', async () => {
    getStatementMock.mockResolvedValue({
      ...SAMPLE,
      opening: { amount: '1500.00', currency: 'TRY' },
      closing: { amount: '3000.00', currency: 'TRY' }, // sunucunun dediği; istemci açılış + hareketi yeniden hesaplamaz
    });
    renderPanel();
    await screen.findByText('1 hareket');
    const summary = screen.getByText(/Açılış:/).closest('div') as HTMLElement;
    expect(summary.textContent).toMatch(/Açılış:\s*₺1\.500,00/);
    expect(summary.textContent).toMatch(/Kapanış:\s*₺3\.000,00/);
  });

  it('hareket tarihi tarayıcı saat diliminden bağımsız olarak Türkiye gününde gösterilir', async () => {
    // 20 Haziran 21:30 UTC = 21 Haziran 00:30 TSİ → satırda 21.06.2026 yazar.
    getStatementMock.mockResolvedValue({
      ...SAMPLE,
      movements: [{ ...SAMPLE.movements[0], statementDate: '2026-06-20T21:30:00.000Z' }],
    });
    renderPanel();
    await screen.findByText('1 hareket');
    expect(within(screen.getByRole('table')).getByText('21.06.2026')).toBeInTheDocument();
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
