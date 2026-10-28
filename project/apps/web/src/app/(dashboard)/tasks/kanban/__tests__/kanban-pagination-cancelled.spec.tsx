import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import KanbanPage from '../page';
import { api } from '@/lib/api';

/**
 * F01-B (OFP-01 + OFP-02 dürüstlük) — KANBAN: SAYFALI YÜKLEME, SALT OKUNUR İPTAL SÜTUNU, ATANANA GÖRE SÜZGEÇ.
 * stable key: app/(dashboard)/tasks/kanban/page.tsx#loadTasks
 *
 * Sahte /tasks sunucu gibi davranır (page/limit/assigneeId); /users iki kullanıcı döner (biri pasif). 104 görev →
 * ilk sayfa 100; pano "100 / 104 görev yüklendi" der ve kalan sayfa "Daha fazla yükle" ile gelir. (100+ kartın
 * jsdom'da çizimi CI koşucusunda 5 sn'yi aşabildi → ağır testlere açık zaman aşımı verildi; süzgeç testleri küçük
 * fixture kullanır.) "İnceleme" sütunu yoktur (API REVIEW'u reddeder); iptal edilen görevler etiketiyle salt okunur
 * sütunda durur, sürüklenemez ve sütun bırakma hedefi değildir. "Atanana göre" süzgeci liste sayfasıyla aynı
 * sözleşmeyi kullanır: "" / "me" / <userId> → assigneeId; /users düşerse pano yine gelir.
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

const USERS = [
  { id: 'u-me', name: 'Ben', surname: 'Kendim', isActive: true },
  { id: 'u-2', name: 'Ayşe', surname: 'Diğer', isActive: false },
];

const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const ALL = Array.from({ length: 104 }, (_, i) => ({
  id: `k${i}`,
  title: `Kart ${i}`,
  status: STATUSES[i % 4],
  priority: 'LOW',
  assignee: i % 2 === 0 ? { id: 'u-me', name: 'Ben', surname: 'Kendim' } : { id: 'u-2', name: 'Ayşe', surname: 'Diğer' },
}));
/** Süzgeç testleri için hafif fixture: 4 bana (çift), 4 Ayşe'ye (tek) atanmış. */
const SMALL = ALL.slice(0, 8);

function serveTasks(url: string, source: typeof ALL) {
  const qs = new URLSearchParams(url.split('?')[1] ?? '');
  const page = Number(qs.get('page') ?? '1');
  const limit = Number(qs.get('limit') ?? '20');
  const assignee = qs.get('assigneeId');
  const rows = source.filter((t) => !assignee || t.assignee.id === assignee);
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

/** Sahte sunucu: /users (ok | fail) + /tasks (verilen kaynaktan sayfalı). */
function serve(url: string, opts: { users?: 'ok' | 'fail'; tasks?: typeof ALL } = {}) {
  if (url.startsWith('/users')) {
    if (opts.users === 'fail') return Promise.reject(new Error('users down'));
    return Promise.resolve({ data: { data: USERS } });
  }
  return Promise.resolve(serveTasks(url, opts.tasks ?? ALL));
}

const calls = (prefix: string) => mocked.get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith(prefix));
const taskCalls = () => calls('/tasks');
const lastTaskQuery = () => new URLSearchParams(taskCalls().at(-1)!.split('?')[1] ?? '');
const cards = () => screen.getAllByText(/^Kart \d+$/);
const assigneeSelect = () => screen.getByLabelText('Atanana göre') as HTMLSelectElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.get.mockImplementation((url: string) => serve(String(url)));
});
afterEach(() => cleanup());

describe('Kanban — sayfalı yükleme ve sunucu toplamı', () => {
  it('ilk yükleme page=1&limit=100: 100 kart, "100 / 104 görev yüklendi"; Daha fazla yükle → page=2 → 104 kart', { timeout: 20_000 }, async () => {
    render(<KanbanPage />);
    await screen.findByText('Kart 0');

    expect(lastTaskQuery().get('page')).toBe('1');
    expect(lastTaskQuery().get('limit')).toBe('100');
    expect(cards()).toHaveLength(100);
    expect(screen.getByTestId('kanban-loaded').textContent).toContain('100 / 104 görev yüklendi');

    fireEvent.click(screen.getByRole('button', { name: /Daha fazla yükle \(100 \/ 104\)/ }));
    await screen.findByText('Kart 103');
    expect(lastTaskQuery().get('page')).toBe('2');
    expect(cards()).toHaveLength(104);
    expect(screen.getByTestId('kanban-loaded').textContent).toContain('104 / 104 görev yüklendi');
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

describe('Kanban — atanana göre süzgeci', () => {
  it("seçenekler /users kaynağından gelir: Tüm atananlar, Bana atananlar, kullanıcılar (pasif '(pasif)' ekiyle); açılışta süzgeç yok", async () => {
    mocked.get.mockImplementation((url: string) => serve(String(url), { tasks: SMALL }));
    render(<KanbanPage />);
    await screen.findByText('Kart 0');

    const select = assigneeSelect();
    expect(select.value).toBe('');
    expect(within(select).getByRole('option', { name: 'Tüm atananlar' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Bana atananlar' })).toBeInTheDocument();
    await within(select).findByRole('option', { name: 'Ayşe Diğer (pasif)' });
    expect(within(select).getByRole('option', { name: 'Ben Kendim' })).toBeInTheDocument();
    expect(calls('/users')).toHaveLength(1);
    expect(lastTaskQuery().has('assigneeId')).toBe(false);
    expect(screen.getByTestId('kanban-loaded').textContent).toBe(' · 8 / 8 görev yüklendi');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Bana atananlar seçilince assigneeId=u-me ile sayfa 1 olarak yeniden yükler; yalnız benim kartlarım ve kapsam etiketi', { timeout: 20_000 }, async () => {
    render(<KanbanPage />);
    await screen.findByText('Kart 0');

    fireEvent.change(assigneeSelect(), { target: { value: 'me' } });
    await waitFor(() => expect(lastTaskQuery().get('assigneeId')).toBe('u-me'));
    expect(lastTaskQuery().get('page')).toBe('1');
    await waitFor(() => expect(cards()).toHaveLength(52));
    expect(screen.queryByText('Kart 1')).toBeNull();
    expect(screen.getByTestId('kanban-loaded').textContent).toContain('52 / 52 görev yüklendi (bana atananlar)');
    expect(screen.queryByRole('button', { name: /Daha fazla yükle/ })).toBeNull();
  });

  it('bir kullanıcı seçilince assigneeId=<id>, page=1 ve etiket "(atanan: Ad Soyad)"; "Tüm atananlar" süzgeci kaldırır', async () => {
    mocked.get.mockImplementation((url: string) => serve(String(url), { tasks: SMALL }));
    render(<KanbanPage />);
    await screen.findByText('Kart 0');
    await within(assigneeSelect()).findByRole('option', { name: 'Ayşe Diğer (pasif)' });

    fireEvent.change(assigneeSelect(), { target: { value: 'u-2' } });
    await waitFor(() => expect(lastTaskQuery().get('assigneeId')).toBe('u-2'));
    expect(lastTaskQuery().get('page')).toBe('1');
    await waitFor(() => expect(cards()).toHaveLength(4));
    expect(screen.queryByText('Kart 0')).toBeNull();
    expect(screen.getByText('Kart 1')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-loaded').textContent).toContain('4 / 4 görev yüklendi (atanan: Ayşe Diğer)');

    fireEvent.change(assigneeSelect(), { target: { value: '' } });
    await waitFor(() => expect(lastTaskQuery().has('assigneeId')).toBe(false));
    await waitFor(() => expect(cards()).toHaveLength(8));
    expect(screen.getByTestId('kanban-loaded').textContent).toBe(' · 8 / 8 görev yüklendi');
    expect(mocked.put).not.toHaveBeenCalled();
  });

  it('/users düşerse: pano ve "Tüm / Bana atananlar" çalışır, durum iletisi alert DEĞİLDİR; "Kullanıcıları yeniden dene" yalnız /users isteğini yineler', async () => {
    mocked.get.mockImplementation((url: string) => serve(String(url), { users: 'fail', tasks: SMALL }));
    render(<KanbanPage />);
    await screen.findByText('Kart 0');

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Kullanıcılar yüklenemedi');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(cards()).toHaveLength(8);
    const select = assigneeSelect();
    expect(within(select).getByRole('option', { name: 'Tüm atananlar' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Bana atananlar' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Ayşe Diğer (pasif)' })).toBeNull();

    // Bana atananlar süzgeci /users olmadan da çalışır.
    fireEvent.change(select, { target: { value: 'me' } });
    await waitFor(() => expect(lastTaskQuery().get('assigneeId')).toBe('u-me'));
    await waitFor(() => expect(cards()).toHaveLength(4));

    const taskCallsBefore = taskCalls().length;
    mocked.get.mockImplementation((url: string) => serve(String(url), { tasks: SMALL }));
    fireEvent.click(screen.getByRole('button', { name: 'Kullanıcıları yeniden dene' }));
    await within(assigneeSelect()).findByRole('option', { name: 'Ayşe Diğer (pasif)' });
    expect(calls('/users')).toHaveLength(2);
    expect(taskCalls().length).toBe(taskCallsBefore);
    expect(screen.queryByRole('status')).toBeNull();
    expect(assigneeSelect().value).toBe('me');
  });
});
