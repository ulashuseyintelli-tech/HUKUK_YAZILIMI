import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import CalendarPage from '../page';
import { api } from '@/lib/api';

/**
 * PR-2A1 — TAKVIM ETKINLIK DAVRANIS MATRISI
 * stable keys:
 *   app/(dashboard)/calendar/page.tsx#handleAddEvent
 *   app/(dashboard)/calendar/page.tsx#handleUpdateEvent
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function primeReads(over: Record<string, unknown> = {}) {
  mocked.get.mockImplementation((url: string) => {
    if (String(url).startsWith('/calendar/events')) {
      const hit = over.events ?? { data: { data: [] } };
      if (hit instanceof Error) return Promise.reject(hit);
      return Promise.resolve(hit);
    }
    return Promise.resolve({ data: { data: [] } });
  });
}

async function openAddModal() {
  render(<CalendarPage />);
  await waitFor(() => expect(mocked.get).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /Etkinlik Ekle/i }));
  const save = await screen.findByRole('button', { name: 'Kaydet' });
  const modal = save.closest('div.fixed') as HTMLElement;
  const title = modal.querySelector('input[type="text"]') as HTMLInputElement;
  fireEvent.change(title, { target: { value: 'Durusma hazirlik' } });
  const date = modal.querySelector('input[type="date"]') as HTMLInputElement;
  fireEvent.change(date, { target: { value: '2026-09-01' } });
  return save as HTMLButtonElement;
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

describe('calendar#handleAddEvent', () => {
  it('success → POST /calendar/events + modal kapanir + canonical reload', async () => {
    mocked.post.mockResolvedValueOnce({ data: {} });
    const save = await openAddModal();
    const before = mocked.get.mock.calls.length;
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocked.post).toHaveBeenCalledWith(
        '/calendar/events',
        expect.objectContaining({ title: 'Durusma hazirlik', date: '2026-09-01' }),
      ),
    );
    await waitFor(() => expect(mocked.get.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull());
  });

  it('backend hata → GORUNUR; modal ACIK, form KORUNUR', async () => {
    mocked.post.mockRejectedValueOnce({ body: { message: 'Tarih geçmişte.' } });
    const save = await openAddModal();
    fireEvent.click(save);

    await screen.findAllByText(/Tarih geçmişte/i);
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeTruthy();
    expect(screen.getByDisplayValue('Durusma hazirlik')).toBeTruthy();
  });

  it('AYNI-TICK cift tik → TEK POST', async () => {
    let release!: (v: unknown) => void;
    mocked.post.mockImplementation(() => new Promise((res) => { release = res; }));
    const save = await openAddModal();

    act(() => {
      save.click();
      save.click();
    });
    await Promise.resolve();
    expect(mocked.post).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ data: {} });
    });
  });

  it('mutation OK + reload FAIL → SUCCESS_STALE; modal KAPALI, refresh-only mutation 0', async () => {
    mocked.post.mockResolvedValueOnce({ data: {} });
    const save = await openAddModal();
    primeReads({ events: new TypeError('Failed to fetch') });
    fireEvent.click(save);

    await screen.findByTestId('stale-notice');
    expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull();
    expect(mocked.post).toHaveBeenCalledTimes(1);

    primeReads();
    fireEvent.click(screen.getByTestId('stale-refresh'));
    await waitFor(() => expect(screen.queryByTestId('stale-notice')).toBeNull());
    expect(mocked.post).toHaveBeenCalledTimes(1);
  });

  it('malformed yanit EMPTY sayilmaz → gorunur load error', async () => {
    primeReads({ events: { data: { data: { not: 'array' } } } });
    render(<CalendarPage />);
    await screen.findByText(/Takvim etkinlikleri yüklenemedi/i);
  });
});

describe('calendar#handleUpdateEvent', () => {
  it('kaynakta iki handler icin bos catch / console.error KALMADI', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');
    for (const fn of ['handleAddEvent', 'handleUpdateEvent']) {
      const i = src.indexOf(`const ${fn} = async`);
      expect(i, fn).toBeGreaterThan(-1);
      const next = src.indexOf('const handle', i + 10);
      const seg = src.slice(i, next > i ? next : i + 1600);
      expect(seg, fn).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
      expect(seg, fn).not.toMatch(/console\.error/);
      expect(seg, fn).toContain('runMutation');
    }
  });

  it('update → PUT /calendar/events/:id ve modal yalniz basari sonrasi kapanir (statik)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');
    const i = src.indexOf('const handleUpdateEvent = async');
    const seg = src.slice(i, i + 1600);
    // FAILED dalinda modal kapatma YOK; kapama yalniz outcome kontrolunden SONRA.
    const failedBranch = seg.slice(seg.indexOf("=== 'FAILED'"), seg.indexOf("=== 'FAILED'") + 260);
    expect(failedBranch).not.toContain('setShowAddModal(false)');
    expect(seg).toContain('calendar:event:save:');
  });
});
