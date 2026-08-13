import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PortalLayout from '../layout';

/**
 * WSMR-A4g — PORTAL BİLDİRİM ZİLİ.
 *
 * En ağır hat `markAsRead` / `markAllAsRead` idi: `fetch` yanıtı HİÇ kontrol
 * edilmiyordu. `fetch` yalnız ağ hatasında reject eder — 403/500 gibi yanıtlar
 * normal biçimde çözülür. Yani sunucu yazmayı REDDETSE bile bildirim yerelde
 * "okundu" işaretleniyor, okunmamış sayacı düşüyordu. Müvekkil, gerçekte hâlâ
 * okunmamış duran bir bildirimi ele alınmış sanabilirdi — sayaç bir sonraki
 * 30 saniyelik yoklamada geri dönerdi ama bildirim çoktan gözden kaçmış olurdu.
 *
 * İkinci hat: `fetchNotifications` / `fetchUnreadCount` boş catch ile
 * yutuluyordu; okuma hatası "Bildirim yok" ile aynı görünüyordu.
 */

const TOKEN = 'portal-test-token';

const NOTIFICATIONS = [
  {
    id: 'n1',
    type: 'CASE',
    title: 'Dosyanızda gelişme',
    message: 'Haciz talebi işleme alındı.',
    isRead: false,
    createdAt: '2026-08-01T10:00:00.000Z',
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

// Router nesnesi KARARLI olmali: layout'un ilk effect'i [pathname, router]
// bagimliligiyla calisir ve icinde setUser(JSON.parse(...)) ile HER SEFERINDE
// yeni bir nesne uretir. Her render'da yeni bir router dondurulurse effect
// sonsuz tetiklenir (gercek next/navigation kararli referans dondurur).
const STABLE_ROUTER = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => STABLE_ROUTER,
  usePathname: () => '/portal',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

beforeEach(() => {
  window.localStorage.setItem('portal_token', TOKEN);
  window.localStorage.setItem('portal_user', JSON.stringify({ name: 'Test Müvekkil' }));
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function routeFetch(handlers: {
  list?: () => unknown;
  count?: () => unknown;
  markRead?: () => unknown;
  markAll?: () => unknown;
}) {
  fetchMock.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes('unread-count')) {
      return Promise.resolve(handlers.count?.() ?? { ok: true, json: () => Promise.resolve({ count: 1 }) });
    }
    if (u.includes('read-all')) return Promise.resolve(handlers.markAll?.() ?? { ok: true });
    if (u.includes('/read')) return Promise.resolve(handlers.markRead?.() ?? { ok: true });
    return Promise.resolve(handlers.list?.() ?? { ok: true, json: () => Promise.resolve(NOTIFICATIONS) });
  });
}

const openBell = async () => {
  const bell = (await screen.findAllByRole('button'))[0];
  fireEvent.click(bell);
};

describe('Portal bildirimleri — okundu isaretleme', () => {
  it('SUNUCU REDDEDERSE bildirim yerelde okundu SAYILMAZ, hata gorunur', async () => {
    routeFetch({ markRead: () => ({ ok: false, status: 403 }) });
    render(<PortalLayout><div>icerik</div></PortalLayout>);

    await openBell();
    fireEvent.click(await screen.findByText('Dosyanızda gelişme'));

    expect(await screen.findByRole('alert')).toBeTruthy();
    // Sahte "okundu" uretilmedi: okunmamis rozeti hala 1.
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('tumunu-okundu sunucu reddederse yerelde sifirlanmaz', async () => {
    routeFetch({ markAll: () => ({ ok: false, status: 500 }) });
    render(<PortalLayout><div>icerik</div></PortalLayout>);

    await openBell();
    fireEvent.click(await screen.findByRole('button', { name: /Tümünü Okundu İşaretle/ }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('basarili isaretleme: hata YOK', async () => {
    routeFetch({});
    render(<PortalLayout><div>icerik</div></PortalLayout>);

    await openBell();
    fireEvent.click(await screen.findByRole('button', { name: /Tümünü Okundu İşaretle/ }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('Portal bildirimleri — okuma', () => {
  it('liste okuma hatasi "Bildirim yok" ile AYNI gorunmez', async () => {
    routeFetch({ list: () => ({ ok: false, status: 500 }) });
    render(<PortalLayout><div>icerik</div></PortalLayout>);

    await openBell();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Bildirim yok')).toBeNull();
  });

  it('bozuk govde (dizi degil) BASARI sayilmaz', async () => {
    routeFetch({ list: () => ({ ok: true, json: () => Promise.resolve({ nope: 1 }) }) });
    render(<PortalLayout><div>icerik</div></PortalLayout>);

    await openBell();

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('gercekten bos liste: hata DEGIL, "Bildirim yok"', async () => {
    routeFetch({
      list: () => ({ ok: true, json: () => Promise.resolve([]) }),
      count: () => ({ ok: true, json: () => Promise.resolve({ count: 0 }) }),
    });
    render(<PortalLayout><div>icerik</div></PortalLayout>);

    await openBell();

    expect(await screen.findByText('Bildirim yok')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sayac govdesi bozuksa rozet UYDURULMAZ', async () => {
    routeFetch({ count: () => ({ ok: true, json: () => Promise.resolve({ count: 'cok' }) }) });
    render(<PortalLayout><div>icerik</div></PortalLayout>);

    await screen.findByText('icerik');
    // Sayi olmayan govdeden rozet basilmaz.
    await vi.waitFor(() => expect(screen.queryByText('cok')).toBeNull());
  });
});
