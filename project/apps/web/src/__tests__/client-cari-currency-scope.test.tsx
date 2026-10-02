/**
 * G1 — Müvekkil Genel Cari para birimi kapsamı (web).
 *
 * Ölçülen kusur (main 81ab9466, gerçek tarayıcı): Genel Cari özeti TL ile ister; müvekkilin USD dosyası dışarıda kalıyor,
 * dosya satırında "₺0,00" yazıyor ve hiçbir uyarı yok → 700 USD müvekkil alacağı olan dosya sıfır borçlu görünüyor.
 *
 * Kural: kapsam dışı bilgi SUNUCUDAN gelir (`paraBirimiDurumu`, `paraBirimiKapsami`); ekran bunu kendisi çıkarmaz.
 * Kapsam DIŞI dosyada dosya para birimine bağlı hücreler "—" + açıklama; kapsamdaki GERÇEK sıfır "₺0,00" kalır;
 * TL toplamına döviz eklenmez, çevirme yok. Eski sunucu (alan yok) → yalnız kapsam cümlesi; "kayıt yok" iddia edilmez.
 */
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientCariView } from '@/components/client-accounting/ClientCariView';
import {
  clientAccountingApi,
  type ClientAccountingSummary,
  type ClientCaseBreakdownItem,
} from '@/lib/api/client-accounting';
import { clientOffsetApi } from '@/lib/api/client-offset';

vi.mock('@/lib/api/client-accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-accounting')>();
  return { ...actual, clientAccountingApi: { ...actual.clientAccountingApi, getClientSummary: vi.fn() } };
});
vi.mock('@/lib/api/client-offset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-offset')>();
  return { ...actual, clientOffsetApi: { ...actual.clientOffsetApi, getEligibility: vi.fn() } };
});
// Alt paneller kendi veri kaynaklarını çağırır; bu testin konusu değildir (hermetik kalsın).
vi.mock('@/components/client-accounting/ClientMovementsTable', () => ({ ClientMovementsTable: () => <div /> }));
vi.mock('@/components/client-accounting/ClientLevelStatementSection', () => ({ ClientLevelStatementSection: () => <div /> }));
vi.mock('@/components/client-accounting/OffsetDrawer', () => ({ OffsetDrawer: () => null }));

const summaryApi = clientAccountingApi as unknown as { getClientSummary: ReturnType<typeof vi.fn> };
const offsetApi = clientOffsetApi as unknown as { getEligibility: ReturnType<typeof vi.fn> };

const row = (over: Partial<ClientCaseBreakdownItem> & { caseId: string; caseNumber: string }): ClientCaseBreakdownItem => ({
  executionFileNumber: null,
  role: 'ALACAKLI',
  payableNet: '0',
  paidToClient: '0',
  expenseRequested: '0',
  expensePaid: '0',
  debtorCollection: '0',
  pendingDistribution: '0',
  advanceBalance: '0',
  needsReview: false,
  ...over,
});

const TAM = { kapsam: 'TAM' as const, dosyaParaBirimi: 'TRY', kapsamDisiParaBirimleri: [], belirsizParaBirimiKayitSayisi: 0, mesaj: null };
const DISI = {
  kapsam: 'DISI' as const,
  dosyaParaBirimi: 'USD',
  kapsamDisiParaBirimleri: ['USD'],
  belirsizParaBirimiKayitSayisi: 0,
  mesaj: 'SUNUCU-DISI-MESAJI: bu dosya USD cinsindendir; sıfır anlamına gelmez.',
};
const KISMI = {
  kapsam: 'KISMI' as const,
  dosyaParaBirimi: 'TRY',
  kapsamDisiParaBirimleri: ['EUR', 'USD'],
  belirsizParaBirimiKayitSayisi: 0,
  mesaj: 'SUNUCU-KISMI-MESAJI',
};

const DURUM_TEMIZ = {
  istenenParaBirimi: 'TRY',
  kapsamDisiKayitVar: false,
  kapsamDisiParaBirimleri: [] as string[],
  kapsamDisiDosyaSayisi: 0,
  kismiKapsamDosyaSayisi: 0,
  belirsizParaBirimiKayitSayisi: 0,
  yalnizIstenenParaBirimi: true as const,
  mesaj: null,
};
const DURUM_USD = {
  ...DURUM_TEMIZ,
  kapsamDisiKayitVar: true,
  kapsamDisiParaBirimleri: ['USD'],
  kapsamDisiDosyaSayisi: 1,
  mesaj: 'SUNUCU-KAPSAM-MESAJI: Bu görünüm yalnız TRY kayıtlarını kapsar. Bu müvekkilin USD cinsinden kayıtları var.',
};

function summary(over: Partial<ClientAccountingSummary> = {}): ClientAccountingSummary {
  return {
    clientId: 'c1',
    currency: 'TRY',
    clientScoped: {
      payableNet: '1500',
      paidToClient: '300',
      expenseRequested: '0',
      expensePaid: '0',
      expenseUnpaid: '0',
      offsettableNetPosition: '1500',
    },
    caseScopedContext: { debtorCollection: '2000', pendingDistribution: '0', advanceBalance: '0' },
    needsReview: false,
    caseBreakdown: [],
    ...over,
  };
}

function renderCari() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ClientCariView clientId="c1" currency="TRY" />
    </QueryClientProvider>,
  );
}

/** Dosya numarasına göre tablo satırı. */
async function rowOf(caseNumber: string): Promise<HTMLElement> {
  const cell = await screen.findByText(new RegExp(`^${caseNumber.replace('/', '\\/')}`));
  return cell.closest('tr') as HTMLElement;
}

describe('ClientCariView — G1 para birimi kapsamı', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    offsetApi.getEligibility.mockResolvedValue({
      clientId: 'c1',
      currency: 'TRY',
      canApply: false,
      eligiblePayableBuckets: [],
      eligibleExpenseRequests: [],
    });
  });

  it('kapsam dışı kayıt yok: nötr kapsam cümlesi; hiçbir uyarı ve rozet yok; gerçek sıfır ₺0,00 kalır', async () => {
    summaryApi.getClientSummary.mockResolvedValue(
      summary({
        paraBirimiDurumu: DURUM_TEMIZ,
        caseBreakdown: [row({ caseId: 'a', caseNumber: '2026/1', paraBirimiKapsami: TAM })],
      }),
    );

    renderCari();

    const notice = await screen.findByTestId('cari-para-birimi-kapsami');
    expect(notice.textContent).toContain('Bu görünüm yalnız TRY kayıtlarını kapsar');
    expect(notice.textContent).toContain('başka para biriminde kaydı görünmüyor');
    expect(notice.className).not.toMatch(/amber/);
    expect(screen.queryByTestId('dosya-para-birimi-rozeti')).toBeNull();
    expect(screen.queryByTestId('kapsam-disi-hucre')).toBeNull();
    const tr = await rowOf('2026/1');
    expect(within(tr).getAllByText(/0,00/).length).toBeGreaterThan(0); // gerçek sıfır görünür
  });

  it('USD dosya: üstte SUNUCU açıklaması (uyarı rengi); dosya satırı "₺0,00" DEĞİL, dosya para birimine bağlı 4 hücre "—"', async () => {
    summaryApi.getClientSummary.mockResolvedValue(
      summary({
        paraBirimiDurumu: DURUM_USD,
        caseBreakdown: [
          row({ caseId: 'a', caseNumber: '2026/1', paraBirimiKapsami: TAM }),
          row({ caseId: 'u', caseNumber: '2026/2-USD', paraBirimiKapsami: DISI }),
        ],
      }),
    );

    renderCari();

    const notice = await screen.findByTestId('cari-para-birimi-kapsami');
    expect(notice.textContent).toContain('SUNUCU-KAPSAM-MESAJI');
    expect(notice.className).toMatch(/amber/);

    const usd = await rowOf('2026/2-USD');
    // Borç net / ödenen / borçlu tahsilatı / dağıtım bekleyen → "—" (kapsam dışı), sıfır DEĞİL
    expect(within(usd).getAllByTestId('kapsam-disi-hucre')).toHaveLength(4);
    expect(within(usd).getByTestId('dosya-para-birimi-rozeti').textContent).toContain('USD dosya — bu para birimi toplamına dahil değil');
    expect(within(usd).getByTestId('dosya-para-birimi-rozeti').getAttribute('title')).toContain('SUNUCU-DISI-MESAJI');
    // masraf kolonları (TL süzülmüş) hâlâ sayı olarak görünür
    expect(within(usd).getAllByText(/0,00/).length).toBeGreaterThan(0);

    // TL dosya etkilenmez
    const tl = await rowOf('2026/1');
    expect(within(tl).queryByTestId('kapsam-disi-hucre')).toBeNull();
    expect(within(tl).queryByTestId('dosya-para-birimi-rozeti')).toBeNull();
  });

  it('kapsam dışı dosyada ham sunucu değerleri (sıfır) ekranda para tutarı olarak YAZILMAZ', async () => {
    summaryApi.getClientSummary.mockResolvedValue(
      summary({
        paraBirimiDurumu: DURUM_USD,
        caseBreakdown: [
          row({ caseId: 'u', caseNumber: '2026/2-USD', paraBirimiKapsami: DISI, payableNet: '0', paidToClient: '0' }),
        ],
      }),
    );

    renderCari();

    const usd = await rowOf('2026/2-USD');
    const cells = Array.from(usd.querySelectorAll('td')).map((td) => td.textContent ?? '');
    // 3. ve 4. hücre (Müv. Borç Net / Müv. Ödenen) para tutarı değil
    expect(cells[2]).toBe('—');
    expect(cells[3]).toBe('—');
    expect(cells[2]).not.toMatch(/₺/);
  });

  it('KISMI dosya: değerler sayı olarak kalır, rozet hangi para biriminin dahil olmadığını yazar', async () => {
    summaryApi.getClientSummary.mockResolvedValue(
      summary({
        paraBirimiDurumu: { ...DURUM_USD, kapsamDisiParaBirimleri: ['EUR', 'USD'], kapsamDisiDosyaSayisi: 0, kismiKapsamDosyaSayisi: 1 },
        caseBreakdown: [row({ caseId: 'a', caseNumber: '2026/1', payableNet: '700', paraBirimiKapsami: KISMI })],
      }),
    );

    renderCari();

    const tr = await rowOf('2026/1');
    expect(within(tr).queryByTestId('kapsam-disi-hucre')).toBeNull();
    expect(within(tr).getByTestId('dosya-para-birimi-rozeti').textContent).toContain('EUR, USD kayıtları dahil değil');
    expect(within(tr).getByText(/700,00/)).toBeTruthy();
  });

  it('belirsiz para birimli kayıt: "belirlenemeyen" yazılır, sıfır / TL denmez', async () => {
    summaryApi.getClientSummary.mockResolvedValue(
      summary({
        paraBirimiDurumu: { ...DURUM_TEMIZ, kapsamDisiKayitVar: true, belirsizParaBirimiKayitSayisi: 2, kismiKapsamDosyaSayisi: 1, mesaj: 'SUNUCU-BELIRSIZ' },
        caseBreakdown: [
          row({
            caseId: 'a',
            caseNumber: '2026/1',
            paraBirimiKapsami: { ...TAM, kapsam: 'KISMI', belirsizParaBirimiKayitSayisi: 2, mesaj: 'm' },
          }),
        ],
      }),
    );

    renderCari();

    const tr = await rowOf('2026/1');
    expect(within(tr).getByTestId('dosya-para-birimi-rozeti').textContent).toContain('para birimi belirlenemeyen');
  });

  it('üst metrik: kapsam dışı kayıt varsa "dahil değil" notu (sunucu listesinden)', async () => {
    summaryApi.getClientSummary.mockResolvedValue(summary({ paraBirimiDurumu: DURUM_USD, caseBreakdown: [] }));

    renderCari();

    expect(await screen.findByText('USD kayıtları dahil değil.')).toBeTruthy();
  });

  it('eski sunucu (paraBirimiDurumu / paraBirimiKapsami YOK): yalnız kapsam cümlesi; "kayıt yok" iddia EDİLMEZ; satırlar eskisi gibi', async () => {
    summaryApi.getClientSummary.mockResolvedValue(
      summary({ caseBreakdown: [row({ caseId: 'a', caseNumber: '2026/1', payableNet: '1500' })] }),
    );

    renderCari();

    const notice = await screen.findByTestId('cari-para-birimi-kapsami');
    expect(notice.textContent).toContain('Bu görünüm yalnız TRY kayıtlarını kapsar');
    expect(notice.textContent).not.toContain('görünmüyor');
    const tr = await rowOf('2026/1');
    expect(within(tr).queryByTestId('kapsam-disi-hucre')).toBeNull();
    expect(within(tr).getByText(/1\.500,00/)).toBeTruthy();
  });
});
