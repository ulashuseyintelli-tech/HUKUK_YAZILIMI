import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TasksPage from '../page';

/**
 * F03-A2 — "Geçmiş" penceresi GERÇEK istemciyle (yalnız `fetch` taklit edilir; `@/lib/api` taklit EDİLMEZ).
 * stable key: app/(dashboard)/tasks/page.tsx#taskHistory
 *
 * Neden: önceki "İptal geçmişi" penceresi istemcinin döndürdüğü tek zarfı (`{ data, meta }`) bir kat fazla açıyordu ve
 * çalışan uygulamada 200 yanıtı "alınamadı" diye gösteriyordu. Bileşen testi `@/lib/api`'yi çift zarflı sahte yanıtla taklit
 * ettiği için yeşildi. Bu test sunucunun GERÇEK gövde biçimini `fetch` düzeyinde verir: zarf hatası bir daha gizlenemez.
 * Kanıt sınıfı: TEST (jsdom + sahte fetch). Çalışan uygulama kanıtı ayrı (yalıtılmış yığın).
 */
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'creator', tenantId: 'tenant', role: 'USER' }, loading: false }) }));
vi.mock('@/components/scope/ViewScopeBadge', () => ({ ViewScopeBadge: () => null }));

const TASK = { id: 'task-a', title: 'Sentetik görev A', createdById: 'creator', status: 'PENDING', priority: 'MEDIUM', createdAt: '2026-11-05T10:00:00Z' };
const HISTORY = {
  data: [
    {
      id: 'c1', kind: 'CANCELLATION', eventType: 'CANCELLED', actorType: 'USER', actorUserId: 'admin', actorName: 'Sentetik Yönetici', actorRole: 'ADMIN',
      authoritySource: 'ADMIN', fromValue: 'IN_PROGRESS', toValue: 'CANCELLED', fromLabel: null, toLabel: null, reason: 'Sentetik iptal gerekçesi',
      correlationId: null, createdAt: '2026-11-05T12:00:00.000Z',
    },
    {
      id: 'h1', kind: 'HISTORY', eventType: 'CREATED', actorType: 'USER', actorUserId: 'creator', actorName: 'Sentetik Oluşturan', actorRole: 'USER',
      authoritySource: 'CREATOR', fromValue: null, toValue: 'PENDING', fromLabel: null, toLabel: null, reason: null, correlationId: 'corr-1',
      createdAt: '2026-11-05T10:00:00.000Z',
    },
  ],
  meta: { page: 1, limit: 20, total: 2, totalPages: 1, coverage: { creationRecorded: true, systemWritersRecorded: false } },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let requested: string[] = [];
let historyReply: () => Response = () => json(HISTORY);

beforeEach(() => {
  requested = [];
  historyReply = () => json(HISTORY);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(typeof input === 'string' || input instanceof URL ? input : (input as Request).url), 'http://test.invalid');
      const path = url.pathname + url.search;
      requested.push(path);
      if (url.pathname === '/api/tasks') {
        return json({ data: [TASK], meta: { total: 1, page: 1, limit: 20, totalPages: 1, summary: { pending: 1, inProgress: 0, operationalOpen: 0 } } });
      }
      if (url.pathname === `/api/tasks/${TASK.id}/history`) return historyReply();
      if (url.pathname === '/api/cases') return json({ data: [] });
      if (url.pathname === '/api/users') return json([]);
      return json({ message: 'beklenmeyen istek' }, 404);
    }),
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openHistory() {
  render(<TasksPage />);
  await screen.findByText(TASK.title);
  fireEvent.click(screen.getByRole('button', { name: `${TASK.title} geçmişi` }));
  return screen.findByRole('dialog', { name: `Geçmiş — ${TASK.title}` });
}

describe('Görev geçmişi penceresi — gerçek istemci, sunucunun gerçek gövde biçimi', () => {
  it('200 yanıtı okunur: iptal ve oluşturma satırları, kişi ve gerekçeyle listelenir; birleşik uç çağrılır', async () => {
    const dialog = await openHistory();
    const items = await waitFor(() => {
      const li = within(dialog).getAllByRole('listitem');
      expect(li).toHaveLength(2);
      return li;
    });
    expect(items[0].textContent).toContain('Sentetik Yönetici (yönetici)');
    expect(items[0].textContent).toContain('İptal edildi: Devam Ediyor → İptal edildi');
    expect(items[0].textContent).toContain('Sentetik iptal gerekçesi');
    expect(items[1].textContent).toContain('Sentetik Oluşturan (görevi oluşturan)');
    expect(items[1].textContent).toContain('Görev oluşturuldu');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(requested).toContain(`/api/tasks/${TASK.id}/history?page=1&limit=20`);
    expect(requested.some((path) => path.includes('/cancellations'))).toBe(false);
  });

  it('kapsam notu yanıttaki kapsam bilgisinden gelir', async () => {
    const dialog = await openHistory();
    const note = await within(dialog).findByTestId('task-history-coverage');
    expect(note.textContent).toContain('bu geçmişte yer almaz');
  });

  it('sunucu 404 dönerse (kapsam dışı görev) hata görünür; boş geçmiş gibi sunulmaz', async () => {
    historyReply = () => json({ statusCode: 404, message: 'Görev bulunamadı.', error: 'Not Found' }, 404);
    const dialog = await openHistory();
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('Görev bulunamadı.');
    expect(within(dialog).queryByText('Bu görev için kayıtlı geçmiş yok.')).toBeNull();
  });
});
