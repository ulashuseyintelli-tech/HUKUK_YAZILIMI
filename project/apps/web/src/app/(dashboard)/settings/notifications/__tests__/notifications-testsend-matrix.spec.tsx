import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import NotificationsPage from '../page';
import { api } from '@/lib/api';

/**
 * PR-2A1 — GERCEK TEST GONDERIMI DAVRANIS MATRISI
 * stable key: app/(dashboard)/settings/notifications/page.tsx#doTestSend
 *
 * KRITIK: bu uc GERCEK musteriye gercek e-posta/SMS gonderir. Eski kod tazelemeyi
 * mutation ile ayni try'da tutuyordu — tazeleme dusunce BASARILI gonderim
 * "Gönderim başarısız" diye raporlaniyordu; kullanici tekrar deneyip CIFT bildirim
 * uretebilirdi. Yeni sozlesme: basari GERI CEVRILMEZ; yalniz stale + refresh-only.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('next/link', () => ({ default: (p: { children: unknown }) => p.children }));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const OVERVIEW = {
  generatedAt: '2026-08-12T00:00:00.000Z',
  channels: {
    email: { configured: true, host: 'smtp.test', sender: 'test@x' },
    sms: { configured: false, provider: null, title: null },
  },
  engines: {
    greeting: { status: 'ACTIVE', time: '09:00' },
    escalation: {
      status: 'ACTIVE', reminderDays: 3, founderDays: 6, channels: ['EMAIL'],
      last24hSent: 0, last24hFailed: 0,
    },
    poa: { status: 'PLANNED', reason: 'flag kapali' },
  },
  stats: {
    last24hSent: 0, last24hFailed: 0, last24hPending: 0,
    last24hEscalationSent: 0, last24hEscalationFailed: 0,
    activeEngines: 2, attentionEngines: 0, plannedEngines: 1,
  },
  recentDeliveries: [],
  failureGroups: [],
};

const CLIENTS = [{ id: 'c1', name: 'Test', surname: 'Muvekkil', email: 'client@x.test', contacts: [] }];

function primeReads(over: Record<string, unknown> = {}) {
  mocked.get.mockImplementation((url: string) => {
    const key = String(url);
    if (key.startsWith('/client-notifications/overview')) {
      const hit = over.overview ?? { data: { data: OVERVIEW } };
      if (hit instanceof Error) return Promise.reject(hit);
      return Promise.resolve(hit);
    }
    if (key.startsWith('/clients')) return Promise.resolve({ data: { data: CLIENTS } });
    return Promise.resolve({ data: {} });
  });
}

const EMAIL_BTN = /Gerçek test e-postası gönder/i;

async function armTestPanel() {
  render(<NotificationsPage />);
  const select = await screen.findByRole('combobox');
  fireEvent.change(select, { target: { value: 'c1' } });
  fireEvent.click(screen.getByRole('checkbox'));
  const btn = screen.getByRole('button', { name: EMAIL_BTN }) as HTMLButtonElement;
  await waitFor(() => expect(btn.disabled).toBe(false));
  return btn;
}

let unhandled: unknown[] = [];
const onUnhandled = (e: PromiseRejectionEvent) => {
  unhandled.push(e.reason);
  e.preventDefault();
};

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeReads();
  unhandled = [];
  window.addEventListener('unhandledrejection', onUnhandled);
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  const unh = unhandled;
  window.removeEventListener('unhandledrejection', onUnhandled);
  cleanup();
  vi.restoreAllMocks();
  expect(unh).toHaveLength(0);
});

describe('notifications#doTestSend', () => {
  it('success → POST dogru payload + sonuc SUNUCU payload’undan gosterilir', async () => {
    mocked.post.mockResolvedValueOnce({
      data: { data: { success: true, channel: 'EMAIL', status: 'SENT', recipient: 'c***@x.test' } },
    });
    const btn = await armTestPanel();
    fireEvent.click(btn);

    await waitFor(() =>
      expect(mocked.post).toHaveBeenCalledWith('/client-notifications/test-send', {
        clientId: 'c1',
        channel: 'EMAIL',
        confirm: true,
      }),
    );
    await screen.findByText(/SENT|Gönderildi/i);
  });

  it('backend hata → GORUNUR failure sonucu; gonderim yapilmadi', async () => {
    mocked.post.mockRejectedValueOnce({ body: { message: 'SMTP reddetti.' } });
    const btn = await armTestPanel();
    fireEvent.click(btn);
    await screen.findByText(/SMTP reddetti/i);
    expect(mocked.post).toHaveBeenCalledTimes(1);
  });

  it('KRITIK: mutation OK + reload FAIL → basari GERI CEVRILMEZ; tekrar gonderim SUNULMAZ', async () => {
    mocked.post.mockResolvedValueOnce({
      data: { data: { success: true, channel: 'EMAIL', status: 'SENT' } },
    });
    const btn = await armTestPanel();
    primeReads({ overview: new TypeError('Failed to fetch') });
    fireEvent.click(btn);

    // Eski kod burada "Gönderim başarısız" gosterirdi → cift bildirim tuzagi.
    await screen.findByTestId('test-stale-notice');
    expect(screen.queryByText(/Gönderim başarısız/i)).toBeNull();
    await screen.findByText(/SENT|Gönderildi/i);
    expect(mocked.post).toHaveBeenCalledTimes(1);

    // refresh-only: mutation CAGRILMAZ
    primeReads();
    fireEvent.click(screen.getByTestId('test-stale-refresh'));
    await waitFor(() => expect(screen.queryByTestId('test-stale-notice')).toBeNull());
    expect(mocked.post).toHaveBeenCalledTimes(1);
  });

  it('AYNI-TICK cift tik → TEK gercek gonderim (senkron kilit)', async () => {
    let release!: (v: unknown) => void;
    mocked.post.mockImplementation(() => new Promise((res) => { release = res; }));
    const btn = await armTestPanel();

    act(() => {
      btn.click();
      btn.click();
    });
    await Promise.resolve();
    expect(mocked.post).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ data: { data: { success: true, channel: 'EMAIL', status: 'SENT' } } });
    });
  });

  it('kaynakta bos catch / console.error KALMADI', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');
    const fn = src.slice(src.indexOf('const doTestSend'), src.indexOf('return ('));
    expect(fn).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
    expect(fn).not.toMatch(/console\.error/);
  });
});
