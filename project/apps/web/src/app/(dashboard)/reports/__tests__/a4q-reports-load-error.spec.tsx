import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ReportsPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4q — RAPORLAR SAYFASI: OKUMA HATASI "HENÜZ VERİ YOK" DEĞİLDİR.
 *
 * Üç BAĞIMSIZ okuma noktası vardı — her biri kendi try/catch'inde yalnız
 * `console.error` ile hatayı YUTUYORDU:
 *
 *  1. `loadReports`    → dashboard sekmesi TAMAMEN BOŞ render ediliyordu;
 *                         personel/durum sekmeleri "Henüz veri yok" /
 *                         "Henüz durum etiketi atanmış dosya yok" ile
 *                         KARIŞIYORDU.
 *  2. `loadCaseList`   → "Dosya Listesi" sekmesinde "Henüz dosya yok" ile
 *                         KARIŞIYORDU.
 *  3. `loadLookups`    → filtre menüleri (takip türü, risk, durum, ...)
 *                         sessizce BOŞ açılıyordu.
 *
 * Kural: her okuma hatası GÖRÜNÜR olur + yeniden-deneme sunar; zaten yüklü
 * veri SİLİNMEZ.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/components/dashboard/advanced-stats', () => ({ AdvancedStats: () => null }));
vi.mock('@/components/reports', () => ({
  ClientPerformanceReport: () => null,
  LawyerWorkloadReport: () => null,
  CustomReportBuilder: () => null,
  PdfExportModal: () => null,
  ScheduledReports: () => null,
  EmailReportModal: () => null,
  CaseDebtReport: () => null,
  InterestReport: () => null,
  CollectionHistoryReport: () => null,
}));
vi.mock('@/components/case/responsible-candidate-select', () => ({
  ResponsibleCandidateSelect: () => null,
}));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

const DASHBOARD_STATS = { totalCases: 12, activeCases: 8, closedCases: 4, totalCollection: 50000, byTakipTuru: [] };
const CASE_ROW = { id: 'c1', fileNumber: '2026/1', clientName: 'Ayşe Yılmaz' };

const networkError = () => Promise.reject(new Error('network down'));

type Routes = Partial<{ dashboard: () => unknown; cases: () => unknown; lookups: () => unknown }>;

function routeApi(o: Routes = {}) {
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/reports/dashboard')) return Promise.resolve(o.dashboard?.() ?? { data: { data: DASHBOARD_STATS } });
    if (u.startsWith('/reports/cases-with-summary')) return Promise.resolve(o.cases?.() ?? { data: { data: [CASE_ROW] } });
    if (u.startsWith('/lookups/') || u.startsWith('/users')) return Promise.resolve(o.lookups?.() ?? { data: { data: [] } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Dashboard sekmesi — loadReports okuma hatası', () => {
  it('AG HATASI: dashboard BOS render EDILMEZ, gorunur hata + retry cikar', async () => {
    routeApi({ dashboard: networkError });
    render(<ReportsPage />);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Rapor yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });

  it('basarili yukleme: gercek istatistikler gorunur, hata YOK', async () => {
    routeApi({});
    render(<ReportsPage />);

    expect(await screen.findByText('12')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry -> SUCCESS_DATA: gercek istatistikler gorunur, hata kalkar', async () => {
    let attempt = 0;
    routeApi({
      dashboard: () => {
        attempt += 1;
        return attempt === 1 ? Promise.reject(new Error('network down')) : { data: { data: DASHBOARD_STATS } };
      },
    });
    render(<ReportsPage />);

    const retryBtns = await screen.findAllByRole('button', { name: 'Tekrar dene' });
    fireEvent.click(retryBtns[0]);

    expect(await screen.findByText('12')).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('Dosya Listesi sekmesi — loadCaseList okuma hatası', () => {
  const openTab = async () => fireEvent.click(await screen.findByRole('button', { name: /Dosya Listesi/ }));

  it('AG HATASI: "Henüz dosya yok" YAZILMAZ, gorunur hata + retry cikar', async () => {
    routeApi({ cases: networkError });
    render(<ReportsPage />);
    await screen.findByText('12');
    await openTab();

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Dosya listesi yüklenemedi/.test(a.textContent || ''))).toBe(true);
    expect(screen.queryByText('Henüz dosya yok')).toBeNull();
  });

  it('GERCEKTEN bos: hata YOK, "Henüz dosya yok" DOGRU', async () => {
    routeApi({ cases: () => ({ data: { data: [] } }) });
    render(<ReportsPage />);
    await screen.findByText('12');
    await openTab();

    expect(await screen.findByText('Henüz dosya yok')).toBeTruthy();
  });

  it('basarili yukleme: gercek dosya gorunur, hata YOK', async () => {
    routeApi({});
    render(<ReportsPage />);
    await screen.findByText('12');
    await openTab();

    expect(await screen.findByText('2026/1')).toBeTruthy();
  });
});

describe('Filtre lookup okuma hatası', () => {
  it('AG HATASI: gorunur uyari cikar (filtre menuleri sessizce bos KALMAZ)', async () => {
    routeApi({ lookups: networkError });
    render(<ReportsPage />);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Filtre listeleri yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });
});
