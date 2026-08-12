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
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/user-settings', () => ({
  useUserSettings: () => ({
    settings: {
      dashboardLocked: true,
      dashboardWidgets: { stats: true, riskAutomation: true, aiSuggestions: true },
      dashboardWidgetOrder: ['stats', 'riskAutomation', 'aiSuggestions'],
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
const AI = '/ai/stats';
const RISK = '/reports/risk-summary';
const POA = '/poa/expiring/list?days=30';

const ok = (data: unknown) => ({ data: { data } });

const STATS = { totalCases: 42, autoCases: 7, pendingActions: 3, completedToday: 5 };
const ZEROS = { totalCases: 0, autoCases: 0, pendingActions: 0, completedToday: 0 };
const RISK_OK = {
  totalActive: 9,
  distribution: [{ id: 'r1', code: 'HIGH', name: 'Yüksek Risk', color: '#f00', count: 9, totalAmount: 0, percentage: 100 }],
  summary: { high: 9, medium: 0, low: 0, unassigned: 0 },
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

/** "Toplam Dosya" kartının gövde metni. */
async function totalCard(): Promise<HTMLElement> {
  return (await screen.findByText('Toplam Dosya')).closest('div')!.parentElement as HTMLElement;
}

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
    route({
      [AUTOMATION]: () => new Promise(() => {}), // hiç çözülmez
      [AI]: () => new Promise(() => {}),
      [RISK]: () => new Promise(() => {}),
      [POA]: () => new Promise(() => {}),
    });
    render(<DashboardPage />);
    expect(await screen.findAllByText('Yükleniyor…')).not.toHaveLength(0);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('SUCCESS_DATA: pozitif değerler doğrulanmış yanıttan basılır', async () => {
    route({
      [AUTOMATION]: () => ok(STATS),
      [AI]: () => ok({ isOpenAiConfigured: true }),
      [RISK]: () => ok(RISK_OK),
      [POA]: () => ok([]),
    });
    render(<DashboardPage />);
    expect(await screen.findByText('42')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('AI Aktif')).toBeTruthy();
    // Endpoint sözleşmesi: dört okuma, tam bu URL'lerle, birer kez.
    expect(mocked.get).toHaveBeenCalledTimes(4);
    for (const u of [AUTOMATION, AI, RISK, POA]) expect(mocked.get).toHaveBeenCalledWith(u);
  });

  it('SUCCESS_EMPTY: DOĞRULANMIŞ gerçek 0 basılır ve hata gösterilmez', async () => {
    route({
      [AUTOMATION]: () => ok(ZEROS),
      [AI]: () => ok({ isOpenAiConfigured: false }),
      [RISK]: () => ok({ ...RISK_OK, totalActive: 0, distribution: [], summary: { high: 0, medium: 0, low: 0, unassigned: 0 } }),
      [POA]: () => ok([]),
    });
    render(<DashboardPage />);
    const card = await totalCard();
    expect(card.textContent).toContain('0');
    expect(screen.queryByText('Veri alınamadı')).toBeNull();
    expect(await screen.findByText('Aktif riskli dosya yok.')).toBeTruthy();
  });

  it('ERROR (ağ): rakam YERİNE "Veri alınamadı" + tekrar dene', async () => {
    route({
      [AUTOMATION]: () => new Error('network down'),
      [AI]: () => new Error('network down'),
      [RISK]: () => new Error('network down'),
      [POA]: () => new Error('network down'),
    });
    render(<DashboardPage />);
    expect(await screen.findAllByText('Veri alınamadı')).not.toHaveLength(0);
    // Yalancı sıfır YASAK.
    const card = await totalCard();
    expect(card.textContent).not.toContain('0');
    expect(screen.getAllByRole('button', { name: 'Tekrar dene' }).length).toBeGreaterThan(0);
  });

  it('MALFORMED: bozuk gövde gerçek 0 SAYILMAZ', async () => {
    route({
      [AUTOMATION]: () => ok({ totalCases: 'çok', autoCases: null }), // tip bozuk
      [AI]: () => ok({ isOpenAiConfigured: 'evet' }), // boolean değil
      [RISK]: () => ok({ totalActive: 'yok' }),
      [POA]: () => ok('dizi değil'),
    });
    render(<DashboardPage />);
    expect(await screen.findAllByText('Veri alınamadı')).not.toHaveLength(0);
    const card = await totalCard();
    expect(card.textContent).not.toContain('0');
  });

  it('AI: hata halinde "AI Yapılandırılmadı" İDDİA EDİLMEZ', async () => {
    route({
      [AUTOMATION]: () => ok(STATS),
      [AI]: () => new Error('boom'),
      [RISK]: () => ok(RISK_OK),
      [POA]: () => ok([]),
    });
    render(<DashboardPage />);
    expect(await screen.findByText('AI durumu alınamadı')).toBeTruthy();
    expect(screen.queryByText('AI Yapılandırılmadı')).toBeNull();
    expect(screen.queryByText('AI Aktif')).toBeNull();
  });

  it('İZOLASYON: bir endpoint çökerken diğerinin gerçek verisi düşmez', async () => {
    route({
      [AUTOMATION]: () => ok(STATS),
      [AI]: () => ok({ isOpenAiConfigured: true }),
      [RISK]: () => new Error('risk down'),
      [POA]: () => ok([]),
    });
    render(<DashboardPage />);
    expect(await screen.findByText('42')).toBeTruthy(); // otomasyon SAĞLAM
    expect(await screen.findByText('Risk dağılımı alınamadı')).toBeTruthy();
  });

  it('RETRY: yalnız okuma tekrarlanır ve başarıda gerçek veri gelir', async () => {
    let fail = true;
    route({
      [AUTOMATION]: () => (fail ? new Error('geçici') : ok(STATS)),
      [AI]: () => ok({ isOpenAiConfigured: true }),
      [RISK]: () => ok(RISK_OK),
      [POA]: () => ok([]),
    });
    render(<DashboardPage />);
    await screen.findAllByText('Veri alınamadı');

    fail = false;
    fireEvent.click(screen.getAllByRole('button', { name: 'Tekrar dene' })[0]);

    expect(await screen.findByText('42')).toBeTruthy();
    // Retry SALT-OKUMA: hiçbir mutation üretilmedi.
    const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
    for (const verb of ['post', 'put', 'patch', 'delete']) expect(m[verb]).not.toHaveBeenCalled();
  });

  it('STALE: sonradan çöken yolun eski verisi GÜNCEL gibi gösterilmez, etiketlenir', async () => {
    // Gerçek erişim yolu: risk hatalı → kullanıcı "Tekrar dene"ye basar → bu kez
    // ÖNCEDEN BAŞARILI olan otomasyon çöker. Otomasyonun doğrulanmış eski verisi
    // korunur ama AÇIKÇA "Güncel olmayabilir" diye işaretlenir.
    let automationFails = false;
    route({
      [AUTOMATION]: () => (automationFails ? new Error('sonradan çöktü') : ok(STATS)),
      [AI]: () => ok({ isOpenAiConfigured: true }),
      [RISK]: () => new Error('risk down'),
      [POA]: () => ok([]),
    });
    render(<DashboardPage />);
    expect(await screen.findByText('42')).toBeTruthy();
    expect(screen.queryByText('Güncel olmayabilir')).toBeNull(); // taze veri etiketsiz

    automationFails = true;
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    // Eski değer korunur AMA bayat olarak işaretlenir — taze veriden ayırt edilebilir.
    await waitFor(() => expect(screen.getAllByText('Güncel olmayabilir').length).toBeGreaterThan(0));
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('SÖZLEŞME: sahte "Yaklaşan Otomatik İşlemler" ve uydurma AI önerileri KALDIRILDI', async () => {
    route({
      [AUTOMATION]: () => ok(STATS),
      [AI]: () => ok({ isOpenAiConfigured: true }),
      [RISK]: () => ok(RISK_OK),
      [POA]: () => ok([]),
    });
    render(<DashboardPage />);
    await screen.findByText('42');
    expect(screen.queryByText('Yaklaşan Otomatik İşlemler')).toBeNull();
    expect(screen.queryByText(/Banka haczi önerilir/)).toBeNull();
    expect(screen.queryByText(/2024\/1234/)).toBeNull();
    expect(screen.queryByText(/%85 güven/)).toBeNull();
    // Veri kaynağı olmayan "Çalışıyor" iddiası da kalkmış olmalı.
    expect(screen.queryByText('Kural Motoru')).toBeNull();
  });
});
