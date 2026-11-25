import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import KanbanPage from '../page';
import { api } from '@/lib/api';

/**
 * F03-C (OFP-04) — KANBAN: "kontrolde" görev ayrı bir sunucu durumu değildir (IN_PROGRESS + reviewStatus AWAITING).
 * Pano onu kendi SALT OKUNUR sütununda gösterir; "Devam Ediyor"da saymaz, "Tamamlandı" diye göstermez. "Kontrol gerekli" kart
 * Tamamlandı'ya bırakılınca kartın yeri sunucunun döndürdüğü durumdan gelir (Kontrolde) ve nedeni yazılır.
 * stable key: app/(dashboard)/tasks/kanban/page.tsx#handleDrop
 */
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), put: vi.fn() } }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'u-me', tenantId: 't1' }, loading: false }) }));
vi.mock('@/components/scope/ViewScopeBadge', () => ({ ViewScopeBadge: () => null }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };

const ROWS = [
  { id: 'p', title: 'Kart bekleyen', status: 'PENDING', priority: 'LOW', reviewRequired: true, reviewStatus: null },
  { id: 'd', title: 'Kart devam', status: 'IN_PROGRESS', priority: 'LOW', reviewRequired: false, reviewStatus: null },
  { id: 'k', title: 'Kart kontrolde', status: 'IN_PROGRESS', priority: 'LOW', reviewRequired: true, reviewStatus: 'AWAITING' },
  { id: 'r', title: 'Kart revizyon', status: 'IN_PROGRESS', priority: 'LOW', reviewRequired: true, reviewStatus: 'REVISION_REQUESTED' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocked.get.mockImplementation(async (url: string) => {
    if (String(url).startsWith('/users')) return { data: { data: [] } };
    return { data: { data: ROWS, meta: { total: ROWS.length, page: 1, limit: 100, totalPages: 1 } } };
  });
});
afterEach(() => cleanup());

const column = (title: string) => screen.getByRole('heading', { name: title }).closest('div.flex-shrink-0') as HTMLElement;
const titles = (el: HTMLElement) => within(el).queryAllByText(/^Kart /).map((node) => node.textContent);

describe('Kanban — kontrolde bekleyen görev', () => {
  it('kendi salt okunur sütunundadır; "Devam Ediyor"da sayılmaz, "Tamamlandı"da görünmez; kart sürüklenemez', async () => {
    render(<KanbanPage />);
    await screen.findByText('Kart kontrolde');

    const awaitingColumn = screen.getByTestId('kanban-awaiting-review-column');
    expect(titles(awaitingColumn)).toEqual(['Kart kontrolde']);
    expect(titles(column('Devam Ediyor'))).toEqual(['Kart devam', 'Kart revizyon']);
    expect(titles(column('Tamamlandı'))).toEqual([]);
    expect(within(awaitingColumn).getByText(/Salt okunur; karar Görevler listesindeki/)).toBeTruthy();

    const card = screen.getByText('Kart kontrolde').closest('[draggable]') as HTMLElement;
    expect(card.getAttribute('draggable')).toBe('false');
    expect(card.className).not.toContain('opacity-75');
    expect(screen.getByText('Kart kontrolde').className).not.toContain('line-through');
  });

  it('kontrol rozetleri açık kartlarda görünür: kontrol gerekli / revizyon istendi', async () => {
    render(<KanbanPage />);
    await screen.findByText('Kart kontrolde');
    expect(screen.getAllByTestId('kanban-review-badge').map((el) => el.textContent)).toEqual(['Kontrol gerekli', 'Revizyon istendi']);
  });

  it('Kontrolde sütunu bırakma hedefi değildir: karta bırakma isteği gönderilmez', async () => {
    render(<KanbanPage />);
    await screen.findByText('Kart kontrolde');
    fireEvent.dragStart(screen.getByText('Kart devam').closest('[draggable]') as HTMLElement);
    fireEvent.dragOver(screen.getByTestId('kanban-awaiting-review-column'));
    fireEvent.drop(screen.getByTestId('kanban-awaiting-review-column'));
    expect(mocked.put).not.toHaveBeenCalled();
  });

  it('"kontrol gerekli" kart Tamamlandı\'ya bırakılınca sunucu durumuna göre Kontrolde sütununa geçer ve nedeni yazılır', async () => {
    mocked.put.mockResolvedValue({ data: { id: 'p', status: 'IN_PROGRESS', reviewRequired: true, reviewStatus: 'AWAITING' } });
    render(<KanbanPage />);
    await screen.findByText('Kart bekleyen');

    fireEvent.dragStart(screen.getByText('Kart bekleyen').closest('[draggable]') as HTMLElement);
    fireEvent.dragOver(column('Tamamlandı'));
    fireEvent.drop(column('Tamamlandı'));

    await waitFor(() => expect(mocked.put).toHaveBeenCalledWith('/tasks/p', { status: 'COMPLETED' }));
    await waitFor(() => expect(titles(screen.getByTestId('kanban-awaiting-review-column'))).toEqual(['Kart bekleyen', 'Kart kontrolde']));
    expect(titles(column('Tamamlandı'))).toEqual([]);
    expect(screen.getByTestId('kanban-review-notice').textContent).toContain('Görev kontrole gönderildi; onaylanınca tamamlanmış sayılır.');
  });

  it('işaretsiz kart Tamamlandı\'ya bırakılınca tamamlanır; kontrol bilgisi gösterilmez', async () => {
    mocked.put.mockResolvedValue({ data: { id: 'd', status: 'COMPLETED', reviewRequired: false, reviewStatus: null } });
    render(<KanbanPage />);
    await screen.findByText('Kart devam');

    fireEvent.dragStart(screen.getByText('Kart devam').closest('[draggable]') as HTMLElement);
    fireEvent.drop(column('Tamamlandı'));

    await waitFor(() => expect(titles(column('Tamamlandı'))).toEqual(['Kart devam']));
    expect(screen.queryByTestId('kanban-review-notice')).toBeNull();
  });

  it('tamamlama reddedilirse (kontrol edebilecek kişi yok) kart eski sütununa döner ve neden görünür', async () => {
    mocked.put.mockRejectedValue({ status: 409, body: { code: 'TASK_REVIEW_NO_ELIGIBLE_REVIEWER', message: 'Bu görevi, işi yapan kişiden başka kontrol edebilecek kişi yok.' } });
    render(<KanbanPage />);
    await screen.findByText('Kart bekleyen');

    fireEvent.dragStart(screen.getByText('Kart bekleyen').closest('[draggable]') as HTMLElement);
    fireEvent.drop(column('Tamamlandı'));

    expect((await screen.findByRole('alert')).textContent).toContain('kontrol edebilecek kişi yok');
    expect(titles(column('Bekliyor'))).toEqual(['Kart bekleyen']);
    expect(screen.queryByTestId('kanban-review-notice')).toBeNull();
  });
});
