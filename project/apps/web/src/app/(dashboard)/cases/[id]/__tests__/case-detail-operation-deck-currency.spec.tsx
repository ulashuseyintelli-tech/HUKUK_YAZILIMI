import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/**
 * DOSYA ÇALIŞMA ALANI — OperationDeck "Finans" / "Dağıtım & Mutabakat" sekmeleri tahsilat ve dağıtım kaydı tutarını
 * KAYDIN KENDİ para birimiyle yazar; "+ Düzenle" / "+ Yeni Ödeme" formları DOSYANIN para birimiyle açılır.
 *
 * Kusur (bu sayfa testinin düzeniyle ölçüldü, main 6917e8aa):
 *  - USD dosya (10.000 USD + 250 USD kalem, 1.000 USD tahsilat): Finans sekmesi "Tahsilat 1.000 ₺", satır "+1.000 ₺"
 *    — TL dosyanın ekranıyla birebir aynı metin.
 *  - USD dosya + eski TRY ve EUR tahsilat (1.000 USD + 500 TRY + 300 EUR): "Tahsilat 1.800 ₺".
 *  - USD dağıtım kaydı: "1.000 ₺" / "+400 ₺".
 *  - USD ve EUR dosyada iki form da "₺ TRY" seçili açılıyordu.
 * Neden: sayfa finans kartına tahsilatın para birimini, formlara dosyanın para birimini taşımıyordu.
 *
 * Kural (politika gerektirmeyen kısım; RECEIVABLE-GOVERNANCE REC-ALLOC-008, REC-FX-001/002): tutar kaydın kendi para
 * birimiyle yazılır, farklı para birimleri tek toplamda birleştirilmez, tutar ÇEVRİLMEZ. Form varsayılanı dosyanın para
 * birimidir; seçim kilitlenmez; düzenlemede kaydın kendi değeri korunur. TL dosyada gösterim aynen kalır.
 */

vi.mock('@/lib/api', () => {
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn().mockResolvedValue([]);
      return registry[prop];
    },
  };
  return { api: new Proxy({}, handler) };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'case-1' }),
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/cases/case-1',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' }, loading: false }),
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

type Rec = Record<string, unknown>;

const due = (id: string, type: string, description: string, amount: string, currency?: string): Rec => ({
  id,
  type,
  description,
  amount,
  dueDate: '2026-01-15T00:00:00.000Z',
  ...(currency ? { currency } : {}),
});

const collection = (id: string, amount: string, currency?: string, extra: Rec = {}): Rec => ({
  id,
  type: 'TAHSILAT',
  channel: 'BANKA',
  amount,
  date: '2026-03-01T00:00:00.000Z',
  status: 'CONFIRMED',
  allocationHold: null,
  ...(currency ? { currency } : {}),
  ...extra,
});

const disposition = (id: string, collectionId: string, totalAmount: string, currency: string, status: string): Rec => ({
  id,
  tenantId: 't1',
  caseId: 'case-1',
  collectionId,
  beneficiaryScope: 'SINGLE_CASE_CLIENT',
  caseClientId: null,
  status,
  totalAmount,
  currency,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  postedAt: status === 'POSTED' ? '2026-03-02T10:00:00.000Z' : null,
  lines: [],
});

/** Diğer yüzeylerin gerçek sözleşme varsayılanları (WSMR-A4n ile aynı gerekçe) + bu dosyanın kayıtları. */
function mountCase(input: { caseFields: Rec; dues?: Rec[]; collections?: Rec[]; dispositions?: Rec[] }) {
  const loaded = { id: 'case-1', fileNumber: '2026/1', debtors: [], caseClients: [], lawyers: [], claimItems: [], ...input.caseFields };
  mocked.getCase.mockResolvedValue(loaded);
  mocked.getCaseDues.mockResolvedValue(input.dues ?? []);
  mocked.getCaseCollections.mockResolvedValue(input.collections ?? []);
  mocked.getCaseDebtors.mockResolvedValue({
    summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 },
    items: [],
  });
  mocked.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
  mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  mocked.getActiveCaseFeeAgreement.mockResolvedValue(null);
  mocked.getCollectionDispositionsByCase.mockResolvedValue(input.dispositions ?? []);
  mocked.getCaseResponsibilityAt.mockResolvedValue({
    caseId: loaded.id,
    asOf: new Date().toISOString(),
    operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' },
    legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' },
    horizon: {},
  });
  mocked.getCaseResponsibilityHistory.mockResolvedValue({ caseId: loaded.id, from: null, to: null, events: [], horizon: {} });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

// Tam paralel regresyonda sayfa render'ı CPU rekabetine girer (bkz. a4w spec) — bekleme süresi geniş tutulur.
// Test süresi beklemeden UZUN olmalı: aksi halde düşen iddia "beklenen / ekrandaki" farkı yerine zaman aşımı yazar.
const WAIT = { timeout: 8_000 };
vi.setConfig({ testTimeout: 30_000 });

const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function boxOf(title: 'Alacak Kalemleri' | 'Ödemeler'): Element {
  const heading = screen.getByText(title, { selector: 'h4' });
  const box = heading.parentElement?.parentElement?.children[1];
  if (!box) throw new Error(`"${title}" kutusu bulunamadı`);
  return box;
}

/** Sayfa yüklendi, finans okuması (kalemler, tahsilatlar, dağıtım kayıtları) bitti. */
async function pageReady() {
  await waitFor(() => {
    expect(norm(boxOf('Alacak Kalemleri').textContent)).not.toContain('Yükleniyor');
    expect(norm(boxOf('Ödemeler').textContent)).not.toContain('Yükleniyor');
  }, WAIT);
  await waitFor(() => expect(mocked.getCollectionDispositionsByCase).toHaveBeenCalled(), WAIT);
}

/** OperationDeck sekme düğmesi: yazısı etiketin kendisi (+ varsa rozet sayısı). Tek değilse hata fırlatır. */
function deckTab(label: string): HTMLElement {
  const hits = screen.getAllByRole('button').filter((b) => new RegExp(`^${label}(\\d+)?$`).test(norm(b.textContent)));
  if (hits.length !== 1) throw new Error(`"${label}" sekme düğmesi tek değil: ${hits.length}`);
  return hits[0];
}

type FinanceView = { card: string; total: string | null; unavailable: string | null; held: string | null; rows: string[] };

/** Finans sekmesini açar, "Tahsilat" kartını ve "Son İşlemler" satırlarını ("açıklama | tutar") okur, sekmeyi kapatır. */
function readFinanceTab(): FinanceView {
  fireEvent.click(deckTab('Finans'));
  const total = screen.queryByTestId('finance-collection-total');
  const unavailable = screen.queryByTestId('finance-collection-total-unavailable');
  const card = (total ?? unavailable)?.parentElement;
  if (!card) throw new Error('Tahsilat kartı bulunamadı');
  const held = screen.queryByTestId('finance-collection-held');
  const list = screen.getByText('Son İşlemler').nextElementSibling;
  if (!list) throw new Error('"Son İşlemler" listesi bulunamadı');
  const rows = Array.from(list.children).map((row) => {
    const amount = row.children[1]?.children[0];
    return amount ? `${norm(row.children[0]?.textContent)} | ${norm(amount.textContent)}` : norm(row.textContent);
  });
  const view = {
    card: norm(card.textContent),
    total: total ? norm(total.textContent) : null,
    unavailable: unavailable ? norm(unavailable.textContent) : null,
    held: held ? norm(held.textContent) : null,
    rows,
  };
  fireEvent.click(deckTab('Finans'));
  return view;
}

/** Dağıtım kayıtları sayfaya ulaştı: sekme rozeti beklenen kayıt sayısını gösteriyor. */
const accountingRecordsLoaded = (count: number) =>
  waitFor(() => expect(norm(deckTab('Dağıtım & Mutabakat').textContent)).toBe(`Dağıtım & Mutabakat${count}`), WAIT);

/** Dağıtım & Mutabakat sekmesindeki kayıtların "açıklama => tutar" satırları. */
function readAccountingTab(descriptions: string[]): string[] {
  fireEvent.click(deckTab('Dağıtım & Mutabakat'));
  const out = descriptions.map((description) => {
    const amount = screen.getByText(description).nextElementSibling;
    if (!amount || amount.tagName !== 'P') throw new Error(`"${description}" kaydının tutar satırı bulunamadı`);
    return `${description} => ${norm(amount.textContent)}`;
  });
  fireEvent.click(deckTab('Dağıtım & Mutabakat'));
  return out;
}

type CurrencyField = { selected: string; shown: string; options: string[]; disabled: boolean };

/** Açık formun "Para Birimi" alanını okur ve formu KAYDETMEDEN kapatır. */
async function readCurrencyFieldAndClose(headingName: string): Promise<CurrencyField> {
  const heading = screen.getByRole('heading', { name: headingName });
  const form = heading.closest('div.relative');
  if (!form) throw new Error(`"${headingName}" formu bulunamadı`);
  const label = Array.from(form.querySelectorAll('label')).find((l) => norm(l.textContent) === 'Para Birimi');
  const select = label?.parentElement?.querySelector('select') as HTMLSelectElement | null | undefined;
  if (!select) throw new Error(`"${headingName}" formunda para birimi alanı bulunamadı`);
  const field = {
    selected: select.value,
    shown: norm(select.options[select.selectedIndex]?.textContent),
    options: Array.from(select.options).map((o) => o.value),
    disabled: select.disabled,
  };
  const cancel = Array.from(form.querySelectorAll('button')).find((b) => norm(b.textContent) === 'İptal');
  if (!cancel) throw new Error(`"${headingName}" formunda İptal düğmesi bulunamadı`);
  fireEvent.click(cancel);
  await waitFor(() => expect(screen.queryByRole('heading', { name: headingName })).toBeNull(), WAIT);
  return field;
}

const newDueField = () => {
  fireEvent.click(screen.getByRole('button', { name: '+ Düzenle' }));
  return readCurrencyFieldAndClose('Yeni Alacak Kalemi');
};

const newPaymentField = () => {
  fireEvent.click(screen.getByRole('button', { name: '+ Yeni Ödeme' }));
  return readCurrencyFieldAndClose('Yeni Ödeme');
};

const editDueField = (displayName: string) => {
  fireEvent.click(screen.getByTitle(displayName));
  return readCurrencyFieldAndClose('Alacak Kalemi Düzenle');
};

/** "Ödemeler" kutusundaki sıra numarası verilen tahsilat satırını düzenleme formunda açar (tarih sırasıyla). */
const editPaymentField = (index: number) => {
  const rows = boxOf('Ödemeler').querySelectorAll('div.cursor-pointer');
  if (!rows[index]) throw new Error(`Ödemeler kutusunda ${index}. tahsilat satırı yok`);
  fireEvent.click(rows[index]);
  return readCurrencyFieldAndClose('Ödeme Düzenle');
};

const LISTED = ['TRY', 'USD', 'EUR', 'GBP'];
const MIXED_TITLE = 'Tahsilatlar birden fazla para biriminde; tutarlar çevrilmez ve tek toplamda birleştirilmez.';

beforeEach(() => {
  vi.clearAllMocks();
  // Sayfanın alt bileşenleri (ör. hesap özeti) kendi istemcisiyle ağa çıkar. Test yerelde çalışan bir API'ye istek
  // atmasın diye yanıt hiç dönmez: o bileşenler "yükleniyor" durumunda kalır; bu test onları ölçmez.
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('USD dosya — Finans sekmesi tahsilatı kendi para birimiyle yazar', () => {
  it('"Tahsilat" kartı ve "Son İşlemler" satırı USD ile yazılır; "₺" yalnız TL tarifesindeki masraf kartlarında kalır', async () => {
    mountCase({
      caseFields: { currency: 'USD', subCategory: 'DOVIZ', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'USD'), due('d2', 'EXPENSE', 'Masraf', '250', 'USD')],
      collections: [collection('c1', '1000', 'USD')],
    });
    await pageReady();

    const finance = readFinanceTab();
    expect(finance.total).toBe('1.000 USD');
    expect(finance.card).toBe('Tahsilat1.000 USD');
    expect(finance.rows).toEqual(['Tahsilat | +1.000 USD']);
  });

  it('mahsubu bekleyen tahsilat ayrı satırda, kendi para birimiyle yazılır', async () => {
    mountCase({
      caseFields: { currency: 'USD', subCategory: 'DOVIZ', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'USD')],
      collections: [
        collection('c1', '1000', 'USD'),
        collection('c2', '1500', 'USD', { allocationHold: { status: 'HELD', holdReason: null }, date: '2026-03-02T00:00:00.000Z' }),
      ],
    });
    await pageReady();

    const finance = readFinanceTab();
    expect(finance.total).toBe('1.000 USD');
    expect(finance.held).toBe('Mahsubu bekleyen: 1.500 USD (borçtan düşülmedi)');
    expect(finance.rows).toEqual(['Tahsilat | +1.000 USD', 'Tahsilatmahsubu bekliyor | 1.500 USD']);
  });

  it('tahsilatı olmayan dövizli dosyada 0 tutarı dosyanın para birimiyle yazılır', async () => {
    mountCase({ caseFields: { currency: 'EUR', subCategory: 'DOVIZ', principalAmount: '5000' } });
    await pageReady();

    const finance = readFinanceTab();
    expect(finance.total).toBe('0 EUR');
    expect(finance.rows).toEqual(['Henüz işlem yok']);
  });
});

describe('Farklı para birimli eski tahsilat kayıtları — tek toplamda birleştirilmez', () => {
  it('1.000 USD + 500 TRY + 300 EUR: toplam "gösterilemez" (1.800 yazılmaz, tutar çevrilmez); her satır kendi para birimiyle', async () => {
    mountCase({
      caseFields: { currency: 'USD', subCategory: 'DOVIZ', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'USD')],
      collections: [
        collection('c1', '1000', 'USD', { description: 'USD tahsilat' }),
        collection('c2', '500', 'TRY', { description: 'Eski TRY tahsilat', date: '2026-03-02T00:00:00.000Z' }),
        collection('c3', '300', 'EUR', { description: 'Eski EUR tahsilat', date: '2026-03-03T00:00:00.000Z' }),
      ],
    });
    await pageReady();

    fireEvent.click(deckTab('Finans'));
    expect(screen.queryByTestId('finance-collection-total')).toBeNull();
    const unavailable = screen.getByTestId('finance-collection-total-unavailable');
    expect(norm(unavailable.textContent)).toBe('gösterilemez');
    expect(norm(unavailable.parentElement?.textContent)).toBe('Tahsilat (farklı para birimleri)gösterilemez');
    // Neden ekranda: kart açıklamayı taşır
    expect(unavailable.parentElement?.getAttribute('title')).toBe(MIXED_TITLE);
    fireEvent.click(deckTab('Finans'));

    const finance = readFinanceTab();
    expect(finance.card).not.toContain('1.800');
    expect(finance.rows).toEqual(['USD tahsilat | +1.000 USD', 'Eski TRY tahsilat | +500 ₺', 'Eski EUR tahsilat | +300 EUR']);
  });

  it('iptal edilmiş farklı para birimli tahsilat finans kartına girmez: toplam yine yazılır', async () => {
    mountCase({
      caseFields: { currency: 'USD', subCategory: 'DOVIZ', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'USD')],
      collections: [
        collection('c1', '1000', 'USD'),
        collection('c2', '500', 'TRY', { status: 'CANCELLED', date: '2026-03-02T00:00:00.000Z' }),
      ],
    });
    await pageReady();

    const finance = readFinanceTab();
    expect(finance.total).toBe('1.000 USD');
    expect(finance.unavailable).toBeNull();
    expect(finance.rows).toEqual(['Tahsilat | +1.000 USD']);
  });
});

describe('Dağıtım & Mutabakat — dağıtım kaydı tutarı kendi para birimiyle', () => {
  it('USD dosya: bekleyen "1.000 USD", kesinleşen "+400 USD"', async () => {
    mountCase({
      caseFields: { currency: 'USD', subCategory: 'DOVIZ', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'USD')],
      collections: [collection('c1', '1000', 'USD'), collection('c2', '400', 'USD', { date: '2026-03-02T00:00:00.000Z' })],
      dispositions: [
        disposition('disp-1', 'c1', '1000', 'USD', 'HELD_PENDING_DISTRIBUTION'),
        disposition('disp-2', 'c2', '400', 'USD', 'POSTED'),
      ],
    });
    await pageReady();
    await accountingRecordsLoaded(2);

    expect(readAccountingTab(['Tahsilat - Durum: Dağıtım bekliyor', 'Tahsilat - Durum: Dağıtım Kesinleşti'])).toEqual([
      'Tahsilat - Durum: Dağıtım bekliyor => 1.000 USD',
      'Tahsilat - Durum: Dağıtım Kesinleşti => +400 USD',
    ]);
  });

  it('TL dosyada gösterim DEĞİŞMEDİ: "1.000 ₺" ve "+400 ₺"', async () => {
    mountCase({
      caseFields: { currency: 'TRY', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'TRY')],
      collections: [collection('c1', '1000', 'TRY'), collection('c2', '400', 'TRY', { date: '2026-03-02T00:00:00.000Z' })],
      dispositions: [
        disposition('disp-1', 'c1', '1000', 'TRY', 'HELD_PENDING_DISTRIBUTION'),
        disposition('disp-2', 'c2', '400', 'TRY', 'POSTED'),
      ],
    });
    await pageReady();
    await accountingRecordsLoaded(2);

    expect(readAccountingTab(['Tahsilat - Durum: Dağıtım bekliyor', 'Tahsilat - Durum: Dağıtım Kesinleşti'])).toEqual([
      'Tahsilat - Durum: Dağıtım bekliyor => 1.000 ₺',
      'Tahsilat - Durum: Dağıtım Kesinleşti => +400 ₺',
    ]);
  });
});

describe('Yeni alacak / yeni ödeme formu — para birimi varsayılanı dosyanın para birimi', () => {
  it('USD dosyada iki form da USD seçili açılır; seçim kilitli değildir', async () => {
    mountCase({
      caseFields: { currency: 'USD', subCategory: 'DOVIZ', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'USD')],
      collections: [collection('c1', '1000', 'USD')],
    });
    await pageReady();

    expect(await newDueField()).toEqual({ selected: 'USD', shown: '$ USD', options: LISTED, disabled: false });
    expect(await newPaymentField()).toEqual({ selected: 'USD', shown: '$ USD', options: LISTED, disabled: false });
  });

  it('EUR dosyada (kalemsiz, tahsilatsız) iki form da EUR seçili açılır', async () => {
    mountCase({ caseFields: { currency: 'EUR', subCategory: 'DOVIZ', principalAmount: '5000' } });
    await pageReady();

    expect((await newDueField()).selected).toBe('EUR');
    expect((await newPaymentField()).selected).toBe('EUR');
  });

  it('dosya para birimi seçenek listesinde olmayan CHF ise formlar CHF seçili açılır (listeye eklenir)', async () => {
    mountCase({ caseFields: { currency: 'CHF', subCategory: 'DOVIZ', principalAmount: '5000' } });
    await pageReady();

    expect(await newDueField()).toEqual({ selected: 'CHF', shown: 'CHF', options: [...LISTED, 'CHF'], disabled: false });
    expect(await newPaymentField()).toEqual({ selected: 'CHF', shown: 'CHF', options: [...LISTED, 'CHF'], disabled: false });
  });

  it('düzenlemede kaydın KENDİ para birimi korunur: USD dosyada EUR kalem EUR, eski TRY tahsilat TRY açılır', async () => {
    mountCase({
      caseFields: { currency: 'USD', subCategory: 'DOVIZ', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'EUR kalem', '5000', 'EUR')],
      collections: [
        collection('c1', '500', 'TRY', { date: '2026-03-01T00:00:00.000Z' }),
        collection('c2', '1000', 'USD', { date: '2026-03-02T00:00:00.000Z' }),
      ],
    });
    await pageReady();

    expect((await editDueField('EUR kalem')).selected).toBe('EUR');
    expect((await editPaymentField(0)).selected).toBe('TRY');
    expect((await editPaymentField(1)).selected).toBe('USD');
    // Düzenlemeden sonra açılan yeni kayıt formu yine dosyanın para birimine döner
    expect((await newDueField()).selected).toBe('USD');
    expect((await newPaymentField()).selected).toBe('USD');
  });
});

describe('TL dosya — gösterim ve form varsayılanı DEĞİŞMEDİ (düzeltme öncesi ölçülen metinle birebir)', () => {
  it('Finans sekmesi "1.000 ₺" / "+1.000 ₺"; formlar TRY seçili', async () => {
    mountCase({
      caseFields: { currency: 'TRY', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'TRY'), due('d2', 'EXPENSE', 'Masraf', '250', 'TRY')],
      collections: [collection('c1', '1000', 'TRY')],
    });
    await pageReady();

    const finance = readFinanceTab();
    expect(finance.total).toBe('1.000 ₺');
    expect(finance.card).toBe('Tahsilat1.000 ₺');
    expect(finance.rows).toEqual(['Tahsilat | +1.000 ₺']);
    expect(await newDueField()).toEqual({ selected: 'TRY', shown: '₺ TRY', options: LISTED, disabled: false });
    expect(await newPaymentField()).toEqual({ selected: 'TRY', shown: '₺ TRY', options: LISTED, disabled: false });
    expect((await editDueField('Asıl alacak')).selected).toBe('TRY');
    expect((await editPaymentField(0)).selected).toBe('TRY');
  });

  it('mahsubu bekleyen TRY tahsilat önceki metinle yazılır', async () => {
    mountCase({
      caseFields: { currency: 'TRY', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'TRY')],
      collections: [
        collection('c1', '1000', 'TRY'),
        collection('c2', '1500', 'TRY', { allocationHold: { status: 'HELD', holdReason: null }, date: '2026-03-02T00:00:00.000Z' }),
      ],
    });
    await pageReady();

    const finance = readFinanceTab();
    expect(finance.card).toBe('Tahsilat1.000 ₺Mahsubu bekleyen: 1.500 ₺ (borçtan düşülmedi)');
    expect(finance.rows).toEqual(['Tahsilat | +1.000 ₺', 'Tahsilatmahsubu bekliyor | 1.500 ₺']);
  });

  it('para birimi alanı taşımayan eski yanıt biçimi (dosya, kalem, tahsilat alansız) şema varsayılanı TRY sayılır', async () => {
    mountCase({
      caseFields: { principalAmount: '15000' },
      dues: [due('d1', 'INTEREST', 'Faiz', '500')],
      collections: [collection('c1', '200')],
    });
    await pageReady();

    const finance = readFinanceTab();
    expect(finance.total).toBe('200 ₺');
    expect(finance.rows).toEqual(['Tahsilat | +200 ₺']);
    expect((await newDueField()).selected).toBe('TRY');
    expect((await newPaymentField()).selected).toBe('TRY');
  });
});
