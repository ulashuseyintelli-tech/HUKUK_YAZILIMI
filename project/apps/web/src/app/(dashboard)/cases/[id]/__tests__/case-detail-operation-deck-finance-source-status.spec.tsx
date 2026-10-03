import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import * as apiModule from '@/lib/api';

/**
 * DOSYA ÇALIŞMA ALANI — OperationDeck "Finans" sekmesinde gerçek kaynağa BAĞLI alanlar (tahsilat, masraf talebi)
 * okunmadan / okunamamışken sıfır ya da "kayıt yok" yazmaz.
 *
 * Kusur (bu sayfa düzeniyle ölçüldü, main 6681b1d5 ve 8727e5d2; ikişer koşu):
 *  - tahsilat okuması sürerken, hata verdiğinde ve gerçekten kayıt yokken sekme AYNI metni yazıyordu:
 *    "Tahsilat 0 ₺ · Masraf Talebi 0 ₺ Ödenen: 0 ₺ · Henüz tahsilat yok";
 *  - sunucuda 1.000 ₺ tahsilat / 750 ₺ masraf talebi olan dosyada da okuma bitmeden ya da düşünce aynı sıfırlar;
 *  - tahsilat yanıtı gelmiş olsa bile aynı okumadaki alacak kalemi / dağıtım okuması bekliyorsa "Tahsilat 0 ₺";
 *  - yenileme düştüğünde eski tutar hiçbir uyarı olmadan ekranda kalıyordu.
 *
 * Kural (owner kararı 2026-10-02): iki kaynağın durumu AYRI taşınır; ilk okuma tamamlanmadan READY / boş / 0 kabul
 * edilmez (kartta "Yükleniyor…", hatada "Bu bilgi okunamadı"; liste açıklaması kaynağı adıyla söyler); sekmede ilgili
 * kaynağı YENİDEN OKUYAN "Tekrar dene" bulunur (yazma işlemi tetiklemez). AYNI dosya ve AYNI para birimi bağlamındaki
 * son başarılı veri yenileme sırasında kalabilir ama güncel / hatasızmış gibi sunulmaz ("Güncelleniyor…" /
 * "Güncellenemedi; son başarılı veri gösteriliyor"). Başka dosyaya geçildiğinde önceki dosyanın tutarı gösterilmez;
 * geç gelen eski yanıt yeni veriyi ezmez. Başarılı okuma gerçekten boşsa önceki sıfır ve boş liste gösterimi aynen kalır.
 *
 * Bu karar, Finans sekmesinde okuma hatasında "0 ₺ + üstte hata bandı" kabulünün (WSMR-A4-AB-2) yerine geçer; üstteki
 * bant yerinde kalır. Tahsilat, alacak kalemi ve dağıtım okumasıyla birlikte beklendiği için o ortak okuma bitmeden
 * tahsilat kaynağı "okundu" sayılmaz (veri yükleme düzeni değiştirilmedi).
 */

const nav = vi.hoisted(() => ({ caseId: 'case-1' }));

vi.mock('@/lib/api', () => {
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn().mockResolvedValue([]);
      return registry[prop];
    },
  };
  return { api: new Proxy({}, handler), __registry: registry };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: nav.caseId }),
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => `/cases/${nav.caseId}`,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' }, loading: false }),
}));

type ApiMock = ReturnType<typeof vi.fn>;
const mocked = (apiModule as unknown as { api: Record<string, ApiMock> }).api;
const registry = (apiModule as unknown as { __registry: Record<string, ApiMock> }).__registry;

// Tam paralel regresyonda sayfa render'ı CPU rekabetine girer — bekleme süresi geniş tutulur.
// Test süresi beklemeden UZUN olmalı: aksi halde düşen iddia "beklenen / ekrandaki" farkı yerine zaman aşımı yazar.
const WAIT = { timeout: 8_000 };
vi.setConfig({ testTimeout: 40_000 });

type Rec = Record<string, unknown>;

// ───────────────────────────── okuma düzeni ─────────────────────────────

type OkumaDurumu = 'cagrilmadi' | 'bekliyor' | 'basarili' | 'hata';
type OkumaKaydi = { cagri: number; durum: OkumaDurumu; argumanlar: unknown[][] };
let okumalar: Record<string, OkumaKaydi> = {};

type Yanit = (...args: unknown[]) => Promise<unknown>;
const tamam = (value: unknown): Yanit => () => Promise.resolve(value);
const hata = (message = 'Sunucu hatası'): Yanit => () => Promise.reject(new Error(message));
const yanitsiz: Yanit = () => new Promise<unknown>(() => {});

function ertelenmis() {
  let coz: (value: unknown) => void = () => {};
  let reddet: (error: Error) => void = () => {};
  const promise = new Promise<unknown>((resolve, reject) => {
    coz = resolve;
    reddet = reject;
  });
  const yanit: Yanit = () => promise;
  return {
    yanit,
    coz: (value: unknown) =>
      act(async () => {
        coz(value);
      }),
    reddet: (message = 'Sunucu hatası') =>
      act(async () => {
        reddet(new Error(message));
      }),
  };
}

/** Okumayı izlenen yanıtlarla saplar: n. çağrı n. yanıtı (yoksa sonuncuyu) alır. */
function izle(name: string, ...yanitlar: Yanit[]) {
  const kayit: OkumaKaydi = { cagri: 0, durum: 'cagrilmadi', argumanlar: [] };
  okumalar[name] = kayit;
  mocked[name].mockImplementation((...args: unknown[]) => {
    const sira = kayit.cagri;
    const yanit = yanitlar[Math.min(sira, yanitlar.length - 1)];
    kayit.cagri += 1;
    kayit.argumanlar.push(args);
    kayit.durum = 'bekliyor';
    const promise = yanit(...args);
    const bitti = (durum: OkumaDurumu) => {
      if (sira === kayit.cagri - 1) kayit.durum = durum;
    };
    promise.then(
      () => bitti('basarili'),
      () => bitti('hata'),
    );
    return promise;
  });
}

const dosya = (id: string, currency = 'TRY'): Rec => ({
  id,
  fileNumber: id === 'case-1' ? '2026/1' : '2026/2',
  currency,
  ...(currency === 'TRY' ? {} : { subCategory: 'DOVIZ' }),
  principalAmount: '10000',
  debtors: [],
  caseClients: [],
  lawyers: [],
  claimItems: [],
});

const kalem = (id = 'd1', currency = 'TRY'): Rec => ({
  id,
  type: 'PRINCIPAL',
  description: 'Asıl alacak',
  amount: '10000',
  currency,
  dueDate: '2026-01-15T12:00:00.000Z',
});

const tahsilat = (id: string, amount: string, currency = 'TRY', description = 'Banka tahsilatı'): Rec => ({
  id,
  type: 'TAHSILAT',
  channel: 'BANKA',
  amount,
  currency,
  date: '2026-03-01T12:00:00.000Z',
  status: 'CONFIRMED',
  allocationHold: null,
  description,
});

/** GET /expense-requests/case/:caseId/three-view öğesi. */
const masrafTalebi = (id: string, total: number, paid: number, description = 'Takip Açılış Masrafları'): Rec => ({
  task: { id, title: 'Müvekkilden Takip açılış masrafları talep edildi', status: 'BEKLIYOR', priority: 'HIGH' },
  finance: {
    id,
    type: 'MASRAF_TALEP',
    date: '2026-02-01T12:00:00.000Z',
    description,
    status: paid > 0 ? 'PARTIAL' : 'PENDING',
    totalAmount: total,
    paidAmount: paid,
    remainingAmount: total - paid,
    items: [],
    payments: [],
  },
  clientRequest: { id, content: description, amount: total, status: paid > 0 ? 'KISMI' : 'BEKLIYOR', createdAt: '2026-02-01T12:00:00.000Z' },
});

type Kurulum = {
  dosyalar?: Yanit[];
  kalemler?: Yanit[];
  tahsilatlar?: Yanit[];
  dagitimlar?: Yanit[];
  masrafUclu?: Yanit[];
};

const TAHSILAT_1000 = [tahsilat('c1', '1000')];
const MASRAF_750 = [masrafTalebi('exp-1', 750, 250)];
/** Kayıtlı dosya: 1.000 TRY tahsilat; 750 toplam / 250 ödenen masraf talebi. */
const DOLU: Kurulum = { kalemler: [tamam([kalem()])], tahsilatlar: [tamam(TAHSILAT_1000)], masrafUclu: [tamam(MASRAF_750)] };

function kur(k: Kurulum = {}) {
  izle('getCase', ...(k.dosyalar ?? [(id) => Promise.resolve(dosya(id as string))]));
  izle('getCaseDues', ...(k.kalemler ?? [tamam([])]));
  izle('getCaseCollections', ...(k.tahsilatlar ?? [tamam([])]));
  izle('getCollectionDispositionsByCase', ...(k.dagitimlar ?? [tamam([])]));
  izle('getExpenseThreeViewForCase', ...(k.masrafUclu ?? [tamam([])]));
  mocked.getCaseDebtors.mockResolvedValue({ summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 }, items: [] });
  mocked.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
  mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  mocked.getActiveCaseFeeAgreement.mockResolvedValue(null);
  mocked.getCaseResponsibilityAt.mockResolvedValue({
    caseId: 'case-1',
    asOf: '2026-03-10T00:00:00.000Z',
    operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' },
    legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' },
    horizon: {},
  });
  mocked.getCaseResponsibilityHistory.mockResolvedValue({ caseId: 'case-1', from: null, to: null, events: [], horizon: {} });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sayfa = () => (
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>
  );
  const view = render(sayfa());
  return { yenidenCiz: () => view.rerender(sayfa()) };
}

// ───────────────────────────── saf okuyucular (DOM'u DEĞİŞTİRMEZ; waitFor içinde güvenle çağrılır) ─────────────────────────────

const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** OperationDeck sekme düğmesi: yazısı etiketin kendisi (+ varsa rozet sayısı). Tek değilse hata fırlatır. */
function deckTab(label: string): HTMLElement {
  const hits = Array.from(document.querySelectorAll('button')).filter((b) =>
    new RegExp(`^${label}(\\d+)?$`).test(norm(b.textContent)),
  );
  if (hits.length !== 1) throw new Error(`"${label}" sekme düğmesi tek değil: ${hits.length}`);
  return hits[0] as HTMLElement;
}

/** AÇIK Finans sekmesinin içeriği. Sekme açık değilse hata fırlatır. */
function financePanel(): HTMLElement {
  const heading = Array.from(document.querySelectorAll('p')).find((p) => norm(p.textContent) === 'Son İşlemler');
  const panel = heading?.parentElement?.parentElement;
  if (!panel) throw new Error('Finans sekmesi açık değil');
  return panel as HTMLElement;
}

const testId = (root: ParentNode, id: string) => root.querySelector(`[data-testid="${id}"]`);

/** Açıklama kutusunun metni ("Tekrar dene" düğmesinin yazısı hariç); kutu yoksa null. */
function aciklama(root: ParentNode, id: string): string | null {
  const notice = testId(root, id);
  if (!notice) return null;
  const retry = notice.querySelector('button');
  return norm(retry ? (notice.textContent ?? '').replace(retry.textContent ?? '', '') : notice.textContent);
}

type FinanceView = {
  tahsilat: string;
  tahsilatDurumu: string;
  masrafTalebi: string;
  masrafTalebiDurumu: string;
  sonIslemler: string[];
  tahsilatAciklamasi: string | null;
  masrafTalepleri: string[] | null;
  masrafTalebiAciklamasi: string | null;
};

/** Bağlı iki kaynağın Finans sekmesindeki tüm gösterimi. Durum: karttaki `data-source-status`, yoksa READY. */
function financeView(panel: HTMLElement = financePanel()): FinanceView {
  const cards = Array.from(panel.children[0].children);
  if (cards.length !== 4) throw new Error(`Finans sekmesinde 4 kart bekleniyordu: ${cards.length}`);
  const durum = (card: Element) => card.querySelector('[data-source-status]')?.getAttribute('data-source-status') ?? 'READY';
  const list = Array.from(panel.querySelectorAll('p')).find((p) => norm(p.textContent) === 'Son İşlemler')?.nextElementSibling;
  if (!list) throw new Error('"Son İşlemler" listesi bulunamadı');
  const sonIslemler = Array.from(list.children).map((row) => {
    const amount = row.children[1]?.children[0];
    return amount ? `${norm(row.children[0]?.textContent)} | ${norm(amount.textContent)}` : norm(row.textContent);
  });
  const talepBasligi = Array.from(panel.querySelectorAll('p')).find((p) => norm(p.textContent) === 'Masraf Talepleri');
  const masrafTalepleri = talepBasligi?.parentElement
    ? Array.from(talepBasligi.parentElement.querySelectorAll('span.text-sm.font-medium')).map((el) => norm(el.textContent))
    : null;
  return {
    tahsilat: norm(cards[0].textContent),
    tahsilatDurumu: durum(cards[0]),
    masrafTalebi: norm(cards[2].textContent),
    masrafTalebiDurumu: durum(cards[2]),
    sonIslemler,
    tahsilatAciklamasi: aciklama(panel, 'finance-recent-collections-notice'),
    masrafTalepleri,
    masrafTalebiAciklamasi: aciklama(panel, 'finance-expense-requests-notice'),
  };
}

function kutu(title: 'Alacak Kalemleri' | 'Ödemeler'): string {
  const heading = Array.from(document.querySelectorAll('h4')).find((h) => norm(h.textContent) === title);
  return norm(heading?.parentElement?.parentElement?.children[1]?.textContent);
}

const uyarilar = () => Array.from(document.querySelectorAll('[role="alert"]')).map((el) => norm(el.textContent));

// Beklenen gösterimler
const TAHSILAT_BOS = { tahsilat: 'Tahsilat0 ₺', tahsilatDurumu: 'READY', sonIslemler: ['Henüz tahsilat yok'], tahsilatAciklamasi: null };
const TAHSILAT_DOLU = { tahsilat: 'Tahsilat1.000 ₺', tahsilatDurumu: 'READY', sonIslemler: ['Banka tahsilatı | +1.000 ₺'], tahsilatAciklamasi: null };
const TAHSILAT_YUKLENIYOR = { tahsilat: 'TahsilatYükleniyor…', tahsilatDurumu: 'LOADING', sonIslemler: [], tahsilatAciklamasi: 'Tahsilatlar yükleniyor…' };
const TAHSILAT_OKUNAMADI = {
  tahsilat: 'TahsilatBu bilgi okunamadı',
  tahsilatDurumu: 'ERROR',
  sonIslemler: [],
  tahsilatAciklamasi: 'Tahsilatlar okunamadı. Bu, tahsilat bulunmadığı anlamına gelmez.',
};
const MASRAF_BOS = { masrafTalebi: 'Masraf Talebi0 ₺Ödenen: 0 ₺', masrafTalebiDurumu: 'READY', masrafTalepleri: null, masrafTalebiAciklamasi: null };
const MASRAF_DOLU = {
  masrafTalebi: 'Masraf Talebi750 ₺Ödenen: 250 ₺',
  masrafTalebiDurumu: 'READY',
  masrafTalepleri: ['Takip Açılış Masrafları'],
  masrafTalebiAciklamasi: null,
};
const MASRAF_YUKLENIYOR = {
  masrafTalebi: 'Masraf TalebiYükleniyor…',
  masrafTalebiDurumu: 'LOADING',
  masrafTalepleri: [],
  masrafTalebiAciklamasi: 'Masraf talepleri yükleniyor…',
};
const MASRAF_OKUNAMADI = {
  masrafTalebi: 'Masraf TalebiBu bilgi okunamadı',
  masrafTalebiDurumu: 'ERROR',
  masrafTalepleri: [],
  masrafTalebiAciklamasi: 'Masraf talepleri okunamadı. Bu, masraf talebi bulunmadığı anlamına gelmez.',
};

// ───────────────────────────── etkileşim (waitFor DIŞINDA, birer kez) ─────────────────────────────

async function okumalariBekle(beklenen: Record<string, OkumaDurumu>, cagri: Record<string, number> = {}) {
  await waitFor(() => {
    for (const [name, durum] of Object.entries(beklenen)) {
      const kayit = okumalar[name];
      if (!kayit || kayit.durum !== durum) {
        throw new Error(`${name}: beklenen ${durum}, şimdi ${kayit?.durum ?? 'yok'} (çağrı ${kayit?.cagri ?? 0})`);
      }
    }
    for (const [name, adet] of Object.entries(cagri)) {
      if ((okumalar[name]?.cagri ?? 0) !== adet) throw new Error(`${name}: beklenen çağrı ${adet}, şimdi ${okumalar[name]?.cagri ?? 0}`);
    }
  }, WAIT);
}

/** Finans sekmesini bir kez açar (iddialar açık sekme üzerinde `financeView()` ile okunur). */
async function finansSekmesiniAc() {
  await waitFor(() => deckTab('Finans'), WAIT);
  fireEvent.click(deckTab('Finans'));
  await waitFor(() => financePanel(), WAIT);
}

const gorunumuBekle = (beklenen: Partial<FinanceView>) =>
  waitFor(() => expect(financeView()).toMatchObject(beklenen), WAIT);

const tumGorunumuBekle = (beklenen: FinanceView) => waitFor(() => expect(financeView()).toEqual(beklenen), WAIT);

function yenileyeBas() {
  const button = document.querySelector('button[title="Yenile"]');
  if (!button) throw new Error('"Yenile" düğmesi bulunamadı');
  fireEvent.click(button);
}

const TUM_BASARILI: Record<string, OkumaDurumu> = {
  getCase: 'basarili',
  getCaseDues: 'basarili',
  getCaseCollections: 'basarili',
  getCollectionDispositionsByCase: 'basarili',
  getExpenseThreeViewForCase: 'basarili',
};

/** Bir eylemin tetiklediği API çağrıları: ad → eylem sırasında artan çağrı sayısı. */
function cagriSayaci() {
  const once = Object.fromEntries(Object.entries(registry).map(([name, fn]) => [name, fn.mock.calls.length]));
  return () =>
    Object.fromEntries(
      Object.entries(registry)
        .map(([name, fn]) => [name, fn.mock.calls.length - (once[name] ?? 0)] as const)
        .filter(([, artis]) => artis > 0),
    );
}

let fetchStub: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  nav.caseId = 'case-1';
  okumalar = {};
  // Sayfanın alt bileşenleri (ör. hesap özeti) kendi istemcisiyle ağa çıkar. Test yerelde çalışan bir API'ye istek
  // atmasın diye yanıt hiç dönmez: o bileşenler "yükleniyor" durumunda kalır; bu test onları ölçmez.
  fetchStub = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetchStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// =================================================================================================================

describe('İlk okuma — başarılı boş, yükleniyor ve hata birbirinden ayrılır', () => {
  it('BAŞARILI BOŞ: tüm okumalar bitti, kayıt yok → önceki gösterim aynen ("0 ₺", "Henüz tahsilat yok")', async () => {
    kur();
    await okumalariBekle(TUM_BASARILI);
    await finansSekmesiniAc();

    await tumGorunumuBekle({ ...TAHSILAT_BOS, ...MASRAF_BOS });
    expect(testId(financePanel(), 'finance-collections-retry')).toBeNull();
    expect(testId(financePanel(), 'finance-expense-requests-retry')).toBeNull();
    expect(uyarilar()).toEqual([]);
  });

  it('YÜKLENİYOR (tahsilat): sıfır ve "Henüz tahsilat yok" yazılmaz; yanıt gelince gerçek değer yazılır', async () => {
    const tahsilatOkumasi = ertelenmis();
    kur({ tahsilatlar: [tahsilatOkumasi.yanit] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'bekliyor' });
    await finansSekmesiniAc();

    // Masraf talebi okundu (gerçekten boş): kendi kartı sıfırını yazar — iki kaynak bağımsız
    await tumGorunumuBekle({ ...TAHSILAT_YUKLENIYOR, ...MASRAF_BOS });
    expect(norm(financePanel().textContent)).not.toContain('Henüz tahsilat yok');
    expect(testId(financePanel(), 'finance-collections-retry')).toBeNull();

    await tahsilatOkumasi.coz(TAHSILAT_1000);
    await tumGorunumuBekle({ ...TAHSILAT_DOLU, ...MASRAF_BOS });
  });

  it('HATA (tahsilat): "Bu bilgi okunamadı"; liste açıklaması kaynağı adıyla söyler ve "Tekrar dene" sunar', async () => {
    kur({ tahsilatlar: [hata()] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'hata' });
    await finansSekmesiniAc();

    await tumGorunumuBekle({ ...TAHSILAT_OKUNAMADI, ...MASRAF_BOS });
    expect(norm(testId(financePanel(), 'finance-collections-retry')?.textContent)).toBe('Tekrar dene');
    expect(testId(financePanel(), 'finance-expense-requests-retry')).toBeNull();
  });

  it('HATA (masraf talebi): "0 ₺" yazılmaz — "Bu bilgi okunamadı"; üstteki hata bandı yerinde kalır', async () => {
    kur({ masrafUclu: [hata()] });
    await okumalariBekle({ ...TUM_BASARILI, getExpenseThreeViewForCase: 'hata' });
    await finansSekmesiniAc();

    await tumGorunumuBekle({ ...TAHSILAT_BOS, ...MASRAF_OKUNAMADI });
    expect(norm(testId(financePanel(), 'finance-expense-requests-retry')?.textContent)).toBe('Tekrar dene');
    expect(testId(financePanel(), 'finance-collections-retry')).toBeNull();
    expect(uyarilar().some((text) => text.includes('Görev/talep/finans listelerinde masraf kalemleri eksik olabilir.'))).toBe(true);
  });

  it('YÜKLENİYOR (masraf talebi): sıfır yazılmaz; yanıt gelince gerçek değer yazılır', async () => {
    const masrafOkumasi = ertelenmis();
    kur({ masrafUclu: [masrafOkumasi.yanit] });
    await okumalariBekle({ ...TUM_BASARILI, getExpenseThreeViewForCase: 'bekliyor' });
    await finansSekmesiniAc();

    await tumGorunumuBekle({ ...TAHSILAT_BOS, ...MASRAF_YUKLENIYOR });
    expect(testId(financePanel(), 'finance-expense-requests-retry')).toBeNull();

    await masrafOkumasi.coz(MASRAF_750);
    await tumGorunumuBekle({ ...TAHSILAT_BOS, ...MASRAF_DOLU });
  });

});

describe('İki kaynak bağımsız — dolu tahsilat / boş masraf talebi ve tersi', () => {
  it('tahsilat dolu, masraf talebi gerçekten boş', async () => {
    kur({ tahsilatlar: [tamam(TAHSILAT_1000)] });
    await okumalariBekle(TUM_BASARILI);
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_DOLU, ...MASRAF_BOS });
  });

  it('tahsilat gerçekten boş, masraf talebi dolu', async () => {
    kur({ masrafUclu: [tamam(MASRAF_750)] });
    await okumalariBekle(TUM_BASARILI);
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_BOS, ...MASRAF_DOLU });
  });

  it('tahsilat dolu, masraf talebi okunamadı: tahsilat yazılır, masraf talebi sıfır yazmaz', async () => {
    kur({ ...DOLU, masrafUclu: [hata()] });
    await okumalariBekle({ ...TUM_BASARILI, getExpenseThreeViewForCase: 'hata' });
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_DOLU, ...MASRAF_OKUNAMADI });
  });

  it('masraf talebi dolu, tahsilat okunamadı: masraf talebi yazılır, tahsilat sıfır yazmaz', async () => {
    kur({ ...DOLU, tahsilatlar: [hata()] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'hata' });
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_OKUNAMADI, ...MASRAF_DOLU });
  });

  it('masraf talebi dolu, tahsilat yükleniyor; tahsilat dolu, masraf talebi yükleniyor', async () => {
    kur({ ...DOLU, tahsilatlar: [yanitsiz] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'bekliyor' });
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_YUKLENIYOR, ...MASRAF_DOLU });
    cleanup();

    kur({ ...DOLU, masrafUclu: [yanitsiz] });
    await okumalariBekle({ ...TUM_BASARILI, getExpenseThreeViewForCase: 'bekliyor' });
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_DOLU, ...MASRAF_YUKLENIYOR });
  });
});

describe('Ortak okuma — tahsilat, alacak kalemi ve dağıtım okumasıyla birlikte bekler', () => {
  it('tahsilat yanıtı GELDİ ama alacak kalemi okuması sürüyor: veri kullanıma hazır değil → READY denmez, tutar yazılmaz', async () => {
    kur({ ...DOLU, kalemler: [yanitsiz] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseDues: 'bekliyor' });
    await finansSekmesiniAc();

    await tumGorunumuBekle({ ...TAHSILAT_YUKLENIYOR, ...MASRAF_DOLU });
    expect(norm(financePanel().textContent)).not.toContain('1.000');
  });

  it('tahsilat yanıtı GELDİ ama dağıtım okuması sürüyor: READY denmez', async () => {
    kur({ ...DOLU, dagitimlar: [yanitsiz] });
    await okumalariBekle({ ...TUM_BASARILI, getCollectionDispositionsByCase: 'bekliyor' });
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_YUKLENIYOR, ...MASRAF_DOLU });
  });

  it('tahsilat yanıtı GELDİ ama alacak kalemi okuması düştü: ortak okuma başarısız → "okunamadı", tutar yazılmaz', async () => {
    kur({ ...DOLU, kalemler: [hata()] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseDues: 'hata' });
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_OKUNAMADI, ...MASRAF_DOLU });
  });

  it('dağıtım okuması düştü: tahsilat kullanıma hazır → READY; dağıtım hatası kendi bandında', async () => {
    kur({ ...DOLU, dagitimlar: [hata()] });
    await okumalariBekle({ ...TUM_BASARILI, getCollectionDispositionsByCase: 'hata' });
    await finansSekmesiniAc();

    await tumGorunumuBekle({ ...TAHSILAT_DOLU, ...MASRAF_DOLU });
    expect(uyarilar().some((text) => text.includes('Toplam/dağıtım görünümü eksik olabilir.'))).toBe(true);
  });
});

describe('Sekmedeki "Tekrar dene" — ilgili kaynağı yeniden okur, yazma işlemi tetiklemez', () => {
  it('tahsilat: hata → "Tekrar dene" → başarılı okuma: hata temizlenir, yeni değer yazılır; yalnız üç okuma çağrılır', async () => {
    kur({ ...DOLU, tahsilatlar: [hata(), tamam(TAHSILAT_1000)] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'hata' });
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_OKUNAMADI, ...MASRAF_DOLU });

    const eylemdekiCagrilar = cagriSayaci();
    const fetchOnce = fetchStub.mock.calls.length;
    fireEvent.click(testId(financePanel(), 'finance-collections-retry') as Element);
    await okumalariBekle(TUM_BASARILI, { getCaseCollections: 2 });

    await tumGorunumuBekle({ ...TAHSILAT_DOLU, ...MASRAF_DOLU });
    expect(testId(financePanel(), 'finance-collections-retry')).toBeNull();
    // Yalnız tahsilatın bağlı olduğu ortak okuma yeniden yapıldı; başka okuma ya da yazma çağrısı yok
    expect(eylemdekiCagrilar()).toEqual({ getCaseDues: 1, getCaseCollections: 1, getCollectionDispositionsByCase: 1 });
    expect(fetchStub.mock.calls.length).toBe(fetchOnce);
    // Kutulardaki hata da aynı okumayla temizlendi
    expect(kutu('Ödemeler')).not.toContain('Finans verileri yüklenemedi');
  });

  it('tahsilat: "Tekrar dene" sürerken "Yükleniyor…"; yine düşerse "okunamadı" geri gelir', async () => {
    const ikinciOkuma = ertelenmis();
    kur({ tahsilatlar: [hata(), ikinciOkuma.yanit] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'hata' });
    await finansSekmesiniAc();
    await gorunumuBekle(TAHSILAT_OKUNAMADI);

    fireEvent.click(testId(financePanel(), 'finance-collections-retry') as Element);
    await gorunumuBekle(TAHSILAT_YUKLENIYOR);

    await ikinciOkuma.reddet();
    await gorunumuBekle(TAHSILAT_OKUNAMADI);
  });

  it('masraf talebi: hata → "Tekrar dene" → başarılı okuma; yalnız masraf talebi okuması çağrılır', async () => {
    kur({ ...DOLU, masrafUclu: [hata(), tamam(MASRAF_750)] });
    await okumalariBekle({ ...TUM_BASARILI, getExpenseThreeViewForCase: 'hata' });
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_DOLU, ...MASRAF_OKUNAMADI });

    const eylemdekiCagrilar = cagriSayaci();
    const fetchOnce = fetchStub.mock.calls.length;
    fireEvent.click(testId(financePanel(), 'finance-expense-requests-retry') as Element);
    await okumalariBekle(TUM_BASARILI, { getExpenseThreeViewForCase: 2 });

    await tumGorunumuBekle({ ...TAHSILAT_DOLU, ...MASRAF_DOLU });
    expect(eylemdekiCagrilar()).toEqual({ getExpenseThreeViewForCase: 1 });
    expect(fetchStub.mock.calls.length).toBe(fetchOnce);
    // Üstteki bant da aynı okumayla kalktı
    await waitFor(() => expect(uyarilar().some((text) => text.includes('Masraf görev/talep/finans'))).toBe(false), WAIT);
  });
});

describe('Yenileme — son başarılı veri güncel / hatasızmış gibi sunulmaz', () => {
  it('tahsilat yenilemesi DÜŞTÜ: eski tutar kalır ama "Güncellenemedi; son başarılı veri gösteriliyor" yazılır; tekrar okuma yeni değeri getirir', async () => {
    kur({ ...DOLU, tahsilatlar: [tamam(TAHSILAT_1000), hata(), tamam([tahsilat('c1', '1000'), tahsilat('c2', '500', 'TRY', 'Elden tahsilat')])] });
    await okumalariBekle(TUM_BASARILI);
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_DOLU, ...MASRAF_DOLU });

    yenileyeBas();
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'hata' }, { getCaseCollections: 2, getCase: 2 });
    await finansSekmesiniAc();

    await tumGorunumuBekle({
      tahsilat: 'Tahsilat1.000 ₺Güncellenemedi; son başarılı veri gösteriliyor',
      tahsilatDurumu: 'REFRESH_FAILED',
      sonIslemler: ['Banka tahsilatı | +1.000 ₺'],
      tahsilatAciklamasi: 'Tahsilatlar güncellenemedi; son başarılı veri gösteriliyor.',
      ...MASRAF_DOLU,
    });

    fireEvent.click(testId(financePanel(), 'finance-collections-retry') as Element);
    await okumalariBekle(TUM_BASARILI, { getCaseCollections: 3 });
    await tumGorunumuBekle({
      tahsilat: 'Tahsilat1.500 ₺',
      tahsilatDurumu: 'READY',
      sonIslemler: ['Banka tahsilatı | +1.000 ₺', 'Elden tahsilat | +500 ₺'],
      tahsilatAciklamasi: null,
      ...MASRAF_DOLU,
    });
  });

  it('tahsilat yenilemesi SÜRÜYOR: eski tutar "Güncelleniyor…" notuyla; yanıt gelince yeni değer', async () => {
    const yenileme = ertelenmis();
    kur({ ...DOLU, tahsilatlar: [tamam(TAHSILAT_1000), yenileme.yanit] });
    await okumalariBekle(TUM_BASARILI);

    yenileyeBas();
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'bekliyor' }, { getCaseCollections: 2, getCase: 2 });
    await finansSekmesiniAc();

    await tumGorunumuBekle({
      tahsilat: 'Tahsilat1.000 ₺Güncelleniyor…',
      tahsilatDurumu: 'REFRESHING',
      sonIslemler: ['Banka tahsilatı | +1.000 ₺'],
      tahsilatAciklamasi: 'Tahsilatlar güncelleniyor…',
      ...MASRAF_DOLU,
    });
    expect(testId(financePanel(), 'finance-collections-retry')).toBeNull();

    await yenileme.coz([tahsilat('c1', '2500')]);
    await tumGorunumuBekle({
      tahsilat: 'Tahsilat2.500 ₺',
      tahsilatDurumu: 'READY',
      sonIslemler: ['Banka tahsilatı | +2.500 ₺'],
      tahsilatAciklamasi: null,
      ...MASRAF_DOLU,
    });
  });

  it('masraf talebi yenilemesi DÜŞTÜ: eski tutar ve liste "güncellenemedi" notuyla; tekrar okuma yeni değeri getirir', async () => {
    kur({ ...DOLU, masrafUclu: [tamam(MASRAF_750), hata(), tamam([masrafTalebi('exp-1', 750, 750)])] });
    await okumalariBekle(TUM_BASARILI);

    yenileyeBas();
    await okumalariBekle({ ...TUM_BASARILI, getExpenseThreeViewForCase: 'hata' }, { getExpenseThreeViewForCase: 2, getCase: 2 });
    await finansSekmesiniAc();

    await tumGorunumuBekle({
      ...TAHSILAT_DOLU,
      masrafTalebi: 'Masraf Talebi750 ₺Ödenen: 250 ₺Güncellenemedi; son başarılı veri gösteriliyor',
      masrafTalebiDurumu: 'REFRESH_FAILED',
      masrafTalepleri: ['Takip Açılış Masrafları'],
      masrafTalebiAciklamasi: 'Masraf talepleri güncellenemedi; son başarılı veri gösteriliyor.',
    });

    fireEvent.click(testId(financePanel(), 'finance-expense-requests-retry') as Element);
    await okumalariBekle(TUM_BASARILI, { getExpenseThreeViewForCase: 3 });
    await tumGorunumuBekle({
      ...TAHSILAT_DOLU,
      masrafTalebi: 'Masraf Talebi750 ₺Ödenen: 750 ₺',
      masrafTalebiDurumu: 'READY',
      masrafTalepleri: ['Takip Açılış Masrafları'],
      masrafTalebiAciklamasi: null,
    });
  });

  it('masraf talebi yenilemesi SÜRÜYOR: eski tutar "Güncelleniyor…" notuyla', async () => {
    kur({ ...DOLU, masrafUclu: [tamam(MASRAF_750), yanitsiz] });
    await okumalariBekle(TUM_BASARILI);

    yenileyeBas();
    await okumalariBekle({ ...TUM_BASARILI, getExpenseThreeViewForCase: 'bekliyor' }, { getExpenseThreeViewForCase: 2, getCase: 2 });
    await finansSekmesiniAc();

    await tumGorunumuBekle({
      ...TAHSILAT_DOLU,
      masrafTalebi: 'Masraf Talebi750 ₺Ödenen: 250 ₺Güncelleniyor…',
      masrafTalebiDurumu: 'REFRESHING',
      masrafTalepleri: ['Takip Açılış Masrafları'],
      masrafTalebiAciklamasi: 'Masraf talepleri güncelleniyor…',
    });
  });
});

describe('Geç gelen eski yanıt yeni veriyi ezmez', () => {
  it('aynı dosya: önce başlayan okuma SONRA yanıtlanırsa daha yeni okumanın tutarı ekranda kalır', async () => {
    const eskiOkuma = ertelenmis();
    const yeniOkuma = ertelenmis();
    kur({ tahsilatlar: [eskiOkuma.yanit, yeniOkuma.yanit] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'bekliyor' }, { getCaseCollections: 1 });

    // İlk okuma sürerken sayfa yenilenir: ikinci okuma başlar
    yenileyeBas();
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'bekliyor' }, { getCaseCollections: 2, getCase: 2 });
    await finansSekmesiniAc();
    await gorunumuBekle(TAHSILAT_YUKLENIYOR);

    await yeniOkuma.coz([tahsilat('c1', '1500', 'TRY', 'Güncel tahsilat')]);
    const guncel = { tahsilat: 'Tahsilat1.500 ₺', tahsilatDurumu: 'READY', sonIslemler: ['Güncel tahsilat | +1.500 ₺'], tahsilatAciklamasi: null };
    await gorunumuBekle(guncel);

    // Eski okumanın yanıtı şimdi geliyor: ekrana yazılmaz
    await eskiOkuma.coz([tahsilat('c0', '999', 'TRY', 'Bayat tahsilat')]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(financeView()).toMatchObject(guncel);
    expect(kutu('Ödemeler')).not.toContain('999');
  });

  it('aynı dosya: yeni okuma sürerken eski okuma yanıtlanırsa "yükleniyor" erken kapanmaz ve bayat tutar yazılmaz', async () => {
    const eskiOkuma = ertelenmis();
    kur({ tahsilatlar: [eskiOkuma.yanit, yanitsiz] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'bekliyor' }, { getCaseCollections: 1 });

    yenileyeBas();
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'bekliyor' }, { getCaseCollections: 2, getCase: 2 });
    await finansSekmesiniAc();

    await eskiOkuma.coz([tahsilat('c0', '999', 'TRY', 'Bayat tahsilat')]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(financeView()).toMatchObject(TAHSILAT_YUKLENIYOR);
    expect(kutu('Ödemeler')).toContain('Yükleniyor');
  });

  it('aynı dosya: önce başlayan okuma SONRA hata verirse daha yeni okumanın başarılı sonucu "güncellenemedi" diye işaretlenmez', async () => {
    const eskiOkuma = ertelenmis();
    const yeniOkuma = ertelenmis();
    kur({ tahsilatlar: [eskiOkuma.yanit, yeniOkuma.yanit] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'bekliyor' }, { getCaseCollections: 1 });

    yenileyeBas();
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'bekliyor' }, { getCaseCollections: 2, getCase: 2 });
    await finansSekmesiniAc();

    await yeniOkuma.coz(TAHSILAT_1000);
    await gorunumuBekle(TAHSILAT_DOLU);

    await eskiOkuma.reddet();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(financeView()).toMatchObject(TAHSILAT_DOLU);
    expect(kutu('Ödemeler')).not.toContain('Finans verileri yüklenemedi');
  });
});

describe('Dosya değişimi — önceki dosyanın tutarı gösterilmez', () => {
  /** case-1: 1.000 tahsilat + 750 / 250 masraf talebi (okundu). Sonra adres case-2 olur. */
  async function case1YukluVeFinansAcik(k: Kurulum) {
    const sayfa = kur(k);
    await okumalariBekle(TUM_BASARILI);
    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_DOLU, ...MASRAF_DOLU });
    return sayfa;
  }

  it('adres başka dosyaya geçtiği çizimde sekme önceki dosyanın tutarını YAZMAZ (yeni dosya yüklenmeden önce de)', async () => {
    const case2Okumasi = ertelenmis();
    const sayfa = await case1YukluVeFinansAcik({ ...DOLU, dosyalar: [tamam(dosya('case-1')), case2Okumasi.yanit] });
    const panel = financePanel();

    nav.caseId = 'case-2';
    sayfa.yenidenCiz();

    // Sayfa yeni dosyayı yüklemeye geçti (panel artık belgede değil); panelin SON çizimi okunur
    await okumalariBekle({ getCase: 'bekliyor' }, { getCase: 2 });
    expect(okumalar.getCase.argumanlar[1]).toEqual(['case-2']);
    expect(document.body.contains(panel)).toBe(false);
    expect(financeView(panel)).toMatchObject({ ...TAHSILAT_YUKLENIYOR, ...MASRAF_YUKLENIYOR });
    expect(norm(panel.textContent)).not.toMatch(/1\.000|750|250/);
  });

  it('yeni dosyanın okuması sürerken önceki dosyanın tutarı yazılmaz; önceki dosyanın GEÇ GELEN yanıtı yeni dosyaya yazılmaz', async () => {
    const case1Yenilemesi = ertelenmis();
    const case2Tahsilati = ertelenmis();
    const case1MasrafYenilemesi = ertelenmis();
    const case2Masrafi = ertelenmis();
    const sayfa = await case1YukluVeFinansAcik({
      ...DOLU,
      tahsilatlar: [tamam(TAHSILAT_1000), case1Yenilemesi.yanit, case2Tahsilati.yanit],
      masrafUclu: [tamam(MASRAF_750), case1MasrafYenilemesi.yanit, case2Masrafi.yanit],
    });

    // case-1 yenileniyor: tahsilat ve masraf talebi okumaları yanıt bekliyor
    yenileyeBas();
    await okumalariBekle(
      { ...TUM_BASARILI, getCaseCollections: 'bekliyor', getExpenseThreeViewForCase: 'bekliyor' },
      { getCaseCollections: 2, getExpenseThreeViewForCase: 2, getCase: 2 },
    );

    // Bu sırada adres case-2 olur. Sayfa case-2 için iki kez okur: adres değiştiği anda ve case-2 yüklenince
    // (ikinci okuma birincinin yerine geçer) — toplam dördüncü çağrı.
    nav.caseId = 'case-2';
    sayfa.yenidenCiz();
    await okumalariBekle(
      { ...TUM_BASARILI, getCaseCollections: 'bekliyor', getExpenseThreeViewForCase: 'bekliyor' },
      { getCase: 3, getCaseCollections: 4, getExpenseThreeViewForCase: 4 },
    );
    // Yeni dosyanın okumaları case-2 için başladı — önceki dosyanın süren isteği onları engellemedi
    expect(okumalar.getCase.argumanlar[2]).toEqual(['case-2']);
    expect(okumalar.getCaseCollections.argumanlar.slice(2)).toEqual([['case-2'], ['case-2']]);
    expect(okumalar.getExpenseThreeViewForCase.argumanlar.slice(2)).toEqual([['case-2'], ['case-2']]);

    await finansSekmesiniAc();
    await tumGorunumuBekle({ ...TAHSILAT_YUKLENIYOR, ...MASRAF_YUKLENIYOR });
    expect(norm(financePanel().textContent)).not.toMatch(/1\.000|750|250/);

    // case-1'in bekleyen yanıtları ŞİMDİ geliyor: case-2 ekranına yazılmaz
    await case1Yenilemesi.coz([tahsilat('c9', '9999', 'TRY', 'Önceki dosyanın tahsilatı')]);
    await case1MasrafYenilemesi.coz([masrafTalebi('exp-9', 8888, 0, 'Önceki dosyanın masraf talebi')]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(financeView()).toEqual({ ...TAHSILAT_YUKLENIYOR, ...MASRAF_YUKLENIYOR });
    expect(norm(financePanel().textContent)).not.toMatch(/9\.999|8\.888|Önceki dosyanın/);

    // case-2'nin kendi yanıtları: tahsilat yok, 300 ₺ masraf talebi
    await case2Tahsilati.coz([]);
    await case2Masrafi.coz([masrafTalebi('exp-2', 300, 0, 'Haciz Masrafları')]);
    await tumGorunumuBekle({
      ...TAHSILAT_BOS,
      masrafTalebi: 'Masraf Talebi300 ₺Ödenen: 0 ₺',
      masrafTalebiDurumu: 'READY',
      masrafTalepleri: ['Haciz Masrafları'],
      masrafTalebiAciklamasi: null,
    });
  });

  it('yeni dosyanın okuması DÜŞERSE önceki dosyanın tutarı "son başarılı veri" diye gösterilmez: "okunamadı"', async () => {
    const sayfa = await case1YukluVeFinansAcik({
      ...DOLU,
      tahsilatlar: [tamam(TAHSILAT_1000), hata()],
      masrafUclu: [tamam(MASRAF_750), hata()],
    });

    nav.caseId = 'case-2';
    sayfa.yenidenCiz();
    // case-2 için iki okuma (adres değişince + case-2 yüklenince); ikisi de düşer
    await okumalariBekle(
      { ...TUM_BASARILI, getCaseCollections: 'hata', getExpenseThreeViewForCase: 'hata' },
      { getCase: 2, getCaseCollections: 3, getExpenseThreeViewForCase: 3 },
    );
    expect(okumalar.getCaseCollections.argumanlar.slice(1)).toEqual([['case-2'], ['case-2']]);
    await finansSekmesiniAc();

    await tumGorunumuBekle({ ...TAHSILAT_OKUNAMADI, ...MASRAF_OKUNAMADI });
    expect(norm(financePanel().textContent)).not.toMatch(/1\.000|750|250/);
  });
});

describe('Para birimi bağlamı', () => {
  it('dövizli dosya: tahsilat okunmadan "0 USD" yazılmaz; okuma gerçekten boşsa "0 USD" yazılır (#2875)', async () => {
    const tahsilatOkumasi = ertelenmis();
    kur({ dosyalar: [tamam(dosya('case-1', 'USD'))], tahsilatlar: [tahsilatOkumasi.yanit] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'bekliyor' });
    await finansSekmesiniAc();

    await gorunumuBekle(TAHSILAT_YUKLENIYOR);
    expect(norm(financePanel().textContent)).not.toContain('USD');

    await tahsilatOkumasi.coz([]);
    await gorunumuBekle({ tahsilat: 'Tahsilat0 USD', tahsilatDurumu: 'READY', sonIslemler: ['Henüz tahsilat yok'], tahsilatAciklamasi: null });
  });

  it('dövizli dosya: tahsilat okunamadığında "0 USD" yazılmaz', async () => {
    kur({ dosyalar: [tamam(dosya('case-1', 'USD'))], tahsilatlar: [hata()] });
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'hata' });
    await finansSekmesiniAc();

    await gorunumuBekle(TAHSILAT_OKUNAMADI);
    expect(norm(financePanel().textContent)).not.toContain('USD');
  });

  it('farklı para birimli tahsilat: READY iken toplam "gösterilemez" kalır; satırlar kendi para birimiyle (#2875)', async () => {
    kur({
      dosyalar: [tamam(dosya('case-1', 'USD'))],
      tahsilatlar: [tamam([tahsilat('c1', '1000', 'USD', 'USD tahsilat'), tahsilat('c2', '500', 'TRY', 'TRY tahsilat')])],
    });
    await okumalariBekle(TUM_BASARILI);
    await finansSekmesiniAc();

    await gorunumuBekle({
      tahsilat: 'Tahsilat (farklı para birimleri)gösterilemez',
      tahsilatDurumu: 'READY',
      sonIslemler: ['USD tahsilat | +1.000 USD', 'TRY tahsilat | +500 ₺'],
      tahsilatAciklamasi: null,
    });
  });

  it('dosyanın para birimi değişti ve yenileme düştü: eski para birimi bağlamının verisi "son başarılı veri" diye gösterilmez', async () => {
    // İlk yükleme TRY (1.000 ₺ tahsilat). "Yenile" sonrası dosya USD gelir, tahsilat okuması düşer.
    kur({
      ...DOLU,
      dosyalar: [tamam(dosya('case-1', 'TRY')), tamam(dosya('case-1', 'USD'))],
      tahsilatlar: [tamam(TAHSILAT_1000), hata()],
    });
    await okumalariBekle(TUM_BASARILI);
    await finansSekmesiniAc();
    await gorunumuBekle(TAHSILAT_DOLU);

    yenileyeBas();
    await okumalariBekle({ ...TUM_BASARILI, getCaseCollections: 'hata' }, { getCaseCollections: 2, getCase: 2 });
    await finansSekmesiniAc();

    await gorunumuBekle(TAHSILAT_OKUNAMADI);
    expect(norm(financePanel().textContent)).not.toContain('1.000');
  });
});
