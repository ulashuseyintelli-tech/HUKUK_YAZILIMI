import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PortalManagementPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4m — PORTAL YÖNETİMİ, DÖRT BAĞIMSIZ OKUMA/GÖNDERME HATASI.
 *
 * `fetchPendingDocs` — okuma hatası "Bekleyen belge yok" ile aynı görünüyordu
 * (admin bekleyen onayları kaçırabilirdi).
 * `fetchClients` — okuma hatası "Portal erişimi olan müvekkil yok" ile aynı
 * görünüyordu.
 * `selectClient` — mesaj okuma hatasında dahi okunmamış rozeti sıfırlanıyordu
 * (admin gerçekte okunmamış duran bir mesajı görmüş sanabilirdi).
 * `sendMessage` — gönderim hatasında hiçbir geri bildirim yoktu.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

const PENDING_DOCS = [
  { id: 'd1', clientId: 'c1', type: 'VEKALET', title: 'Vekaletname', fileName: 'v.pdf', fileSize: 1024, createdAt: '2026-08-01T10:00:00.000Z' },
];
const CLIENTS = [{ id: 'c1', displayName: 'Ayşe Yılmaz', type: 'PERSON', unreadCount: 2 }];
const MESSAGES = { messages: [{ id: 'm1', content: 'Merhaba', senderType: 'CLIENT', senderName: 'Ayşe', createdAt: '2026-08-01T10:00:00.000Z' }] };

type Overrides = Partial<{
  docs: () => unknown;
  clients: () => unknown;
  messages: () => unknown;
  send: () => unknown;
}>;

function routeApi(o: Overrides = {}) {
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes('/documents/pending')) return Promise.resolve(o.docs?.() ?? { data: PENDING_DOCS });
    if (u.includes('/messages/clients')) return Promise.resolve(o.clients?.() ?? { data: CLIENTS });
    if (u.includes('/messages/')) return Promise.resolve(o.messages?.() ?? { data: MESSAGES });
    return Promise.resolve({ data: [] });
  });
  mocked.post.mockImplementation((url: string) => {
    if (String(url).includes('/messages/')) return o.send?.() ?? Promise.resolve({ data: {} });
    return Promise.resolve({ data: {} });
  });
}

const fail = () => Promise.reject(new Error('network down'));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Bekleyen Belgeler — okuma hatası', () => {
  it('HATASI: "bekleyen belge yok" YAZILMAZ, gorunur hata cikar', async () => {
    routeApi({ docs: fail });
    render(<PortalManagementPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Bekleyen belge yok')).toBeNull();
  });

  it('retry BASARILI: liste gorunur, hata YOK', async () => {
    let attempt = 0;
    routeApi({
      docs: () => {
        attempt += 1;
        return attempt === 1 ? fail() : { data: PENDING_DOCS };
      },
    });
    render(<PortalManagementPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText('v.pdf')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('GERCEKTEN bos: hata YOK, "bekleyen belge yok" DOGRU', async () => {
    routeApi({ docs: () => ({ data: [] }) });
    render(<PortalManagementPage />);

    expect(await screen.findByText('Bekleyen belge yok')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Mesajlar — müvekkil listesi okuma hatası', () => {
  const openMessagesTab = async () =>
    fireEvent.click(await screen.findByRole('button', { name: /Mesajlar/ }));

  it('HATASI: "portal erisimi olan muvekkil yok" YAZILMAZ', async () => {
    routeApi({ clients: fail });
    render(<PortalManagementPage />);
    await openMessagesTab();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Portal erişimi olan müvekkil yok')).toBeNull();
  });
});

describe('Mesajlar — mesaj okuma hatası (unread rozeti)', () => {
  it('okuma HATASI: unread rozeti SIFIRLANMAZ, gorunur hata cikar', async () => {
    routeApi({ messages: fail });
    render(<PortalManagementPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Mesajlar/ }));
    fireEvent.click(await screen.findByText('Ayşe Yılmaz'));

    expect(await screen.findByRole('alert')).toBeTruthy();
    // Unread rozeti (2) — sekme basligi + musteri satiri — hala GORUNUR;
    // sessizce sifirlanmadi.
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('okuma BASARILI: unread rozeti sifirlanir', async () => {
    routeApi({});
    render(<PortalManagementPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Mesajlar/ }));
    fireEvent.click(await screen.findByText('Ayşe Yılmaz'));

    await screen.findByText('Merhaba');
    await vi.waitFor(() => expect(screen.queryByText('2')).toBeNull());
  });
});

describe('Mesajlar — gönderim hatası', () => {
  it('gonderim HATASI: gorunur hata cikar, yazi KORUNUR', async () => {
    routeApi({ send: fail });
    render(<PortalManagementPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Mesajlar/ }));
    fireEvent.click(await screen.findByText('Ayşe Yılmaz'));
    await screen.findByText('Merhaba');

    const input = screen.getByPlaceholderText('Mesajınızı yazın...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Dosyanız hazır' } });
    fireEvent.click(screen.getByRole('button', { name: /Gönder/ }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(input.value).toBe('Dosyanız hazır');
  });

  it('gonderim BASARILI: hata YOK, metin temizlenir', async () => {
    routeApi({});
    render(<PortalManagementPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Mesajlar/ }));
    fireEvent.click(await screen.findByText('Ayşe Yılmaz'));
    await screen.findByText('Merhaba');

    const input = screen.getByPlaceholderText('Mesajınızı yazın...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Dosyanız hazır' } });
    fireEvent.click(screen.getByRole('button', { name: /Gönder/ }));

    await vi.waitFor(() => expect(input.value).toBe(''));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
