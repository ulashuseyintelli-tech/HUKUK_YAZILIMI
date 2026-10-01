/**
 * Müvekkil Muhasebesi sayfası — para birimi (dosya kapsamı).
 *
 * Ölçülen kusur (2026-10-01): `cases` ucu dövizli dosyada `currency: "TRY"` döndürüyordu; sayfa ödenecek tutarı TRY ile
 * istiyor ("Müvekkile Borç (Net) ₺0,00"; sunucuda 700 USD), tahsilatı "₺" ile yazıyor, ödeme talebi oluşturulamıyordu.
 *
 * Sözleşme:
 *  - Proceeds / payout / borçlu tahsilatı / muhasebe defteri: dosyanın kayıtlı para birimiyle (backend `cases`) istenir ve yazılır.
 *  - Masraf kartları: TL (ExpenseRequest TRY; dosya para birimiyle BİÇİMLENMEZ — dövizli dosyada "$250,00" yazılmaz).
 *  - Masraf/Avans Bakiyesi: sunucunun bakiyeyle birlikte verdiği para birimi.
 *  - Ekstre satırları: ekstrenin kendi para birimi (dosya para birimi değil).
 *  - TL dosyada hiçbir metin değişmez.
 * UI hesap yapmaz: tutar çevrilmez, farklı para birimleri toplanmaz.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ search: 'caseId=caseU' }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ clientId: 'c1' }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/clients/c1/accounting',
}));

vi.mock('@/lib/api/client-accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-accounting')>();
  return {
    ...actual,
    clientAccountingApi: {
      getCases: vi.fn(),
      getOutstanding: vi.fn(),
      listPayouts: vi.fn(),
      requestPayout: vi.fn(),
      finalizePayout: vi.fn(),
      getClientSummary: vi.fn(),
      getMovements: vi.fn(),
      getExpenseSummary: vi.fn(),
      getCaseBalance: vi.fn(),
      getDebtorCollectionTotal: vi.fn(),
    },
  };
});

vi.mock('@/lib/api/client-statement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-statement')>();
  return { ...actual, clientStatementApi: { ...actual.clientStatementApi, list: vi.fn(), get: vi.fn() } };
});

vi.mock('@/lib/api/office-approval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/office-approval')>();
  return { ...actual, officeApprovalApi: { ...actual.officeApprovalApi, getMine: vi.fn(), getDetail: vi.fn() } };
});

vi.mock('@/lib/api/financial-statement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/financial-statement')>();
  return { ...actual, financialStatementApi: { getClientCaseStatement: vi.fn() } };
});

import ClientAccountingPage from '@/app/(dashboard)/clients/[clientId]/accounting/page';
import { clientAccountingApi } from '@/lib/api/client-accounting';
import { clientStatementApi, type ClientStatement } from '@/lib/api/client-statement';
import { officeApprovalApi } from '@/lib/api/office-approval';
import { financialStatementApi } from '@/lib/api/financial-statement';

type Mocked = Record<string, ReturnType<typeof vi.fn>>;
const accounting = clientAccountingApi as unknown as Mocked;
const statements = clientStatementApi as unknown as Mocked;
const approvals = officeApprovalApi as unknown as Mocked;
const journal = financialStatementApi as unknown as Mocked;

const CASES = [
  { caseId: 'caseT', caseClientId: 'ccT', role: 'ALACAKLI', caseNumber: 'MUH-2026/2-TL', executionFileNumber: null, currency: 'TRY', caseOpenedAt: null },
  { caseId: 'caseU', caseClientId: 'ccU', role: 'ALACAKLI', caseNumber: 'MUH-2026/1-USD', executionFileNumber: null, currency: 'USD', caseOpenedAt: null },
];

/** Sunucu davranışı (ölçüldü): ödenecek tutar ve ödeme listesi para birimine göre süzülür; başka para biriminde "0" / boş. */
const OUTSTANDING: Record<string, string> = { 'caseU:USD': '500', 'caseT:TRY': '1200' };
const PAYOUTS: Record<string, { id: string; amount: string; currency: string }[]> = {
  'caseU:USD': [{ id: 'p-usd', amount: '200', currency: 'USD' }],
  'caseT:TRY': [{ id: 'p-try', amount: '300', currency: 'TRY' }],
};
const EXPENSE: Record<string, { totalRequested: number; totalPaid: number; totalPending: number }> = {
  caseU: { totalRequested: 250, totalPaid: 0, totalPending: 250 },
  caseT: { totalRequested: 1431.1, totalPaid: 0, totalPending: 1431.1 },
};
const BALANCE: Record<string, string> = { caseU: '380', caseT: '600' };
const COLLECTED: Record<string, number> = { caseU: 1000, caseT: 2000 };

/** Dövizli dosyanın ekstresi (ölçüldü): kayıt para birimi TRY; satırlar TL avans + dövizli pay. */
const STATEMENT_USD_CASE: ClientStatement = {
  id: 'st-u', caseId: 'caseU', clientId: 'c1', periodStart: '2026-02-01T00:00:00.000Z', periodEnd: '2026-10-01T23:59:59.000Z',
  openingBalance: '0', closingBalance: '1380', currency: 'TRY', status: 'ACTIVE', supersededById: null, note: null,
  generatedById: 'u1', createdAt: '2026-10-01T19:13:21.000Z',
  lines: [
    { id: 'l1', lineDate: '2026-10-01T19:04:00.000Z', lineType: 'ADVANCE_CREDIT', refType: 'BalanceLedger', refId: 'b1', caseId: null, caseClientId: null, debit: '0', credit: '500', runningBalance: '500', note: 'Müvekkilden masraf avansı alındı' },
    { id: 'l2', lineDate: '2026-10-01T19:04:01.000Z', lineType: 'EXPENSE_ACTUAL', refType: 'BalanceLedger', refId: 'b2', caseId: null, caseClientId: null, debit: '120', credit: '0', runningBalance: '380', note: 'Tebligat gideri ödendi' },
  ],
};

function cardValue(title: string): { value: string; sub: string | null } {
  const heading = screen.getByRole('heading', { name: title });
  const card = heading.closest('.p-4') as HTMLElement;
  const value = card.querySelector('.text-2xl');
  const sub = card.querySelector('.text-xs.text-gray-500');
  return { value: value?.textContent ?? '(yok)', sub: sub?.textContent ?? null };
}

function sectionOf(title: string): HTMLElement {
  return screen.getByRole('heading', { name: title }).closest('.p-4') as HTMLElement;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ClientAccountingPage />
    </QueryClientProvider>,
  );
}

async function waitForCards() {
  await waitFor(() => {
    for (const title of ['Müvekkile Borç (Net)', 'Müvekkilden Talep Edilen Masraf', 'Müvekkilden Tahsil Edilen Masraf', 'Masraf/Avans Bakiyesi', 'Borçlu Tahsilatı']) {
      expect(cardValue(title).value).not.toBe('(yok)');
    }
  });
}

describe('Müvekkil Muhasebesi sayfası — para birimi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Hermetik: taklit edilmeyen herhangi bir çağrı ağa çıkmasın (yerelde çalışan API'ye kimliksiz istek gitmesin).
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    accounting.getCases.mockResolvedValue(CASES);
    accounting.getOutstanding.mockImplementation(async (caseId: string, caseClientId: string, currency: string) => ({
      caseId, caseClientId, currency, outstanding: OUTSTANDING[`${caseId}:${currency}`] ?? '0',
    }));
    accounting.listPayouts.mockImplementation(async (p: { caseId: string; caseClientId: string; currency?: string }) => {
      const items = (PAYOUTS[`${p.caseId}:${p.currency}`] ?? []).map((x) => ({
        ...x, caseId: p.caseId, caseClientId: p.caseClientId, status: 'RECORDED', paidAt: '2026-10-01T19:14:00.000Z', paidById: 'u1', note: null,
      }));
      return { items, page: 1, limit: 20, total: items.length };
    });
    accounting.getExpenseSummary.mockImplementation(async (caseId: string) => ({
      ...EXPENSE[caseId], requestCount: 1, paidCount: 0, pendingCount: 1, blockingUnpaid: EXPENSE[caseId].totalPending,
    }));
    accounting.getCaseBalance.mockImplementation(async (caseId: string) => ({ balance: BALANCE[caseId], currency: 'TRY' }));
    accounting.getDebtorCollectionTotal.mockImplementation(async (caseId: string) => COLLECTED[caseId]);
    accounting.requestPayout.mockResolvedValue({ requested: true, approvalRequestId: 'ar-1', status: 'PENDING_APPROVAL' });
    statements.list.mockResolvedValue([]);
    statements.get.mockResolvedValue(STATEMENT_USD_CASE);
    approvals.getMine.mockResolvedValue([]);
    journal.getClientCaseStatement.mockReturnValue(new Promise(() => {}));
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('dövizli dosya (USD)', () => {
    beforeEach(() => {
      nav.search = 'caseId=caseU';
    });

    it('ödenecek tutar, ödeme listesi ve muhasebe defteri dosyanın para birimiyle istenir', async () => {
      renderPage();
      await waitForCards();
      expect(accounting.getOutstanding).toHaveBeenCalledWith('caseU', 'ccU', 'USD');
      expect(accounting.listPayouts).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'caseU', caseClientId: 'ccU', currency: 'USD' }));
      await waitFor(() => expect(journal.getClientCaseStatement).toHaveBeenCalled());
      expect(journal.getClientCaseStatement).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'caseU', currency: 'USD' }));
      // TRY ile hiç istenmez: aksi halde sunucu "0" döner ve borç ₺0,00 görünür.
      expect(accounting.getOutstanding.mock.calls.every((c) => c[2] === 'USD')).toBe(true);
    });

    it('müvekkile borç ve borçlu tahsilatı USD; masraf kartları ve avans bakiyesi TL', async () => {
      renderPage();
      await waitForCards();
      expect(cardValue('Müvekkile Borç (Net)').value).toBe('$500,00');
      expect(cardValue('Borçlu Tahsilatı').value).toBe('$1.000,00');
      expect(cardValue('Müvekkilden Talep Edilen Masraf')).toEqual({ value: '₺250,00', sub: 'Ödenmemiş: ₺250,00' });
      expect(cardValue('Müvekkilden Tahsil Edilen Masraf').value).toBe('₺0,00');
      expect(cardValue('Masraf/Avans Bakiyesi').value).toBe('₺380,00');
    });

    it('müvekkile yapılan dövizli ödeme listede kendi para birimiyle görünür', async () => {
      renderPage();
      await waitForCards();
      const section = sectionOf('Müvekkile Ödemeler');
      await waitFor(() => expect(within(section).getByText('1 kayıt')).toBeInTheDocument());
      expect(within(section).getByText('$200,00')).toBeInTheDocument();
    });

    it('ödeme talebi penceresi dosyanın para birimiyle açılır ve talep o para birimiyle gönderilir', async () => {
      renderPage();
      await waitForCards();
      fireEvent.click(screen.getByRole('button', { name: /Ödeme Talebi Oluştur/ }));
      const dialogTitle = await screen.findByText('Müvekkile Ödeme Talebi Oluştur');
      const modal = dialogTitle.closest('.max-w-md') as HTMLElement;
      expect(within(modal).getByText('Tutar (USD)')).toBeInTheDocument();
      expect(within(modal).getByText('$500,00')).toBeInTheDocument();

      const amount = within(modal).getByPlaceholderText('0,00');
      // Ödenecek tutarı aşan tutar: "Devam" kapalı kalır.
      fireEvent.change(amount, { target: { value: '600' } });
      expect(within(modal).getByRole('button', { name: 'Devam' })).toBeDisabled();
      fireEvent.change(amount, { target: { value: '100' } });
      const devam = within(modal).getByRole('button', { name: 'Devam' });
      expect(devam).toBeEnabled();
      fireEvent.click(devam);
      fireEvent.click(await within(modal).findByRole('button', { name: 'Onay Talebi Oluştur' }));
      await waitFor(() => expect(accounting.requestPayout).toHaveBeenCalledTimes(1));
      expect(accounting.requestPayout.mock.calls[0][0]).toEqual(
        expect.objectContaining({ caseId: 'caseU', caseClientId: 'ccU', amount: '100', currency: 'USD' }),
      );
    });

    it('ekstre satırları ekstrenin kendi para birimiyle yazılır (TL avans satırı "$" ile yazılmaz)', async () => {
      statements.list.mockResolvedValue([{ ...STATEMENT_USD_CASE, lines: undefined }]);
      renderPage();
      await waitForCards();
      const section = sectionOf('Müvekkil Ekstresi');
      fireEvent.click(await within(section).findByRole('button', { name: /Görüntüle/ }));
      await waitFor(() => expect(within(section).getByText('Müvekkilden masraf avansı alındı')).toBeInTheDocument());
      expect(within(section).getAllByText('₺1.380,00').length).toBeGreaterThan(0); // başlık + kapanış
      expect(within(section).getAllByText('₺500,00').length).toBe(2); // alacak + bakiye
      expect(within(section).getByText('₺120,00')).toBeInTheDocument();
      expect(within(section).getByText('₺380,00')).toBeInTheDocument();
      expect(section.textContent).not.toContain('$');
    });
  });

  describe('TL dosya (değişmez)', () => {
    beforeEach(() => {
      nav.search = 'caseId=caseT';
    });

    it('istekler TRY ile; kartlar bugünkü metinle', async () => {
      renderPage();
      await waitForCards();
      expect(accounting.getOutstanding).toHaveBeenCalledWith('caseT', 'ccT', 'TRY');
      expect(accounting.listPayouts).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'caseT', currency: 'TRY' }));
      expect(cardValue('Müvekkile Borç (Net)').value).toBe('₺1.200,00');
      expect(cardValue('Müvekkilden Talep Edilen Masraf')).toEqual({ value: '₺1.431,10', sub: 'Ödenmemiş: ₺1.431,10' });
      expect(cardValue('Müvekkilden Tahsil Edilen Masraf').value).toBe('₺0,00');
      expect(cardValue('Masraf/Avans Bakiyesi').value).toBe('₺600,00');
      expect(cardValue('Borçlu Tahsilatı').value).toBe('₺2.000,00');
      const payouts = sectionOf('Müvekkile Ödemeler');
      await waitFor(() => expect(within(payouts).getByText('₺300,00')).toBeInTheDocument());
    });

    it('ödeme talebi penceresi TRY ile açılır', async () => {
      renderPage();
      await waitForCards();
      fireEvent.click(screen.getByRole('button', { name: /Ödeme Talebi Oluştur/ }));
      const modal = (await screen.findByText('Müvekkile Ödeme Talebi Oluştur')).closest('.max-w-md') as HTMLElement;
      expect(within(modal).getByText('Tutar (TRY)')).toBeInTheDocument();
      expect(within(modal).getByText('₺1.200,00')).toBeInTheDocument();
    });
  });
});
