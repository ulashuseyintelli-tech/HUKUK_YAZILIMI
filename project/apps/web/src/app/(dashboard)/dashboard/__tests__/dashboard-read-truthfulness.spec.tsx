import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import DashboardPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A2 — DASHBOARD OKUMA DOĞRULUĞU.
 *
 * Kilitlenen sözleşme: ekranda görünen bir rakam YALNIZ doğrulanmış başarılı
 * yanıttan doğar. Hata, bozuk gövde ve eksik alan "0" olarak GÖSTERİLEMEZ —
 * eski davranışta `.catch(() => ({ data: null }))` + `stats?.total || '0'`
 * zinciri, API çökmüşken kullanıcıya "Toplam Dosya 0" diye okutuyordu.
 *
 * Mock'lar API'nin GERÇEK yanıt biçimini taşır (`api.get` gövdeyi `{ data: <gövde> }`
 * olarak sarar):
 * - `/automation/stats` → zarfsız `{ totalAutoCases, totalAutoActions, recentActions }`
 *   (automation.service.ts getAutomationStats).
 * - `/cases/stats` → zarfsız `{ total, active, closed, ... }` (case.service.ts getStats).
 * - `/poa/expiring/list` → düz dizi (poa.service.ts getExpiringPoas).
 * - `/ai/stats`, `/reports/risk-summary` → `{ success, data }` zarfı.
 * Önceki mock'lar otomasyon ve vekâlet uçları için API'nin hiç döndürmediği bir biçim
 * kullanıyordu; bu yüzden canlıdaki "Veri alınamadı" kartları testte yeşil geçiyordu.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/user-settings', () => ({
  useUserSettings: () => ({
    settings: {
      dashboardLocked: true,
      dashboardWidgets: { stats: true, riskAutomation: true, aiSuggestions: true, expiringPoas: true },
      dashboardWidgetOrder: ['expiringPoas', 'stats', 'riskAutomation', 'aiSuggestions'],
    },
    updateSettings: vi.fn(),
  }),
}));

// Alt widget'lar bu spec'in konusu değil; kendi okuma yolları ayrı dilimde test edilir.
vi.mock('@/components/dashboard/activity-feed', () => ({ ActivityFeed: () => null }));
vi.mock('@/components/dashboard/upcoming-events', () => ({ UpcomingEvents: () => null }));
vi.mock('@/components/dashboard/recent-cases', () => ({ RecentCases: () => null }));
vi.mock('@/components/dashboard/favorite-cases', () => ({ FavoriteCases: () => null }));
vi.mock('@/components/dashboard/quick-summary', () => ({ QuickSummary: () => null }));
vi.mock('@/components/reminders/reminder-widget', () => ({ ReminderWidget: () => null }));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

const AUTOMATION = '/automation/stats';
const CASES = '/cases/stats';
const AI = '/ai/stats';
const RISK = '/reports/risk-summary';
const POA = '/poa/expiring/list?days=30';

/** `api.get` sonucu: gövde `{ data: <gövde> }` içinde döner. */
const body = (b: unknown) => ({ data: b });
/** `{ success, data }` zarfıyla dönen uçlar (ai, risk). */
const envelope = (data: unknown) => body({ success: true, data });

const AUTO_OK = { totalAutoCases: 7, totalAutoActions: 12, recentActions: [] };
const AUTO_ZERO = { totalAutoCases: 0, totalAutoActions: 0, recentActions: [] };
const CASES_OK = { total: 42, active: 30, closed: 12, thisMonth: 3, ownerless: 0, legalResponsibleMissing: 0 };
const CASES_ZERO = { total: 0, active: 0, closed: 0, thisMonth: 0, ownerless: 0, legalResponsibleMissing: 0 };
const RISK_OK = {
  totalActive: 9,
  distribution: [{ id: 'r1', code: 'HIGH', name: 'Yüksek Risk', color: '#f00', count: 9, totalAmount: 0, percentage: 100 }],
  summary: { high: 9, medium: 0, low: 0, unassigned: 0 },
};
const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
/** Prisma `findMany` + include biçimi: client ve lawyers[].lawyer. */
const POA_ROW = {
  id: 'poa-1',
  clientId: 'c-1',
  isLimited: true,
  status: 'ACTIVE',
  validUntil: inDays(5),
  client: { id: 'c-1', displayName: 'Örnek Müvekkil' },
  lawyers: [{ lawyerId: 'l-1', lawyer: { id: 'l-1', name: 'Deneme', surname: 'Avukat' } }],
};

/** Endpoint'e göre yanıt kuran yardımcı — çağrı SAYISI ve URL'i de doğrulanır. */
function route(map: Record<string, () => unknown>) {
  mocked.get.mockImplementation((url: string) => {
    const key = Object.keys(map).find((k) => url === k);
    if (!key) throw new Error(`beklenmeyen endpoint: ${url}`);
    return Promise.resolve(map[key]()).then((v) => {
      if (v instanceof Error) return Promise.reject(v);
      return v;
    });
  });
}

/** Hepsi başarılı, gerçek biçimli yanıtlar; testler yalnız değişen yolu ezer. */
function healthy(overrides: Record<string, () => unknown> = {}) {
  route({
    [AUTOMATION]: () => body(AUTO_OK),
    [CASES]: () => body(CASES_OK),
    [AI]: () => envelope({ isOpenAiConfigured: true }),
    [RISK]: () => envelope(RISK_OK),
    [POA]: () => body([]),
    ...overrides,
  });
}

/** Başlığı verilen kartın kutusu, ara durumdan çıkmış olarak. */
async function card(title: string): Promise<HTMLElement> {
  const el = (await screen.findByText(title)).closest('div')!.parentElement as HTMLElement;
  /**
   * WSMR-A4l DUZELTMESI — YARIS KAPATILDI.
   *
   * Etiket YUKLEME sirasinda da render ediliyor; bu yuzden `findByText` kart
   * YERLESMEDEN cozulebiliyordu ve `textContent` hala "Yükleniyor…" iken
   * dogrulaniyordu. Kart ARA durumdan cikana kadar beklenir. Bu bir zayiflatma
   * DEGILDIR: cagiran testlerin iddialari aynen gecerlidir.
   */
  await vi.waitFor(() => expect(el.textContent).not.toMatch(/Yükleniyor/));
  return el;
}

const totalCard = () => card('Toplam Dosya');
const autoCard = () => card('Otomatik Mod');

let consoleErr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  // act() uyarısı ve beklenmeyen console.error PASS sayılmaz.
  consoleErr = vi.spyOn(console, 'error').mockImplementation((...args) => {
    throw new Error(`beklenmeyen console.error: ${String(args[0])}`);
  });
});

afterEach(() => {
  consoleErr.mockRestore();
  cleanup();
});

describe('WSMR-A2 · dashboard okuma durumları', () => {
  it('LOADING: ilk render rakam basmaz, yükleniyor der', async () => {
    const never = () => new Promise(() => {}); // hiç çözülmez
    route({ [AUTOMATION]: never, [CASES]: never, [AI]: never, [RISK]: never, [POA]: never });
    render(<DashboardPage />);
    expect(await screen.findAllByText('Yükleniyor…')).not.toHaveLength(0);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('SUCCESS_DATA: pozitif değerler doğrulanmış yanıttan basılır', async () => {
    healthy();
    render(<DashboardPage />);
    expect((await totalCard()).textContent).toContain('42');
    expect((await autoCard()).textContent).toContain('7');
    expect(screen.getByText('AI Aktif')).toBeTruthy();
    // Endpoint sözleşmesi: beş okuma, tam bu URL'lerle, birer kez.
    expect(mocked.get).toHaveBeenCalledTimes(5);
    for (const u of [AUTOMATION, CASES, AI, RISK, POA]) expect(mocked.get).toHaveBeenCalledWith(u);
  });

  it('SUCCESS_EMPTY: DOĞRULANMIŞ gerçek 0 basılır ve hata gösterilmez', async () => {
    healthy({
      [AUTOMATION]: () => body(AUTO_ZERO),
      [CASES]: () => body(CASES_ZERO),
      [AI]: () => envelope({ isOpenAiConfigured: false }),
      [RISK]: () => envelope({ ...RISK_OK, totalActive: 0, distribution: [], summary: { high: 0, medium: 0, low: 0, unassigned: 0 } }),
    });
    render(<DashboardPage />);
    expect((await totalCard()).textContent).toContain('0');
    expect((await autoCard()).textContent).toContain('0');
    expect(screen.queryByText('Veri alınamadı')).toBeNull();
    expect(await screen.findByText('Aktif riskli dosya yok.')).toBeTruthy();
  });

  it('ERROR (ağ): rakam YERİNE "Veri alınamadı" + tekrar dene', async () => {
    const down = () => new Error('network down');
    route({ [AUTOMATION]: down, [CASES]: down, [AI]: down, [RISK]: down, [POA]: down });
    render(<DashboardPage />);
    expect(await screen.findAllByText('Veri alınamadı')).not.toHaveLength(0);
    // Yalancı sıfır YASAK.
    expect((await totalCard()).textContent).not.toContain('0');
    expect((await autoCard()).textContent).not.toContain('0');
    expect(screen.getAllByRole('button', { name: 'Tekrar dene' }).length).toBeGreaterThan(0);
  });

  it('MALFORMED: bozuk gövde gerçek 0 SAYILMAZ', async () => {
    route({
      [AUTOMATION]: () => body({ totalAutoCases: 'çok' }), // tip bozuk
      [CASES]: () => body({ total: null }),
      [AI]: () => envelope({ isOpenAiConfigured: 'evet' }), // boolean değil
      [RISK]: () => envelope({ totalActive: 'yok' }),
      [POA]: () => body('dizi değil'),
    });
    render(<DashboardPage />);
    expect(await screen.findAllByText('Veri alınamadı')).not.toHaveLength(0);
    expect((await totalCard()).textContent).not.toContain('0');
    expect((await autoCard()).textContent).not.toContain('0');
    expect(await screen.findByText('Süresi dolan vekalet bilgisi alınamadı')).toBeTruthy();
  });

  it('AI: hata halinde "AI Yapılandırılmadı" İDDİA EDİLMEZ', async () => {
    healthy({ [AI]: () => new Error('boom') });
    render(<DashboardPage />);
    expect(await screen.findByText('AI durumu alınamadı')).toBeTruthy();
    expect(screen.queryByText('AI Yapılandırılmadı')).toBeNull();
    expect(screen.queryByText('AI Aktif')).toBeNull();
  });

  it('İZOLASYON: bir endpoint çökerken diğerinin gerçek verisi düşmez', async () => {
    healthy({ [RISK]: () => new Error('risk down') });
    render(<DashboardPage />);
    expect((await autoCard()).textContent).toContain('7'); // otomasyon SAĞLAM
    expect((await totalCard()).textContent).toContain('42'); // dosya toplamı SAĞLAM
    expect(await screen.findByText('Risk dağılımı alınamadı')).toBeTruthy();
  });

  it('RETRY: yalnız okuma tekrarlanır ve başarıda gerçek veri gelir', async () => {
    let fail = true;
    healthy({ [AUTOMATION]: () => (fail ? new Error('geçici') : body(AUTO_OK)) });
    render(<DashboardPage />);
    await screen.findAllByText('Veri alınamadı');

    fail = false;
    fireEvent.click(screen.getAllByRole('button', { name: 'Tekrar dene' })[0]);

    await waitFor(() => expect(screen.queryAllByText('Veri alınamadı')).toHaveLength(0));
    expect((await autoCard()).textContent).toContain('7');
    // Retry SALT-OKUMA: hiçbir mutation üretilmedi.
    const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
    for (const verb of ['post', 'put', 'patch', 'delete']) expect(m[verb]).not.toHaveBeenCalled();
  });

  it('STALE: sonradan çöken yolun eski verisi GÜNCEL gibi gösterilmez, etiketlenir', async () => {
    // Gerçek erişim yolu: risk hatalı → kullanıcı "Tekrar dene"ye basar → bu kez
    // ÖNCEDEN BAŞARILI olan otomasyon çöker. Otomasyonun doğrulanmış eski verisi
    // korunur ama AÇIKÇA "Güncel olmayabilir" diye işaretlenir.
    let automationFails = false;
    healthy({
      [AUTOMATION]: () => (automationFails ? new Error('sonradan çöktü') : body(AUTO_OK)),
      [RISK]: () => new Error('risk down'),
    });
    render(<DashboardPage />);
    expect((await autoCard()).textContent).toContain('7');
    expect(screen.queryByText('Güncel olmayabilir')).toBeNull(); // taze veri etiketsiz

    automationFails = true;
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    // Eski değer korunur AMA bayat olarak işaretlenir — taze veriden ayırt edilebilir.
    await waitFor(() => expect(screen.getAllByText('Güncel olmayabilir').length).toBeGreaterThan(0));
    expect((await autoCard()).textContent).toContain('7');
  });

  it('SÖZLEŞME: sahte "Yaklaşan Otomatik İşlemler" ve uydurma AI önerileri KALDIRILDI', async () => {
    healthy();
    render(<DashboardPage />);
    await autoCard();
    expect(screen.queryByText('Yaklaşan Otomatik İşlemler')).toBeNull();
    expect(screen.queryByText(/Banka haczi önerilir/)).toBeNull();
    expect(screen.queryByText(/2024\/1234/)).toBeNull();
    expect(screen.queryByText(/%85 güven/)).toBeNull();
    // Veri kaynağı olmayan "Çalışıyor" iddiası da kalkmış olmalı.
    expect(screen.queryByText('Kural Motoru')).toBeNull();
  });
});

describe('GERÇEK API SÖZLEŞMESİ · kartlar ve vekâlet bandı', () => {
  it('Otomatik Mod, zarfsız /automation/stats yanıtındaki totalAutoCases alanından basılır', async () => {
    healthy();
    render(<DashboardPage />);
    const el = await autoCard();
    expect(el.textContent).toContain('7');
    expect(el.textContent).not.toContain('Veri alınamadı');
  });

  it('Toplam Dosya, /cases/stats toplamından basılır', async () => {
    healthy();
    render(<DashboardPage />);
    const el = await totalCard();
    expect(el.textContent).toContain('42');
    expect(el.textContent).not.toContain('Veri alınamadı');
    expect(mocked.get).toHaveBeenCalledWith(CASES);
  });

  it('Bekleyen İşlem ve Bugün Tamamlanan kartları yok (veri kaynağı tanımlı değil)', async () => {
    healthy();
    render(<DashboardPage />);
    await autoCard();
    expect(screen.queryByText('Bekleyen İşlem')).toBeNull();
    expect(screen.queryByText('Bugün Tamamlanan')).toBeNull();
  });

  it('Vekâlet bandı, düz dizi yanıtıyla görünür', async () => {
    healthy({ [POA]: () => body([POA_ROW]) });
    render(<DashboardPage />);
    expect(await screen.findByText('⚠️ Süresi Dolmak Üzere Olan Vekaletler')).toBeTruthy();
    expect(screen.getByText('1 vekalet')).toBeTruthy();
    expect(screen.getByText('Örnek Müvekkil')).toBeTruthy();
  });

  it('Vekâlet isteği hatası boş liste gibi GİZLENMEZ: hata ve tekrar dene görünür', async () => {
    healthy({ [POA]: () => new Error('poa down') });
    render(<DashboardPage />);
    expect(await screen.findByText('Süresi dolan vekalet bilgisi alınamadı')).toBeTruthy();
    expect(screen.queryByText('⚠️ Süresi Dolmak Üzere Olan Vekaletler')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Tekrar dene' }).length).toBeGreaterThan(0);
  });

  it('Vekâlet boş (doğrulanmış): bant gösterilmez, hata da gösterilmez', async () => {
    healthy({ [POA]: () => body([]) });
    render(<DashboardPage />);
    await autoCard();
    expect(screen.queryByText('⚠️ Süresi Dolmak Üzere Olan Vekaletler')).toBeNull();
    expect(screen.queryByText('Süresi dolan vekalet bilgisi alınamadı')).toBeNull();
  });
});
