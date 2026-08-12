import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ClientPerformanceReport } from '../client-performance';
import { LawyerWorkloadReport } from '../lawyer-workload';
import { api } from '@/lib/api';

/**
 * WSMR-A3b — RAPORLAR SAYFASINDAKİ CANLI YÜZEYLER.
 *
 * Üçü de GET başarısız olduğunda SABİT SAHTE RAPOR SATIRLARI basıyordu:
 * uydurma müvekkil unvanı, avukat adı, dosya sayısı ve tahsilat tutarı.
 * Kullanıcı bunu gerçek performans raporu sanıyor, hatta dışa aktarabiliyordu.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('ClientPerformanceReport', () => {
  it('hata: uydurma müvekkil satırı GÖSTERMEZ, görünür hata + retry verir', async () => {
    mocked.get.mockRejectedValue(new Error('down'));
    render(<ClientPerformanceReport />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/ABC Holding/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('retry başarısı: gerçek veri gelir, mutation üretilmez', async () => {
    mocked.get.mockRejectedValueOnce(new Error('geçici')).mockResolvedValue({
      data: { data: [{ id: 'k1', name: 'Gerçek Müvekkil', totalCases: 3, activeCases: 2, closedCases: 1, totalDebt: 100, totalCollected: 50, collectionRate: 50, avgCaseDuration: 10 }] },
    });
    render(<ClientPerformanceReport />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('Gerçek Müvekkil')).toBeTruthy();
    const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
    for (const v of ['post', 'put', 'patch', 'delete']) expect(m[v]).not.toHaveBeenCalled();
  });

  it('doğrulanmış boş: sahte satır değil, gerçek boş rapor', async () => {
    mocked.get.mockResolvedValue({ data: { data: [] } });
    render(<ClientPerformanceReport />);
    expect(await screen.findByText(/Müvekkil Performans/i)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/ABC Holding/)).toBeNull();
  });
});

describe('LawyerWorkloadReport', () => {
  it('hata: uydurma avukat satırı GÖSTERMEZ', async () => {
    mocked.get.mockRejectedValue(new Error('down'));
    render(<LawyerWorkloadReport />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/Ahmet/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('doğrulanmış veri: gerçek avukat listelenir', async () => {
    mocked.get.mockResolvedValue({
      data: { data: [{ id: 'l1', name: 'Gerçek', surname: 'Avukat', totalCases: 5, activeCases: 3, closedCases: 2, pendingTasks: 1, upcomingHearings: 0, totalCollected: 0, workloadScore: 10 }] },
    });
    render(<LawyerWorkloadReport />);
    expect(await screen.findByText(/Gerçek/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
