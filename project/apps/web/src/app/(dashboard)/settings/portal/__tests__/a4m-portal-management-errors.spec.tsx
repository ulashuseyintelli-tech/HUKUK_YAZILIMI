import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
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

describe('4c — iç not ve müvekkile gösterilen ret gerekçesi', () => {
  async function open() {
    render(<PortalManagementPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reddet' }));
  }
  function fill() {
    fireEvent.change(screen.getByLabelText('Müvekkile gösterilecek ret gerekçesi'), { target: { value: '  İmza sayfası eksik.  ' } });
    fireEvent.change(screen.getByLabelText('İç inceleme notu (isteğe bağlı)'), { target: { value: 'INTERNAL-STRATEGY' } });
  }
  it('iki ayrı alan gönderilir; yalnız kabul sonrası form ve bekleyen belge kaldırılır', async () => {
    let reads = 0;
    routeApi({ docs: () => ({ data: ++reads === 1 ? PENDING_DOCS : [] }) });
    await open(); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Ret kararını kaydet' }));
    await waitFor(() => expect(mocked.post).toHaveBeenCalledWith('/portal/admin/documents/d1/reject', { note: 'INTERNAL-STRATEGY', clientRejectionReason: 'İmza sayfası eksik.' }));
    await screen.findByText('Bekleyen belge yok');
    expect(screen.queryByRole('form', { name: 'Belge ret kararı' })).toBeNull();
  });
  it('vazgeçme veya yalnız boşluk gerekçe ret isteği göndermez', async () => {
    routeApi(); await open();
    fireEvent.change(screen.getByLabelText('Müvekkile gösterilecek ret gerekçesi'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Belge ret kararı' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mocked.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByRole('form', { name: 'Belge ret kararı' })).toBeNull();
    expect(mocked.post).not.toHaveBeenCalled(); expect(screen.getByText('v.pdf')).toBeTruthy();
  });
  it('sunucu reddi görünür; iki metin ve belge korunur, başarı yenilemesi yapılmaz', async () => {
    routeApi(); mocked.post.mockRejectedValue(new Error('rejected'));
    await open(); fill(); const reads = mocked.get.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Ret kararını kaydet' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText('İç inceleme notu (isteğe bağlı)')).toHaveProperty('value', 'INTERNAL-STRATEGY');
    expect(screen.getByLabelText('Müvekkile gösterilecek ret gerekçesi')).toHaveProperty('value', '  İmza sayfası eksik.  ');
    expect(screen.getByText('v.pdf')).toBeTruthy(); expect(mocked.get.mock.calls.length).toBe(reads);
  });
  it('bekleyen istekte ikinci gönderim engellenir', async () => {
    let complete!: (value: unknown) => void;
    routeApi(); mocked.post.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    await open(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Ret kararını kaydet' }));
    const waiting = await screen.findByRole('button', { name: 'Reddediliyor…' });
    expect(waiting).toHaveProperty('disabled', true); fireEvent.click(waiting);
    expect(mocked.post).toHaveBeenCalledTimes(1);
    complete({ data: {} }); await waitFor(() => expect(screen.queryByRole('form', { name: 'Belge ret kararı' })).toBeNull());
  });
});

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
