import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/**
 * DOSYA ÇALIŞMA ALANI — OperationDeck'te veri kaynağına BAĞLI OLMAYAN alanlar sıfır ya da "kayıt yok" yazmaz.
 *
 * Kusur (gerçek tarayıcıda ölçüldü, main ea3c1156 / 4915fc57; yerel API + disposable PostgreSQL): sayfa bileşene sabit
 * `clientBalance={0}`, `uyapQueries={[]}`, `relatedCases={[]}` veriyor ve yapılan masraf satırı hiç vermiyordu.
 * Sunucuda masraf/avans bakiyesi 1.150, masraf düşümü 850, müvekkile ödenecek 600 olan dosyada Finans sekmesi
 * "Yapılan Masraf 0 ₺ · Müvekkil Bakiye 0 ₺" yazıyor (hiç mali hareketi olmayan dosyayla aynı metin); "UYAP Sorgu"
 * sekmesi "Henüz sorgu yapılmamış" diyor ve beş "Hızlı Sorgu" düğmesi hiçbir şey yapmıyor; "İlişkili" sekmesi
 * "İlişkili dosya yok" diyordu.
 *
 * Kural (owner kararı 2026-10-01): bağlanmamış alan sayı ya da "kayıt yok" beyanı yazmaz; bağlantının hazır olmadığı
 * yazılır. Hangi bakiyenin / hangi masraf kapsamının gösterileceği SEÇİLMEDİ — sayfa bu alanlar için yeni bir veri
 * kaynağı (ör. `GET /cases/:id/balance`) BAĞLAMAZ ve istemcide yeni toplam hesaplamaz. Gerçek kaynağa bağlı tahsilat,
 * masraf talebi ve dağıtım gösterimleri ile okuma hatası bantları aynen kalır.
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

const NOT_CONNECTED_CARD = 'Bu bilgi henüz bu ekrana bağlanmadı';

const collection = (id: string, amount: string, currency: string): Rec => ({
  id,
  type: 'TAHSILAT',
  channel: 'BANKA',
  amount,
  currency,
  date: '2026-03-01T00:00:00.000Z',
  status: 'CONFIRMED',
  allocationHold: null,
});

/** GET /expense-requests/case/:caseId/three-view öğesi (bekleyen açılış masraf talebi). */
const openingExpenseRequest: Rec = {
  task: { id: 'exp-1', title: 'Müvekkilden Takip açılış masrafları talep edildi', status: 'BEKLIYOR', priority: 'HIGH' },
  finance: {
    id: 'exp-1',
    type: 'MASRAF_TALEP',
    date: '2026-02-01T00:00:00.000Z',
    description: 'Takip Açılış Masrafları',
    status: 'PENDING',
    totalAmount: 1431.1,
    paidAmount: 0,
    remainingAmount: 1431.1,
    items: [],
    payments: [],
  },
  clientRequest: { id: 'exp-1', content: 'Takip Açılış Masrafları - 1.431,10 TL', amount: 1431.1, status: 'BEKLIYOR', createdAt: '2026-02-01T00:00:00.000Z' },
};

const postedDisposition = (currency: string): Rec => ({
  id: 'disp-1',
  tenantId: 't1',
  caseId: 'case-1',
  collectionId: 'c1',
  beneficiaryScope: 'SINGLE_CASE_CLIENT',
  caseClientId: 'cc-1',
  status: 'POSTED',
  totalAmount: '1000',
  currency,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-02T10:00:00.000Z',
  postedAt: '2026-03-02T10:00:00.000Z',
  lines: [
    { id: 'l1', type: 'CLIENT_PAYABLE', amount: '600', caseClientId: 'cc-1' },
    { id: 'l2', type: 'CONTRACTUAL_FEE_WITHHELD', amount: '300', caseClientId: null },
    { id: 'l3', type: 'OFFSET_CLIENT_ADVANCE', amount: '100', caseClientId: null },
  ],
});

/**
 * Sunucuda VAR olan ama sayfanın bu alanlara BAĞLAMADIĞI kaynaklar. Sayfa bunları çağırsaydı veri hazırdı:
 * masraf/avans bakiyesi 1.150 (dize), defterde 850 masraf düşümü, borçlunun iki bekleyen UYAP sorgusu.
 */
function seedUnconnectedServerSources() {
  mocked.getCaseBalance.mockResolvedValue({ id: 'cb-1', caseId: 'case-1', balance: '1150', currency: 'TRY', lowThreshold: '500', isLow: false, recentLedger: [] });
  mocked.getCaseBalanceLedger.mockResolvedValue([
    { id: 'bl-2', type: 'DEBIT', amount: '-350', currency: 'TRY', entryKind: 'EXPENSE_ACTUAL', description: 'Haciz yolluğu ödendi' },
    { id: 'bl-1', type: 'DEBIT', amount: '-500', currency: 'TRY', entryKind: null, description: 'Tebligat gideri ödendi' },
  ]);
  mocked.getUyapQueriesForDebtor.mockResolvedValue([
    { id: 'uq-1', queryType: 'SGK', status: 'PENDING' },
    { id: 'uq-2', queryType: 'NUFUS_ADRES', status: 'PENDING' },
  ]);
}

let fetchUrls: string[] = [];

/**
 * Diğer yüzeylerin gerçek sözleşme varsayılanları (WSMR-A4n ile aynı gerekçe) + bu dosyanın kayıtları.
 * `beforeRender`: sayfa çizilmeden önce bir okumanın davranışını değiştirmek için (ör. hata / hiç dönmeyen yanıt).
 */
function mountCase(
  input: { currency?: string; collections?: Rec[]; expenseThreeView?: Rec[]; dispositions?: Rec[] } = {},
  beforeRender: () => void = () => {},
) {
  const currency = input.currency ?? 'TRY';
  const loaded = {
    id: 'case-1',
    fileNumber: '2026/1',
    currency,
    principalAmount: '10000',
    debtors: [],
    caseClients: [{ id: 'cc-1', role: 'ALACAKLI', client: { id: 'client-1', displayName: 'Müvekkil A.Ş.', name: 'Müvekkil' } }],
    lawyers: [],
    claimItems: [],
  };
  mocked.getCase.mockResolvedValue(loaded);
  mocked.getCaseDues.mockResolvedValue([]);
  mocked.getCaseCollections.mockResolvedValue(input.collections ?? []);
  mocked.getCaseDebtors.mockResolvedValue({
    summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 },
    items: [],
  });
  mocked.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
  mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  mocked.getActiveCaseFeeAgreement.mockResolvedValue(null);
  mocked.getCollectionDispositionsByCase.mockResolvedValue(input.dispositions ?? []);
  mocked.getExpenseThreeViewForCase.mockResolvedValue(input.expenseThreeView ?? []);
  mocked.getCaseResponsibilityAt.mockResolvedValue({
    caseId: loaded.id,
    asOf: new Date().toISOString(),
    operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' },
    legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' },
    horizon: {},
  });
  mocked.getCaseResponsibilityHistory.mockResolvedValue({ caseId: loaded.id, from: null, to: null, events: [], horizon: {} });
  seedUnconnectedServerSources();
  beforeRender();

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

/** Hareketli dosya: 1.000 tahsilat, bekleyen 1.431,10 masraf talebi, kesinleşmiş dağıtım (müvekkile ödenecek 600). */
const mountCaseWithFinancialActivity = (currency = 'TRY') =>
  mountCase({
    currency,
    collections: [collection('c1', '1000', currency)],
    expenseThreeView: [openingExpenseRequest],
    dispositions: [postedDisposition(currency)],
  });

// Tam paralel regresyonda sayfa render'ı CPU rekabetine girer (bkz. a4w spec) — bekleme süresi geniş tutulur.
// Test süresi beklemeden UZUN olmalı: aksi halde düşen iddia "beklenen / ekrandaki" farkı yerine zaman aşımı yazar.
const WAIT = { timeout: 8_000 };
vi.setConfig({ testTimeout: 30_000 });

const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** OperationDeck sekme düğmesi: yazısı etiketin kendisi (+ varsa rozet sayısı). Tek değilse hata fırlatır. */
function deckTab(label: string): HTMLElement {
  const hits = screen.getAllByRole('button').filter((b) => new RegExp(`^${label}(\\d+)?$`).test(norm(b.textContent)));
  if (hits.length !== 1) throw new Error(`"${label}" sekme düğmesi tek değil: ${hits.length}`);
  return hits[0];
}

const badgeOf = (label: string) => norm(deckTab(label).textContent).slice(label.length) || null;

type FinanceView = { cards: Record<string, string>; recent: string[]; recentNote: string | null };

/**
 * AÇIK Finans sekmesini okur: dört özet kartı, "Son İşlemler" satırları ve altındaki not.
 * DOM'u DEĞİŞTİRMEZ — `waitFor` içinde güvenle çağrılır. (Sekmeyi `waitFor` içinde açıp kapatmak, iddia düştüğünde
 * her denemede DOM'u değiştirir; yeniden deneme döngüsü zaman aşımı sayacını aç bırakır ve test düşmek yerine asılır.)
 */
function financeView(): FinanceView {
  const grid = (screen.queryByTestId('finance-collection-total') ?? screen.getByTestId('finance-collection-total-unavailable'))
    .parentElement?.parentElement;
  if (!grid) throw new Error('Finans kart ızgarası bulunamadı');
  const cardTexts = Array.from(grid.children).map((card) => norm(card.textContent));
  if (cardTexts.length !== 4) throw new Error(`Finans sekmesinde 4 kart bekleniyordu: ${cardTexts.length}`);
  const list = screen.getByText('Son İşlemler').nextElementSibling;
  if (!list) throw new Error('"Son İşlemler" listesi bulunamadı');
  const recent = Array.from(list.children).map((row) => {
    const amount = row.children[1]?.children[0];
    return amount ? `${norm(row.children[0]?.textContent)} | ${norm(amount.textContent)}` : norm(row.textContent);
  });
  const note = screen.queryByTestId('finance-recent-actual-expense-unavailable');
  return {
    cards: { Tahsilat: cardTexts[0], 'Yapılan Masraf': cardTexts[1], 'Masraf Talebi': cardTexts[2], 'Müvekkil Bakiye': cardTexts[3] },
    recent,
    recentNote: note ? norm(note.textContent) : null,
  };
}

/** Finans sekmesini bir kez açar (iddialar açık sekme üzerinde `financeView()` ile okunur). */
const openFinanceTab = () => fireEvent.click(deckTab('Finans'));

/** Sayfa yüklendi ve OperationDeck'in bağlı kaynakları (tahsilat, masraf talebi, dağıtım) okundu. */
async function deckSourcesLoaded() {
  await waitFor(() => deckTab('Finans'), WAIT);
  await waitFor(() => {
    expect(mocked.getCaseCollections).toHaveBeenCalled();
    expect(mocked.getExpenseThreeViewForCase).toHaveBeenCalled();
    expect(mocked.getCollectionDispositionsByCase).toHaveBeenCalled();
  }, WAIT);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchUrls = [];
  // Sayfanın alt bileşenleri (ör. hesap özeti) kendi istemcisiyle ağa çıkar. Test yerelde çalışan bir API'ye istek
  // atmasın diye yanıt hiç dönmez; istenen adresler sınır iddiası için kaydedilir.
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      fetchUrls.push(typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input));
      return new Promise<Response>(() => {});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Finans sekmesi — bağlanmamış kartlar sıfır yazmaz', () => {
  it('VERİ BAĞLANTISI YOK: hareketli dosyada "Yapılan Masraf" ve "Müvekkil Bakiye" sayı yazmaz; bağlı kartlar aynen', async () => {
    mountCaseWithFinancialActivity('TRY');
    await deckSourcesLoaded();

    openFinanceTab();
    await waitFor(() => {
      const finance = financeView();
      expect(finance.cards).toEqual({
        Tahsilat: 'Tahsilat1.000 ₺',
        'Yapılan Masraf': `Yapılan Masraf${NOT_CONNECTED_CARD}`,
        'Masraf Talebi': 'Masraf Talebi1.431,1 ₺Ödenen: 0 ₺',
        'Müvekkil Bakiye': `Müvekkil Bakiye${NOT_CONNECTED_CARD}`,
      });
    }, WAIT);

    for (const testId of ['finance-actual-expense-unavailable', 'finance-client-balance-unavailable']) {
      const notice = screen.getByTestId(testId);
      expect(notice.getAttribute('data-source-status')).toBe('NOT_CONNECTED');
      expect(notice.className).not.toMatch(/emerald|red|green/);
      expect(notice.parentElement?.className).not.toMatch(/emerald|red|green/);
    }
    expect(screen.queryByTestId('finance-client-balance')).toBeNull();
    expect(screen.queryByTestId('finance-actual-expense-total')).toBeNull();
  });

  it('GERÇEK SIFIR: hareketsiz dosyada bağlı kartlar "0 ₺" yazar; bağlanmamış kartlar yine sayı yazmaz', async () => {
    mountCase();
    await deckSourcesLoaded();

    openFinanceTab();
    await waitFor(() => {
      const finance = financeView();
      expect(finance.cards).toEqual({
        Tahsilat: 'Tahsilat0 ₺',
        'Yapılan Masraf': `Yapılan Masraf${NOT_CONNECTED_CARD}`,
        'Masraf Talebi': 'Masraf Talebi0 ₺Ödenen: 0 ₺',
        'Müvekkil Bakiye': `Müvekkil Bakiye${NOT_CONNECTED_CARD}`,
      });
    }, WAIT);
  });

  it('USD dosya: tahsilat kendi para birimiyle yazılır (#2875); bağlanmamış kartlar "₺" ile sıfır yazmaz', async () => {
    mountCaseWithFinancialActivity('USD');
    await deckSourcesLoaded();

    openFinanceTab();
    await waitFor(() => {
      const finance = financeView();
      expect(finance.cards).toEqual({
        Tahsilat: 'Tahsilat1.000 USD',
        'Yapılan Masraf': `Yapılan Masraf${NOT_CONNECTED_CARD}`,
        'Masraf Talebi': 'Masraf Talebi1.431,1 ₺Ödenen: 0 ₺',
        'Müvekkil Bakiye': `Müvekkil Bakiye${NOT_CONNECTED_CARD}`,
      });
      expect(finance.recent).toEqual(['Tahsilat | +1.000 USD']);
    }, WAIT);
  });

  it('"Son İşlemler": tahsilat satırı aynen; masraf hareketlerinin bağlı olmadığı yazılır', async () => {
    mountCaseWithFinancialActivity('TRY');
    await deckSourcesLoaded();

    openFinanceTab();
    await waitFor(() => {
      const finance = financeView();
      expect(finance.recent).toEqual(['Tahsilat | +1.000 ₺']);
      expect(finance.recentNote).toBe('Yapılan masraf hareketleri henüz bu ekrana bağlanmadı; bu liste yalnız tahsilatları gösterir.');
    }, WAIT);
  });

  it('"Son İşlemler": tahsilatı olmayan dosyada "Henüz işlem yok" denmez', async () => {
    mountCase();
    await deckSourcesLoaded();

    openFinanceTab();
    await waitFor(() => {
      const finance = financeView();
      expect(finance.recent).toEqual(['Henüz tahsilat yok']);
      expect(finance.recentNote).toBe('Yapılan masraf hareketleri henüz bu ekrana bağlanmadı; bu liste yalnız tahsilatları gösterir.');
    }, WAIT);
    expect(screen.queryByText('Henüz işlem yok')).toBeNull();
  });
});

describe('Yükleme / hata — bağlı kaynağın durumu bağlanmamış alanın durumuyla karışmaz', () => {
  it('HATA: masraf talebi okunamazsa hata bandı görünür; bağlanmamış kartlar "okunamadı" değil "bağlanmadı" yazar', async () => {
    mountCase({ collections: [collection('c1', '1000', 'TRY')] }, () => {
      mocked.getExpenseThreeViewForCase.mockRejectedValue(new Error('Sunucu hatası'));
    });
    await deckSourcesLoaded();

    await waitFor(() => {
      const alerts = Array.from(document.querySelectorAll('[role="alert"]')).map((el) => norm(el.textContent));
      expect(alerts.some((text) => text.includes('Görev/talep/finans listelerinde masraf kalemleri eksik olabilir.'))).toBe(true);
    }, WAIT);

    fireEvent.click(deckTab('Finans'));
    expect(screen.getByTestId('finance-actual-expense-unavailable').getAttribute('data-source-status')).toBe('NOT_CONNECTED');
    expect(screen.getByTestId('finance-client-balance-unavailable').getAttribute('data-source-status')).toBe('NOT_CONNECTED');
    expect(norm(screen.getByTestId('finance-actual-expense-unavailable').textContent)).toBe(NOT_CONNECTED_CARD);
    expect(norm(screen.getByTestId('finance-client-balance-unavailable').textContent)).toBe(NOT_CONNECTED_CARD);
  });

  it('YÜKLEME: masraf talebi okuması sürerken bağlanmamış kartlar "yükleniyor" değil "bağlanmadı" yazar', async () => {
    mountCase({ collections: [collection('c1', '1000', 'TRY')] }, () => {
      mocked.getExpenseThreeViewForCase.mockReturnValue(new Promise(() => {}));
    });
    await waitFor(() => deckTab('Finans'), WAIT);
    await waitFor(() => expect(mocked.getExpenseThreeViewForCase).toHaveBeenCalled(), WAIT);

    fireEvent.click(deckTab('Finans'));
    expect(screen.getByTestId('finance-actual-expense-unavailable').getAttribute('data-source-status')).toBe('NOT_CONNECTED');
    expect(screen.getByTestId('finance-client-balance-unavailable').getAttribute('data-source-status')).toBe('NOT_CONNECTED');
  });

  it('HATA: dağıtım kayıtları okunamazsa "Dağıtım & Mutabakat" sekmesi "kayıt yok" demez (mevcut davranış korunur)', async () => {
    mountCase({ collections: [collection('c1', '1000', 'TRY')] }, () => {
      mocked.getCollectionDispositionsByCase.mockRejectedValue(new Error('Sunucu hatası'));
    });
    await deckSourcesLoaded();

    await waitFor(() => {
      const alerts = Array.from(document.querySelectorAll('[role="alert"]')).map((el) => norm(el.textContent));
      expect(alerts.some((text) => text.includes('Toplam/dağıtım görünümü eksik olabilir.'))).toBe(true);
    }, WAIT);
    fireEvent.click(deckTab('Dağıtım & Mutabakat'));
    expect(screen.queryByText('Bu dosyada henüz dağıtım/mutabakat kaydı yok.')).toBeNull();
    expect(screen.queryByText('Tahsilat finans özetinde görünüyor; dağıtım/mutabakat kaydı henüz oluşturulmamış.')).toBeNull();
  });
});

describe('"UYAP Sorgu" ve "İlişkili" sekmeleri — okunmayan kayıt için "yok" denmez', () => {
  it('"UYAP Sorgu": bağlantının hazır olmadığı yazılır; işlem yapmayan "Hızlı Sorgu" düğmeleri yoktur', async () => {
    mountCaseWithFinancialActivity('TRY');
    await deckSourcesLoaded();

    expect(badgeOf('UYAP Sorgu')).toBeNull();
    fireEvent.click(deckTab('UYAP Sorgu'));

    const notice = screen.getByTestId('uyap-queries-unavailable');
    expect(notice.getAttribute('data-source-status')).toBe('NOT_CONNECTED');
    expect(norm(notice.textContent)).toBe(
      'UYAP sorgu kayıtlarının bu ekrana bağlantısı henüz hazır değil.Bu, sorgu yapılmadığı anlamına gelmez.',
    );
    expect(screen.queryByText('Henüz sorgu yapılmamış')).toBeNull();
    expect(screen.queryByText('Hızlı Sorgu')).toBeNull();
    for (const label of ['SGK Sorgusu', 'Tapu Sorgusu', 'Araç Sorgusu', 'Banka Sorgusu', 'Mernis Sorgusu']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
    // Sekme hiçbir UYAP sorgusu başlatmaz, kayıt da okumaz
    expect(mocked.createUyapQuery).not.toHaveBeenCalled();
    expect(mocked.getUyapQueriesForDebtor).not.toHaveBeenCalled();
  });

  it('"İlişkili": bağlantının hazır olmadığı yazılır; "İlişkili dosya yok" denmez', async () => {
    mountCaseWithFinancialActivity('TRY');
    await deckSourcesLoaded();

    expect(badgeOf('İlişkili')).toBeNull();
    fireEvent.click(deckTab('İlişkili'));

    const notice = screen.getByTestId('related-cases-unavailable');
    expect(notice.getAttribute('data-source-status')).toBe('NOT_CONNECTED');
    expect(norm(notice.textContent)).toBe(
      'İlişkili dosyaların bu ekrana bağlantısı henüz hazır değil.Bu, ilişkili dosya bulunmadığı anlamına gelmez.',
    );
    expect(screen.queryByText('İlişkili dosya yok')).toBeNull();
    expect(notice.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('Sınır — bu düzeltme yeni veri kaynağı bağlamaz', () => {
  it('sayfa bakiye / defter / ödenecek tutar uçlarını çağırmaz (GET /cases/:id/balance okurken yazdığı için özellikle)', async () => {
    mountCaseWithFinancialActivity('TRY');
    await deckSourcesLoaded();
    openFinanceTab();
    await waitFor(() => expect(financeView().cards.Tahsilat).toBe('Tahsilat1.000 ₺'), WAIT);
    fireEvent.click(deckTab('UYAP Sorgu'));
    fireEvent.click(deckTab('İlişkili'));
    fireEvent.click(deckTab('Dağıtım & Mutabakat'));

    expect(mocked.getCaseBalance).not.toHaveBeenCalled();
    expect(mocked.getCaseBalanceLedger).not.toHaveBeenCalled();
    // Bakıldığının kanıtı: alt bileşenlerin istekleri kaydedildi (ör. hesap özeti), ama hiçbiri bu uçlara gitmedi
    expect(fetchUrls.length).toBeGreaterThan(0);
    expect(fetchUrls.filter((url) => /\/balance(\/|\?|$)|\/outstanding|\/accounting\//.test(url))).toEqual([]);
  });
});
