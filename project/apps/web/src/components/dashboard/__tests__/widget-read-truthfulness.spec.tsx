import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { UpcomingEvents } from '../upcoming-events';
import { ActivityFeed } from '../activity-feed';
import { RecentCases } from '../recent-cases';
import { FavoriteCases } from '../favorite-cases';
import { api } from '@/lib/api';

/**
 * WSMR-A2b — DASHBOARD WIDGET OKUMA DOĞRULUĞU.
 *
 * Dördü de aynı sözleşmeyi uygular: GET başarısızsa SAHTE KAYIT üretilmez,
 * hata görünür olur, gerçek boşluk yalnız doğrulanmış yanıttan doğar.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => cleanup());

describe('UpcomingEvents', () => {
  it('hata: uydurma duruşma göstermez, hata + retry sunar', async () => {
    mocked.get.mockRejectedValue(new Error('down'));
    render(<UpcomingEvents />);
    expect(await screen.findByText('Etkinlikler alınamadı')).toBeTruthy();
    // Eski sahte veri: "Duruşma - 2024/1234" / "İstanbul 5. İcra Mahkemesi"
    expect(screen.queryByText(/2024\/1234/)).toBeNull();
    expect(screen.queryByText(/İstanbul 5\. İcra Mahkemesi/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('doğrulanmış boş: gerçek "etkinlik yok" gösterir', async () => {
    mocked.get.mockResolvedValue({ data: [] });
    render(<UpcomingEvents />);
    expect(await screen.findByText('Yaklaşan etkinlik yok')).toBeTruthy();
    expect(screen.queryByText('Etkinlikler alınamadı')).toBeNull();
  });

  it('bozuk gövde: gerçek boş SAYILMAZ', async () => {
    mocked.get.mockResolvedValue({ data: { nope: true } });
    render(<UpcomingEvents />);
    expect(await screen.findByText('Etkinlikler alınamadı')).toBeTruthy();
    expect(screen.queryByText('Yaklaşan etkinlik yok')).toBeNull();
  });

  it('retry başarısı: gerçek veri gelir, mutation üretilmez', async () => {
    mocked.get.mockRejectedValueOnce(new Error('geçici')).mockResolvedValue({
      data: [{ id: 'e1', title: 'Gerçek Duruşma', date: '2026-09-01', type: 'DURUSMA' }],
    });
    render(<UpcomingEvents />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('Gerçek Duruşma')).toBeTruthy();
    const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
    for (const v of ['post', 'put', 'patch', 'delete']) expect(m[v]).not.toHaveBeenCalled();
  });
});

describe('ActivityFeed', () => {
  it('hata: uydurma tahsilat/aktivite göstermez', async () => {
    mocked.get.mockRejectedValue(new Error('down'));
    render(<ActivityFeed />);
    expect(await screen.findByText('Aktiviteler alınamadı')).toBeTruthy();
    expect(screen.queryByText(/Tahsilat kaydedildi/)).toBeNull();
    expect(screen.queryByText(/5\.000 TL/)).toBeNull();
    // Hata halinde "0 kayıt" sayacı da YALANCI SIFIRDIR.
    expect(screen.queryByText(/0 kayıt/)).toBeNull();
  });

  it('logs taşımayan gövde: sessizce boş DEĞİL, hata', async () => {
    mocked.get.mockResolvedValue({ data: {} });
    render(<ActivityFeed />);
    expect(await screen.findByText('Aktiviteler alınamadı')).toBeTruthy();
    expect(screen.queryByText('Henüz aktivite yok')).toBeNull();
  });

  it('doğrulanmış boş: gerçek "aktivite yok" + 0 kayıt sayacı', async () => {
    mocked.get.mockResolvedValue({ data: { logs: [] } });
    render(<ActivityFeed />);
    expect(await screen.findByText('Henüz aktivite yok')).toBeTruthy();
    expect(screen.getByText('0 kayıt')).toBeTruthy();
  });
});

describe('RecentCases', () => {
  it('hata: uydurma dosya/müvekkil/borçlu göstermez', async () => {
    mocked.get.mockRejectedValue(new Error('down'));
    render(<RecentCases />);
    expect(await screen.findByText('Dosyalar alınamadı')).toBeTruthy();
    expect(screen.queryByText(/ABC Ltd\./)).toBeNull();
    expect(screen.queryByText(/Ahmet Yılmaz/)).toBeNull();
  });

  it('doğrulanmış veri: gerçek dosya listelenir', async () => {
    mocked.get.mockResolvedValue({
      data: { data: [{ id: 'c1', fileNumber: '2026/9', client: { displayName: 'Gerçek Müvekkil' }, caseStatus: 'ACTIVE' }] },
    });
    render(<RecentCases />);
    expect(await screen.findByText('2026/9')).toBeTruthy();
    // Müvekkil ve borçlu tek metin düğümünde birleşik basılır: "X → Y".
    expect(screen.getByText(/Gerçek Müvekkil/)).toBeTruthy();
  });
});

describe('FavoriteCases', () => {
  it('kısmi hata SESSİZ DEĞİL: kaç favorinin alınamadığı yazılır', async () => {
    localStorage.setItem('favoriteCases', JSON.stringify(['a', 'b']));
    mocked.get
      .mockResolvedValueOnce({ data: { id: 'a', fileNumber: '2026/1', caseStatus: 'ACTIVE' } })
      .mockRejectedValueOnce(new Error('down'));
    render(<FavoriteCases />);
    expect(await screen.findByText('1 favori dosya alınamadı')).toBeTruthy();
    expect(screen.getByText('2026/1')).toBeTruthy(); // başarılı olan korunur
  });

  it('hepsi başarılı: hata bildirimi YOK', async () => {
    localStorage.setItem('favoriteCases', JSON.stringify(['a']));
    mocked.get.mockResolvedValue({ data: { id: 'a', fileNumber: '2026/2', caseStatus: 'ACTIVE' } });
    render(<FavoriteCases />);
    expect(await screen.findByText('2026/2')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/favori dosya alınamadı/)).toBeNull());
  });
});
