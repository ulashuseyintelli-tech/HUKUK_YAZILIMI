import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PortalMessagesPage from '../page';

/**
 * WSMR-A4g — MÜVEKKİL PORTALI MESAJLAŞMA.
 *
 * İki ayrı sessiz hat vardı:
 *
 * 1. `handleSend` — `if (res.ok)` dışında HİÇBİR ŞEY yapılmıyordu. Sunucu 403/500
 *    dönse de hata görünmüyor, "Gönder" düğmesi normale dönüyordu. Müvekkil,
 *    bürosuna hiç ulaşmayan bir mesajı gönderilmiş sanabilirdi. (`fetch` yalnız
 *    ağ hatasında reject eder; HTTP hataları normal çözülür.)
 *
 * 2. `fetchMessages` — okuma başarısızsa liste boş kalıyor ve ekranda
 *    "Henüz mesaj yok" yazıyordu. Yani bürodan gelmiş bir mesaj varken yazışma
 *    boş görünüyordu.
 *
 * 3. 4d supersedes the old mount-time background acknowledgement:
 *    an explicit message open is now a user action; failure is visible and cannot claim read.
 */

const TOKEN = 'portal-test-token';

const REAL_MESSAGES = [
  {
    id: 'm1',
    content: 'Duruşma tarihi belli oldu.',
    senderType: 'OFFICE',
    senderName: 'Büro',
    isRead: false,
    createdAt: '2026-08-01T10:00:00.000Z',
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.setItem('portal_token', TOKEN);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Yol bazli yanit yonlendirici — her uc endpoint ayri ayri kurgulanabilir. */
function routeFetch(handlers: {
  list?: () => unknown;
  markRead?: () => unknown;
  send?: () => unknown;
}) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/messages/mark-read')) {
      return Promise.resolve(handlers.markRead?.() ?? { ok: true, json: async () => ({ success: true }) });
    }
    if (init?.method === 'POST') {
      return Promise.resolve(handlers.send?.() ?? { ok: true });
    }
    return Promise.resolve(
      handlers.list?.() ?? { ok: true, json: () => Promise.resolve(REAL_MESSAGES) },
    );
  });
}

const okList = (rows: unknown = REAL_MESSAGES) => ({ ok: true, json: () => Promise.resolve(rows) });

describe('Portal mesajlar — okuma', () => {
  it('okuma hatasi "Henuz mesaj yok" ile AYNI gorunmez', async () => {
    routeFetch({ list: () => ({ ok: false, status: 500 }) });
    render(<PortalMessagesPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Henüz mesaj yok')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('ag hatasinda da gorunur hata verir', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));
    render(<PortalMessagesPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Henüz mesaj yok')).toBeNull();
  });

  it('bozuk govde (dizi degil) BASARI sayilmaz', async () => {
    routeFetch({ list: () => okList({ unexpected: true }) });
    render(<PortalMessagesPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('gercekten bos liste: hata DEGIL, "Henuz mesaj yok"', async () => {
    routeFetch({ list: () => okList([]) });
    render(<PortalMessagesPage />);

    expect(await screen.findByText('Henüz mesaj yok')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('basarili okuma: mesaj govdesi gorunur', async () => {
    routeFetch({});
    render(<PortalMessagesPage />);

    expect(await screen.findByText('Duruşma tarihi belli oldu.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Portal mesajlar — gonderme', () => {
  const typeAndSend = async (text: string) => {
    const box = await screen.findByPlaceholderText('Mesajınızı yazın...');
    fireEvent.change(box, { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: /Gönder/ }));
    return box as HTMLTextAreaElement;
  };

  it('HTTP hatasi: gorunur hata verir ve metin KAYBOLMAZ', async () => {
    routeFetch({ send: () => ({ ok: false, status: 500 }) });
    render(<PortalMessagesPage />);
    const box = await typeAndSend('Merhaba, dosyam ne durumda?');

    expect(await screen.findByRole('alert')).toBeTruthy();
    // Metin korunur -> kullanici yeniden gonderebilir, yazdigini kaybetmez.
    expect(box.value).toBe('Merhaba, dosyam ne durumda?');
  });

  it('ag hatasi: gorunur hata verir', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && !String(url).includes('mark-read')) {
        return Promise.reject(new Error('Failed to fetch'));
      }
      return Promise.resolve(okList());
    });
    render(<PortalMessagesPage />);
    await typeAndSend('deneme');

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('basarili gonderim: hata YOK ve metin temizlenir', async () => {
    routeFetch({});
    render(<PortalMessagesPage />);
    const box = await typeAndSend('deneme');

    await vi.waitFor(() => expect(box.value).toBe(''));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Portal mesajlar — 4d explicit recipient open', () => {
  it('explicit open failure is visible and keeps the message available', async () => {
    routeFetch({ markRead: () => ({ ok: false, status: 500 }) });
    render(<PortalMessagesPage />);

    expect(await screen.findByText('Duruşma tarihi belli oldu.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    const details = screen.getByText('Duruşma tarihi belli oldu.').closest('details')!;
    details.open = true; fireEvent(details, new Event("toggle"));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Duruşma tarihi belli oldu.')).toBeTruthy();
  });

  it('mount and successful list cause no write; explicit open sends the exact ID', async () => {
    routeFetch({});
    render(<PortalMessagesPage />);
    await screen.findByText('Duruşma tarihi belli oldu.');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/messages/mark-read'))).toHaveLength(0);
    const details = screen.getByText('Duruşma tarihi belli oldu.').closest('details')!;
    details.open = true; fireEvent(details, new Event("toggle"));
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/messages/mark-read'))).toHaveLength(1));

    const markReadCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/messages/mark-read'),
    );
    expect(markReadCalls.length).toBeGreaterThan(0);
    expect(markReadCalls[0][1]).toMatchObject({ body: JSON.stringify({ messageId: 'm1' }) });
  });

  it('a failed/malformed list never acknowledges any message', async () => {
    routeFetch({ list: () => okList({ messages: REAL_MESSAGES }) }); render(<PortalMessagesPage />);
    await screen.findByRole('alert'); expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/mark-read'))).toHaveLength(0);
  });
  it('repeated opens while the first request is pending do not duplicate it', async () => {
    let complete!: (value: unknown) => void;
    routeFetch({ markRead: () => new Promise(resolve => { complete = resolve; }) }); render(<PortalMessagesPage />);
    const details = (await screen.findByText(REAL_MESSAGES[0].content)).closest('details')!;
    details.open = true; fireEvent(details, new Event("toggle")); fireEvent(details, new Event("toggle"));
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/mark-read'))).toHaveLength(1));
    complete({ ok: true, json: async () => ({ success: true }) });
  });
  it('an old conversation cannot acknowledge with a newly substituted token', async () => {
    routeFetch({}); render(<PortalMessagesPage />);
    const details = (await screen.findByText(REAL_MESSAGES[0].content)).closest('details')!;
    localStorage.setItem('portal_token', 'OTHER-ACCOUNT'); details.open = true; fireEvent(details, new Event("toggle"));
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes('/mark-read'))).toHaveLength(2));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/mark-read'))).toHaveLength(0);
  });
});
