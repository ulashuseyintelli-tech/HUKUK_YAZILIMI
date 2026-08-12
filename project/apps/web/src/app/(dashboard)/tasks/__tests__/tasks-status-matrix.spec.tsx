import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import TasksPage from '../page';
import { api } from '@/lib/api';

/**
 * PR-2A1 — GOREV DURUM DEGISIKLIGI DAVRANIS MATRISI
 * stable key: app/(dashboard)/tasks/page.tsx#handleStatusChange
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const TASK = {
  id: 't1',
  title: 'Tebligat kontrolu',
  status: 'PENDING',
  priority: 'MEDIUM',
  createdAt: '2026-08-01T00:00:00.000Z',
};

function primeReads(over: Record<string, unknown> = {}) {
  mocked.get.mockImplementation((url: string) => {
    const key = String(url);
    const map: Array<[string, unknown]> = [
      ['/tasks', over['/tasks'] ?? { data: { data: [TASK] } }],
      ['/cases', { data: { data: [] } }],
      ['/users', { data: { data: [] } }],
    ];
    for (const [prefix, hit] of map) {
      if (key.startsWith(prefix)) {
        if (hit instanceof Error) return Promise.reject(hit);
        return Promise.resolve(hit);
      }
    }
    return Promise.resolve({ data: { data: [] } });
  });
}

async function renderTasks() {
  render(<TasksPage />);
  await screen.findByText('Tebligat kontrolu');
}

/** Durum toggle dugmesi: gorev basligini tasiyan kartin icindeki ilk dugme. */
function statusToggle(): HTMLElement {
  const title = screen.getByText('Tebligat kontrolu');
  const card = title.closest('div.bg-white, div[class*="rounded"], li, article') ?? title.parentElement!;
  const root = (card.parentElement ?? card) as HTMLElement;
  const btn = root.querySelector('button');
  if (!btn) throw new Error('durum toggle dugmesi bulunamadi');
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

describe('tasks#handleStatusChange', () => {
  it('success → PUT /tasks/:id dogru payload + canonical reload', async () => {
    mocked.put.mockResolvedValueOnce({ data: {} });
    await renderTasks();
    const before = mocked.get.mock.calls.filter(([u]) => String(u).startsWith('/tasks')).length;

    fireEvent.click(statusToggle());

    await waitFor(() =>
      expect(mocked.put).toHaveBeenCalledWith('/tasks/t1', { status: 'COMPLETED' }),
    );
    await waitFor(() =>
      expect(
        mocked.get.mock.calls.filter(([u]) => String(u).startsWith('/tasks')).length,
      ).toBeGreaterThan(before),
    );
  });

  it('backend hata → GORUNUR; durum DEGISMEZ, canonical geri okunur', async () => {
    mocked.put.mockRejectedValueOnce({ body: { message: 'Görev kilitli.' } });
    await renderTasks();
    fireEvent.click(statusToggle());

    await screen.findByText(/Görev kilitli/i);
    // canonical reload calisti → eski durum geri gorunur
    expect(screen.getByText('Tebligat kontrolu')).toBeTruthy();
  });

  it('network hatasi GORUNUR', async () => {
    mocked.put.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await renderTasks();
    fireEvent.click(statusToggle());
    await screen.findByText(/Sunucuya ulaşılamadı/i);
  });

  it('AYNI goreve ayni-tick cift tik → TEK mutation', async () => {
    let release!: (v: unknown) => void;
    mocked.put.mockImplementation(() => new Promise((res) => { release = res; }));
    await renderTasks();
    const btn = statusToggle();

    act(() => {
      btn.click();
      btn.click();
    });
    await Promise.resolve();
    expect(mocked.put).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ data: {} });
    });
  });

  it('mutation OK + reload FAIL → SUCCESS_STALE + refresh-only (mutation 0)', async () => {
    mocked.put.mockResolvedValueOnce({ data: {} });
    await renderTasks();
    primeReads({ '/tasks': new TypeError('Failed to fetch') });
    fireEvent.click(statusToggle());

    await screen.findByTestId('stale-notice');
    expect(mocked.put).toHaveBeenCalledTimes(1);

    primeReads();
    fireEvent.click(screen.getByTestId('stale-refresh'));
    await waitFor(() => expect(screen.queryByTestId('stale-notice')).toBeNull());
    expect(mocked.put).toHaveBeenCalledTimes(1);
  });

  it('malformed /tasks yaniti EMPTY sayilmaz → gorunur load error', async () => {
    primeReads({ '/tasks': { data: { data: { not: 'array' } } } });
    render(<TasksPage />);
    await screen.findByText(/Görevler yüklenemedi/i);
  });

  it('kaynakta bos catch / console.error KALMADI', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');
    const fn = src.slice(src.indexOf('const handleStatusChange'), src.indexOf('const openEditModal'));
    expect(fn).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
    expect(fn).not.toMatch(/console\.error/);
  });
});
