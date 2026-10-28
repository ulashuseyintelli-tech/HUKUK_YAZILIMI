import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import TasksPage from '../page';
import { api } from '@/lib/api';

/**
 * F01-B (OFP-01 + OFP-02 dürüstlük) — GÖREV LİSTESİ: SUNUCU SAYFALAMASI, SAYAÇLAR, SÜZGEÇLER.
 * stable key: app/(dashboard)/tasks/page.tsx#loadTasks
 *
 * Sahte /tasks sunucu gibi davranır: page/limit/status/taskCategory/assigneeId parametrelerini uygular ve
 * meta.summary'yi KAPSAMA (tenant + assignee) göre hesaplar. Böylece ekranın sayaçları sayfadaki kayıtlardan
 * değil sunucu toplamından okuduğu kanıtlanır (25 görev; ilk sayfa 20).
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u-me', tenantId: 't1' }, loading: false }),
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const ME = { id: 'u-me', name: 'Ben', surname: 'Kendim' };
const OTHER = { id: 'u-2', name: 'Ayşe', surname: 'Pasif' };

const ALL = Array.from({ length: 25 }, (_, i) => ({
  id: `t${i}`,
  title: `Görev ${i}`,
  status: STATUSES[i % 4],
  priority: 'MEDIUM',
  createdAt: '2026-08-01T00:00:00.000Z',
  taskCategory: i % 3 === 0 ? 'OPERATIONAL_COMPLETENESS' : 'LEGAL_WORKFLOW',
  assignee: i % 2 === 0 ? ME : OTHER,
}));

/** Sunucu sözleşmesi (F01-A) ile aynı: summary kapsamı tenant + assignee; status/kategori yalnız listeyi daraltır. */
function serveTasks(url: string) {
  const qs = new URLSearchParams(url.split('?')[1] ?? '');
  const page = Number(qs.get('page') ?? '1');
  const limit = Number(qs.get('limit') ?? '20');
  const status = qs.get('status');
  const cat = qs.get('taskCategory');
  const assignee = qs.get('assigneeId');
  const scope = ALL.filter((t) => !assignee || t.assignee.id === assignee);
  const rows = scope.filter((t) => (!status || t.status === status) && (!cat || t.taskCategory === cat));
  const summary = {
    pending: scope.filter((t) => t.status === 'PENDING').length,
    inProgress: scope.filter((t) => t.status === 'IN_PROGRESS').length,
    operationalOpen: scope.filter(
      (t) => t.taskCategory === 'OPERATIONAL_COMPLETENESS' && (t.status === 'PENDING' || t.status === 'IN_PROGRESS'),
    ).length,
  };
  return {
    data: {
      data: rows.slice((page - 1) * limit, page * limit),
      meta: { total: rows.length, page, limit, totalPages: Math.ceil(rows.length / limit), summary },
    },
  };
}

function primeReads(tasksOverride?: (url: string) => unknown) {
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/tasks')) {
      const hit = tasksOverride ? tasksOverride(u) : serveTasks(u);
      if (hit instanceof Error || (hit && typeof hit === 'object' && 'body' in (hit as object))) return Promise.reject(hit);
      return Promise.resolve(hit);
    }
    if (u.startsWith('/cases')) return Promise.resolve({ data: { data: [] } });
    if (u.startsWith('/users')) {
      return Promise.resolve({
        data: { data: [{ ...ME, isActive: true }, { ...OTHER, isActive: false }] },
      });
    }
    return Promise.resolve({ data: { data: [] } });
  });
}

const taskCalls = () => mocked.get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('/tasks'));
const lastTaskQuery = () => new URLSearchParams(taskCalls().at(-1)!.split('?')[1] ?? '');
const cards = () => screen.getAllByText(/^Görev \d+$/);

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeReads();
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('tasks#loadTasks — sunucu sayfalaması ve sayaçlar', () => {
  it('ilk yükleme page=1&limit=20: 20 kart; sayaçlar SUNUCU toplamından (sayfadaki 5/5 değil 7/6); aralık 1–20 / 25', async () => {
    render(<TasksPage />);
    await screen.findByText('Görev 0');

    expect(lastTaskQuery().get('page')).toBe('1');
    expect(lastTaskQuery().get('limit')).toBe('20');
    expect(cards()).toHaveLength(20);
    // Sayfadaki kayıtlardan hesaplansaydı 5 bekleyen / 5 devam eden olurdu; sunucu toplamı 7 / 6.
    expect(screen.getByTestId('tasks-summary').textContent).toContain('7 bekleyen, 6 devam eden görev');
    expect(screen.getByTestId('tasks-summary').textContent).toContain('(büro geneli)');
    expect(screen.getByTestId('tasks-pagination').textContent).toContain('1–20 / 25 görev');
    expect(screen.getByTestId('tasks-pagination').textContent).toContain('Sayfa 1/2');
    expect(screen.getByRole('button', { name: 'Önceki' })).toBeDisabled();
  });

  it('Sonraki → page=2 sorgusu, 5 kart, sayaç DEĞİŞMEZ; Önceki geri döner', async () => {
    render(<TasksPage />);
    await screen.findByText('Görev 0');

    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    await screen.findByText('Görev 20');
    expect(lastTaskQuery().get('page')).toBe('2');
    expect(cards()).toHaveLength(5);
    expect(screen.getByTestId('tasks-summary').textContent).toContain('7 bekleyen, 6 devam eden görev');
    expect(screen.getByTestId('tasks-pagination').textContent).toContain('21–25 / 25 görev');
    expect(screen.getByRole('button', { name: 'Sonraki' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Önceki' }));
    await screen.findByText('Görev 0');
    expect(lastTaskQuery().get('page')).toBe('1');
  });

  it('İptal Edilen sekmesi: status=CANCELLED ve sayfa 1\'e döner; "İptal edildi" etiketi; durum düğmesi devre dışı', async () => {
    render(<TasksPage />);
    await screen.findByText('Görev 0');
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    await screen.findByText('Görev 20');

    fireEvent.click(screen.getByRole('button', { name: 'İptal Edilen' }));
    await screen.findByText('Görev 3');
    expect(lastTaskQuery().get('status')).toBe('CANCELLED');
    expect(lastTaskQuery().get('page')).toBe('1');
    expect(cards()).toHaveLength(6); // 3, 7, 11, 15, 19, 23
    expect(screen.getAllByText('İptal edildi').length).toBeGreaterThan(0);
    for (const btn of screen.getAllByTitle('İptal edilmiş görev')) expect(btn).toBeDisabled();
    // Sekme sayaçları değiştirmez (kapsam = büro geneli).
    expect(screen.getByTestId('tasks-summary').textContent).toContain('7 bekleyen, 6 devam eden görev');
  });

  it('Bana atananlar: assigneeId=u-me; kapsam etiketi ve sayaçlar o kapsamda; pasif kullanıcı "(pasif)" ekiyle seçilebilir', async () => {
    render(<TasksPage />);
    await screen.findByText('Görev 0');

    const select = screen.getByLabelText('Atanana göre');
    expect(within(select).getByRole('option', { name: 'Ayşe Pasif (pasif)' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'me' } });
    await waitFor(() => expect(lastTaskQuery().get('assigneeId')).toBe('u-me'));
    await waitFor(() => expect(screen.getByTestId('tasks-summary').textContent).toContain('(bana atananlar)'));
    // Çift indeksler bana atanmış: 13 görev; bekleyen 7, devam eden 0 (i%4==1 olan hiçbiri çift değil).
    expect(screen.getByTestId('tasks-summary').textContent).toContain('7 bekleyen, 0 devam eden görev');
    expect(cards()).toHaveLength(13);

    fireEvent.change(select, { target: { value: 'u-2' } });
    await waitFor(() => expect(lastTaskQuery().get('assigneeId')).toBe('u-2'));
    await waitFor(() => expect(screen.getByTestId('tasks-summary').textContent).toContain('(seçili atanan)'));
    expect(cards()).toHaveLength(12);
  });

  it('kategori süzgeci taskCategory parametresi gönderir; rozet sunucunun operationalOpen değeridir', async () => {
    render(<TasksPage />);
    await screen.findByText('Görev 0');

    const opBtn = screen.getByRole('button', { name: /Operasyonel Eksikler/ });
    expect(within(opBtn).getByText('5')).toBeInTheDocument(); // 0, 9, 12, 21, 24

    fireEvent.click(opBtn);
    await waitFor(() => expect(lastTaskQuery().get('taskCategory')).toBe('OPERATIONAL_COMPLETENESS'));
    await waitFor(() => expect(cards()).toHaveLength(9)); // 0,3,...,24
  });

  it('"İnceleme" hiçbir yerde sunulmaz; modal durum seçenekleri yalnız API\'nin kabul ettiği üç durum', async () => {
    render(<TasksPage />);
    await screen.findByText('Görev 0');
    expect(screen.queryByText('İnceleme')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Yeni Görev$/ }));
    const statusSel = screen.getByLabelText('Durum');
    const options = within(statusSel).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Bekliyor', 'Devam Ediyor', 'Tamamlandı']);
  });

  it('iptal edilmiş görev düzenlenirken mevcut durum korunur (form sessizce yeniden açmaz)', async () => {
    render(<TasksPage />);
    await screen.findByText('Görev 0');
    fireEvent.click(screen.getByRole('button', { name: 'İptal Edilen' }));
    await screen.findByText('Görev 3');

    const card = screen.getByText('Görev 3').closest('.bg-white') as HTMLElement;
    // Kart düğmeleri sırayla: durum (iptalde devre dışı), düzenle, sil → düzenle = ilk ETKİN düğme.
    const enabled = within(card).getAllByRole('button').filter((b) => !(b as HTMLButtonElement).disabled);
    fireEvent.click(enabled[0]);

    const statusSel = screen.getByLabelText('Durum') as HTMLSelectElement;
    expect(statusSel.value).toBe('CANCELLED');
    expect(within(statusSel).getByRole('option', { name: 'İptal edildi' })).toBeDisabled();
  });

  it('yükleme hatası / erişim reddi: sunucu iletisi görünür, boş durum BASILMAZ, sayfalama gizli', async () => {
    primeReads(() => ({ body: { message: 'Bu kaynağa erişim yetkiniz yok.' } }));
    render(<TasksPage />);

    await screen.findByText(/erişim yetkiniz yok/i);
    expect(screen.queryByText('Görev bulunamadı')).toBeNull();
    expect(screen.queryByText('+ Yeni görev ekle')).toBeNull();
    expect(screen.queryByTestId('tasks-pagination')).toBeNull();
  });

  it('gerçek sıfır: boş durum görünür, "0 görev"', async () => {
    primeReads(() => ({ data: { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0, summary: { pending: 0, inProgress: 0, operationalOpen: 0 } } } }));
    render(<TasksPage />);

    await screen.findByText('Görev bulunamadı');
    expect(screen.getByTestId('tasks-summary').textContent).toContain('0 bekleyen, 0 devam eden görev');
    expect(screen.getByTestId('tasks-pagination').textContent).toContain('0 görev');
  });

  it("meta'sız eski zarf: liste gelir, sayaç 'Toplamlar alınamadı' (sayfadan HESAPLANMAZ), sayfalama yok", async () => {
    primeReads(() => ({ data: { data: [ALL[0], ALL[1]] } }));
    render(<TasksPage />);

    await screen.findByText('Görev 0');
    expect(screen.getByTestId('tasks-summary').textContent).toContain('Toplamlar alınamadı');
    expect(screen.queryByTestId('tasks-pagination')).toBeNull();
  });
});

describe('tasks — F01-C kanban "Yeni Görev" giriş yolu', () => {
  it('/tasks#yeni ile açılış Yeni Görev modalını açar ve hash temizlenir (yenileme tekrar açmaz)', async () => {
    window.location.hash = '#yeni';
    render(<TasksPage />);

    await screen.findByRole('heading', { level: 2, name: 'Yeni Görev' });
    expect(window.location.hash).toBe('');
  });
});
