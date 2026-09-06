import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import NotificationControlCenterPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4m — TEST GÖNDERİMİ MÜVEKKİL SEÇİCİSİ, OKUMA HATASI.
 *
 * `/clients` başarısız olunca eski hâlde `.catch(() => setClients([]))` ile
 * seçici sessizce boş kalıyordu — kullanıcı "hiçbir müvekkil yok" ya da
 * kayıtlı müvekkil bulunmadığını düşünebiliyordu. Artık hata görünür ve
 * salt-okuma tekrar denemesi sunulur; gövde sözleşmeye karşı doğrulanır.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

const OVERVIEW = {
  data: {
    generatedAt: '2026-08-01T10:00:00.000Z',
    channels: {
      email: { configured: true, host: 'smtp.example.com', sender: 'ofis@example.com' },
      sms: { configured: false, provider: null, title: null },
    },
    engines: {
      greeting: { status: 'active', time: '09:00' },
      escalation: {
        status: 'active', reminderDays: 7, founderDays: 14, channels: ['EMAIL'],
        last24hSent: 0, last24hFailed: 0,
      },
      poa: { status: 'planned', reason: 'motor yok' },
    },
    stats: {
      last24hSent: 0, last24hFailed: 0, last24hPending: 0,
      last24hEscalationSent: 0, last24hEscalationFailed: 0,
      activeEngines: 2, attentionEngines: 0, plannedEngines: 1,
    },
    recentDeliveries: [],
    failureGroups: [],
  },
};

const CLIENTS = [{ id: 'c1', name: 'Ayşe Yılmaz', email: 'ayse@example.com' }];

function routeApi(clientsHandler: () => unknown) {
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/client-notifications/overview')) return Promise.resolve(OVERVIEW);
    if (u.startsWith('/clients')) return Promise.resolve(clientsHandler());
    return Promise.resolve({ data: [] });
  });
}

const fail = () => Promise.reject(new Error('network down'));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Test gönderimi müvekkil seçicisi — okuma hatası', () => {
  it('HATASI: gorunur band cikar, "Tekrar dene" sunulur', async () => {
    routeApi(fail);
    render(<NotificationControlCenterPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('bozuk govde (dizi degil) BASARI sayilmaz', async () => {
    routeApi(() => ({ data: { unexpected: true } }));
    render(<NotificationControlCenterPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('retry BASARILI: band kalkar, secici dolar', async () => {
    let attempt = 0;
    routeApi(() => {
      attempt += 1;
      return attempt === 1 ? fail() : Promise.resolve({ data: CLIENTS });
    });
    render(<NotificationControlCenterPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findByText('Ayşe Yılmaz')).toBeTruthy();
  });

  it('basarili okuma: hata YOK, secici dolar', async () => {
    routeApi(() => ({ data: CLIENTS }));
    render(<NotificationControlCenterPage />);

    expect(await screen.findByText('Ayşe Yılmaz')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
