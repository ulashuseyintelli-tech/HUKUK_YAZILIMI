import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import KanbanPage from '../page';
import { api } from '@/lib/api';

/**
 * F01-B (OFP-01 + OFP-02 dürüstlük) — KANBAN: SAYFALI YÜKLEME, SALT OKUNUR İPTAL SÜTUNU, BANA ATANANLAR.
 * stable key: app/(dashboard)/tasks/kanban/page.tsx#loadTasks
 *
 * Sahte /tasks sunucu gibi davranır (page/limit/assigneeId). 120 görev → ilk sayfa 100; pano "100 / 120 görev
 * yüklendi" der ve kalan sayfa "Daha fazla yükle" ile gelir. "İnceleme" sütunu yoktur (API REVIEW'u reddeder);
 * iptal edilen görevler etiketiyle salt okunur sütunda durur, sürüklenemez ve sütun bırakma hedefi değildir.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u-me', tenantId: 't1' }, loading: false }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mocked = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const ALL = Array.from({ length: 120 }, (_, i) => ({
  id: `k${i}`,
  title: `Kart ${i}`,
  status: STATUSES[i % 4],
  priority: 'LOW',
  assignee: i % 2 === 0 ? { id: 'u-me', name: 'Ben', surname: 'Kendim' } : { id: 'u-2', name: 'Ayşe', surname: 'Diğer' },
}));

function serveTasks(url: string) {
  const qs = new URLSearchParams(url.split('?')[1] ?? '');
  const page = Number(qs.get('page') ?? '1');
  const limit = Number(qs.get('limit') ?? '20');
  const assignee = qs.get('assigneeId');
  const rows = ALL.filter((t) => !assignee || t.assignee.id === assignee);
  return {
    data: {
      data: rows.slice((page - 1) * limit, page * limit),
      meta: {
        total: rows.length,
        page,
        limit,
        totalPages: Math.ceil(rows.length / limit),
        summary: { pending: 0, inProgress: 0, operationalOpen: 0 },
      },
    },
  };
}

const taskCalls = () => mocked.get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('/tasks'));
const lastTaskQuery = () => new URLSearchParams(taskCalls().at(-1)!.split('?')[1] ?? '');
const cards = () => screen.getAllByText(/^Kart \d+$/);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.get.mockImplementation((url: string) => Promise.resolve(serveTasks(String(url))));
});
afterEach(() => cleanup());

describe('Kanban — sayfalı yükleme ve sunucu toplamı', () => {
  it('ilk yükleme page=1&limit=100: 100 kart, "100 / 120 görev yüklendi"; Daha fazla yükle → page=2 → 120 kart', async () => {
    render(<KanbanPage />);
    await screen.findByText('Kart 0');

    expect(lastTaskQuery().get('page')).toBe('1');
    expect(lastTaskQuery().get('limit')).toBe('100');
    expect(cards()).toHaveLength(100);
    expect(screen.getByTestId('kanban-loaded').textContent).toContain('100 / 120 görev yüklendi');

    fireEvent.click(screen.getByRole('button', { name: /Daha fazla yükle \(100 \/ 120\)/ }));
    await screen.findByText('Kart 119');
    expect(lastTaskQuery().get('page')).toBe('2');
    expect(cards()).toHaveLength(120);
    expect(screen.getByTestId('kanban-loaded').textContent).toContain('120 / 120 görev yüklendi');
    expect(screen.queryByRole('button', { name: /Daha fazla yükle/ })).toBeNull();
    expect(mocked.put).not.toHaveBeenCalled();
  });

  it("meta'sız dizi yanıtı: pano çalışır, 'Daha fazla yükle' ve yüklenme etiketi yoktur", async () => {
    mocked.get.mockResolvedValue({ data: [{ id: 'x', title: 'Tek görev', status: 'PENDING', priority: 'LOW' }] });
    render(<KanbanPage />);

    await screen.findByText('Tek görev');
    expect(screen.queryByRole('button', { name: /Daha fazla yükle/ })).toBeNull();
    expect(screen.queryByTestId('kanban-loaded')).toBeNull();
  });
});

describe('Kanban — dürüst durumlar', () => {
  it('"İnceleme" sütunu yok; iptal edilenler etiketli SALT OKUNUR sütunda, kartlar sürüklenemez, sütun bırakma hedefi değil', async () => {
    render(<KanbanPage />);
    await screen.findByText('Kart 0');

    expect(screen.queryByText('İnceleme')).toBeNull();
    const col = screen.getByTestId('kanban-cancelled-column');
    expect(within(col).getByText('İptal Edilen')).toBeInTheDocument();
    const cancelledCard = within(col).getByText('Kart 3').closest('.bg-white') as HTMLElement;
    expect(cancelledCard.getAttribute('draggable')).toBe('false');
    expect(within(col).getAllByText('İptal edildi').length).toBeGreaterThan(0);

    const pendingCard = screen.getByText('Kart 0').closest('.bg-white') as HTMLElement;
    expect(pendingCard.getAttribute('draggable')).toBe('true');

    // Bekleyen kartı iptal sütununa bırakmak hiçbir mutasyon üretmez; kart yerinde kalır.
    fireEvent.dragStart(pendingCard);
    fireEvent.dragOver(col);
    fireEvent.drop(col);
    await Promise.resolve();
    expect(mocked.put).not.toHaveBeenCalled();
    expect(within(screen.getByText('Bekliyor').closest('div')!.parentElement!).getByText('Kart 0')).toBeInTheDocument();
  });

  it('Yeni Görev bağlantısı çalışan yola gider: /tasks#yeni (eski /tasks/new 404 idi)', async () => {
    render(<KanbanPage />);
    await screen.findByText('Kart 0');
    expect(screen.getByRole('link', { name: /Yeni Görev/ })).toHaveAttribute('href', '/tasks#yeni');
  });
});

describe('Kanban — bana atananlar süzgeci', () => {
  it('işaretlenince assigneeId=u-me ile sayfa 1\'den yeniden yükler; yalnız benim kartlarım ve kapsam etiketi', async () => {
    render(<KanbanPage />);
    await screen.findByText('Kart 0');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Bana atananlar' }));
    await waitFor(() => expect(lastTaskQuery().get('assigneeId')).toBe('u-me'));
    expect(lastTaskQuery().get('page')).toBe('1');
    await waitFor(() => expect(cards()).toHaveLength(60));
    expect(screen.queryByText('Kart 1')).toBeNull();
    expect(screen.getByTestId('kanban-loaded').textContent).toContain('60 / 60 görev yüklendi (bana atananlar)');
    expect(screen.queryByRole('button', { name: /Daha fazla yükle/ })).toBeNull();
  });
});
