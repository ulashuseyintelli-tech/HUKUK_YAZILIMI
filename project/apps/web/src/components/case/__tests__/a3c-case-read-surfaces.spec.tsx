import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CaseCostAnalysis } from '../case-cost-analysis';
import { CaseTimeline } from '../case-timeline';
import { api } from '@/lib/api';

/**
 * WSMR-A3c — CASE READ YÜZEYLERİ.
 *
 * Üçü de GET başarısız olduğunda UYDURMA DOSYA BİLGİSİ üretiyordu. En ağırı
 * `case-cost-analysis`: bir hukuk dosyasında sahte gider/gelir/kâr rakamları
 * (4.500 / 25.000 / 20.500) gerçek maliyet analizi gibi gösteriliyordu.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('CaseCostAnalysis', () => {
  it('hata: uydurma mali rakam GÖSTERMEZ, görünür hata + retry', async () => {
    mocked.get.mockRejectedValue(new Error('down'));
    render(<CaseCostAnalysis caseId="c1" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    // Eski sahte degerler ekrana GELMEZ.
    expect(screen.queryByText(/20\.500/)).toBeNull();
    expect(screen.queryByText(/25\.000/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('bozuk gövde: sözleşmeye uymayan yanıt gerçek veri SAYILMAZ', async () => {
    mocked.get.mockResolvedValue({ data: { data: { totalExpenses: 1 } } }); // eksik alanlar
    render(<CaseCostAnalysis caseId="c1" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('retry başarısı: gerçek veri gelir, mutation üretilmez', async () => {
    mocked.get.mockRejectedValueOnce(new Error('geçici')).mockResolvedValue({
      data: { data: { totalExpenses: 1, totalRevenue: 2, profit: 1, profitMargin: 50, expenses: [], revenue: [], monthlyTrend: [] } },
    });
    render(<CaseCostAnalysis caseId="c1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));
    // Hata ekrani KALKAR (retry basarisi yansir).
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
    for (const v of ['post', 'put', 'patch', 'delete']) expect(m[v]).not.toHaveBeenCalled();
  });
});

describe('CaseTimeline', () => {
  it('hata: uydurma zaman çizelgesi olayı GÖSTERMEZ', async () => {
    mocked.get.mockRejectedValue(new Error('down'));
    render(<CaseTimeline caseId="c1" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('bozuk gövde: gerçek boş çizelge SAYILMAZ, hata verir', async () => {
    mocked.get.mockResolvedValue({ data: { nope: true } });
    render(<CaseTimeline caseId="c1" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('doğrulanmış veri: gerçek olay listelenir', async () => {
    mocked.get.mockResolvedValue({
      data: [{ id: 't1', type: 'CREATED', title: 'Gerçek Olay', date: new Date().toISOString() }],
    });
    render(<CaseTimeline caseId="c1" />);
    expect(await screen.findByText('Gerçek Olay')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
