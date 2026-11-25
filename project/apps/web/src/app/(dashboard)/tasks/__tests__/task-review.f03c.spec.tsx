import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TasksPage from '../page';
import { api } from '@/lib/api';

/**
 * F03-C (OFP-04; owner kararları K3-a, K4-b, K5-b, K5b-a, K8, K9 — 25.11.2026) — Görevler ekranında bağımsız ilk kontrol.
 * Sunucu "kontrolde" görevi `IN_PROGRESS` + `reviewStatus: AWAITING` olarak verir; ekran ayrı bir durum UYDURMAZ, kontrol
 * süzgeciyle okur ve kararı sunucuya bırakır (düğmeler yalnız sunumdur).
 * stable key: tasks/page.tsx + lib/task-review.ts
 */
const auth = vi.hoisted(() => ({ user: { id: 'creator', tenantId: 'tenant', role: 'USER' } }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: auth.user, loading: false }) }));
vi.mock('@/components/scope/ViewScopeBadge', () => ({ ViewScopeBadge: () => null }));
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn(), cancelTask: vi.fn(), getTaskHistory: vi.fn(), reviewTask: vi.fn(), setTaskReviewRequirement: vi.fn() },
}));
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

type Row = Record<string, unknown> & { id: string; status: string };
const row = (id: string, over: Record<string, unknown> = {}): Row => ({
  id, title: `Görev ${id}`, createdById: 'creator', status: 'PENDING', priority: 'MEDIUM', createdAt: '2026-01-05T10:00:00Z',
  reviewRequired: false, reviewStatus: null, reviewSubmittedByUserId: null, reviewNote: null, ...over,
});
const awaiting = (id: string, over: Record<string, unknown> = {}) =>
  row(id, { status: 'IN_PROGRESS', reviewRequired: true, reviewStatus: 'AWAITING', reviewSubmittedByUserId: 'doer', ...over });

let rows: Row[] = [];
const taskQueries = () => mocked.get.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/tasks?'));
const lastTaskQuery = () => new URLSearchParams(taskQueries().at(-1)!.split('?')[1]);

beforeEach(() => {
  auth.user = { id: 'creator', tenantId: 'tenant', role: 'USER' };
  rows = [row('a')];
  for (const mock of Object.values(mocked)) mock.mockReset();
  mocked.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/tasks?')) {
      const awaitingCount = rows.filter((r) => r.status === 'IN_PROGRESS' && r.reviewStatus === 'AWAITING').length;
      return {
        data: {
          data: rows,
          meta: {
            total: rows.length, page: 1, limit: 20, totalPages: 1, awaitingReview: awaitingCount,
            summary: { pending: rows.filter((r) => r.status === 'PENDING').length, inProgress: rows.filter((r) => r.status === 'IN_PROGRESS').length - awaitingCount, operationalOpen: 0 },
          },
        },
      };
    }
    if (url === '/users') return { data: { data: [{ id: 'doer', name: 'İşi', surname: 'Yapan' }] } };
    return { data: { data: [] } };
  });
  mocked.post.mockResolvedValue({ data: {} });
  mocked.put.mockResolvedValue({ data: {} });
  mocked.reviewTask.mockResolvedValue({});
  mocked.setTaskReviewRequirement.mockResolvedValue({});
});
afterEach(cleanup);

const renderTasks = async (title = 'Görev a') => {
  render(<TasksPage />);
  await screen.findByText(title);
};

describe('F03-C — oluşturma: "Kontrol gerekli" işareti (K4-b, K5-b)', () => {
  const openCreate = async () => {
    await renderTasks();
    fireEvent.click(screen.getByRole('button', { name: /Yeni Görev/ }));
    fireEvent.change(screen.getByPlaceholderText('Görev başlığı'), { target: { value: 'Sentetik görev' } });
  };

  it('varsayılan kapalıdır: işaretlenmeden kaydedilen görevde alan gönderilmez', async () => {
    await openCreate();
    expect((screen.getByRole('checkbox', { name: /Kontrol gerekli/ }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.post).toHaveBeenCalledTimes(1));
    expect(mocked.post.mock.calls[0][0]).toBe('/tasks');
    expect(mocked.post.mock.calls[0][1]).not.toHaveProperty('reviewRequired');
  });

  it('işaretlenince `reviewRequired: true` gönderilir', async () => {
    await openCreate();
    fireEvent.click(screen.getByRole('checkbox', { name: /Kontrol gerekli/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.post).toHaveBeenCalledTimes(1));
    expect(mocked.post.mock.calls[0][1]).toMatchObject({ title: 'Sentetik görev', reviewRequired: true });
  });

  it('kontrol edebilecek kişi yoksa sunucunun nedeni pencerede görünür ve pencere açık kalır', async () => {
    mocked.post.mockRejectedValue({ status: 409, body: { code: 'TASK_REVIEW_NO_ELIGIBLE_REVIEWER', message: 'Bu görevi, işi yapan kişiden başka kontrol edebilecek kişi yok.' } });
    await openCreate();
    fireEvent.click(screen.getByRole('checkbox', { name: /Kontrol gerekli/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect((await screen.findByTestId('task-save-error')).textContent).toContain('kontrol edebilecek kişi yok');
    expect(screen.getByPlaceholderText('Görev başlığı')).toBeTruthy();
    expect((screen.getByPlaceholderText('Görev başlığı') as HTMLInputElement).value).toBe('Sentetik görev');
  });

  it('düzenlemede işaret kutusu yoktur ve PUT gövdesi `reviewRequired` taşımaz', async () => {
    rows = [row('a', { reviewRequired: true })];
    await renderTasks();
    fireEvent.click(document.querySelector('button.p-2.text-gray-400') as HTMLButtonElement); // düzenle (kalem)
    expect(screen.queryByRole('checkbox', { name: /Kontrol gerekli/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    expect(mocked.put.mock.calls[0][1]).not.toHaveProperty('reviewRequired');
  });
});

describe('F03-C — liste: "Kontrolde" ayrı bir sunucu durumu değildir', () => {
  it('Kontrolde sekmesi review=AWAITING ile, Devam Eden sekmesi status=IN_PROGRESS + review=NOT_AWAITING ile okur', async () => {
    rows = [awaiting('k')];
    await renderTasks('Görev k');
    expect(lastTaskQuery().get('review')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Kontrolde/ }));
    await waitFor(() => expect(lastTaskQuery().get('review')).toBe('AWAITING'));
    expect(lastTaskQuery().get('status')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Eden' }));
    await waitFor(() => expect(lastTaskQuery().get('review')).toBe('NOT_AWAITING'));
    expect(lastTaskQuery().get('status')).toBe('IN_PROGRESS');

    fireEvent.click(screen.getByRole('button', { name: 'Tamamlanan' }));
    await waitFor(() => expect(lastTaskQuery().get('status')).toBe('COMPLETED'));
    expect(lastTaskQuery().get('review')).toBeNull();
  });

  it('sayaç sunucudan gelir: kontrolde bekleyen "devam eden"e katılmaz, ayrı yazılır', async () => {
    rows = [awaiting('k'), row('d', { status: 'IN_PROGRESS' }), row('p')];
    await renderTasks('Görev k');
    expect(screen.getByTestId('tasks-summary').textContent).toContain('1 bekleyen, 1 devam eden görev, 1 kontrolde');
    expect(screen.getByTestId('tasks-awaiting-review-count').textContent).toBe('1');
  });

  it('kontrolde görev "Kontrolde" etiketiyle görünür; "Tamamlandı" denmez ve durum düğmesi kilitlidir', async () => {
    rows = [awaiting('k')];
    await renderTasks('Görev k');
    expect(screen.getByTestId('task-status-label').textContent).toBe('Kontrolde');
    expect(screen.queryByText('Tamamlandı')).toBeNull();
    const toggle = screen.getByTitle(/Görev kontrolde/) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    fireEvent.click(toggle);
    expect(mocked.put).not.toHaveBeenCalled();
  });

  it('rozetler: kontrol gerekli / revizyon istendi (gerekçesiyle) / kontrol edildi', async () => {
    rows = [
      row('g', { reviewRequired: true }),
      row('r', { status: 'IN_PROGRESS', reviewRequired: true, reviewStatus: 'REVISION_REQUESTED', reviewNote: 'Sentetik eksik belge' }),
      row('o', { status: 'COMPLETED', reviewRequired: true, reviewStatus: 'APPROVED' }),
      row('n'),
    ];
    await renderTasks('Görev g');
    expect(screen.getAllByTestId('task-review-badge').map((el) => el.textContent)).toEqual(['Kontrol gerekli', 'Revizyon istendi', 'Kontrol edildi']);
    // karar satırı rozetin söylediğini yinelemez: notsuz "Kontrol edildi" yalnız rozettir
    expect(screen.getAllByTestId('task-review-decision').map((el) => el.textContent)).toEqual(['Revizyon istendi: Sentetik eksik belge']);
  });
});

describe('F03-C — karar (K5b-a, K9)', () => {
  it('karar düğmeleri yöneticiye ve görevi oluşturana sunulur; işi yapana ve ilgisiz kullanıcıya açıklama gösterilir', async () => {
    rows = [awaiting('k')];
    await renderTasks('Görev k');
    for (const name of ['Onayla', 'Revizyon iste', 'Reddet']) expect(screen.getByRole('button', { name })).toBeTruthy();

    cleanup(); auth.user = { id: 'admin', tenantId: 'tenant', role: 'ADMIN' };
    await renderTasks('Görev k');
    expect(screen.getByRole('button', { name: 'Onayla' })).toBeTruthy();

    for (const user of [{ id: 'doer', role: 'ADMIN' }, { id: 'baskasi', role: 'USER' }, { id: 'creator', role: 'VIEWER' }]) {
      cleanup(); auth.user = { tenantId: 'tenant', ...user };
      await renderTasks('Görev k');
      expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
      expect(screen.getByText(/Kontrol bekleniyor: kararı işi yapandan başka bir kişi/)).toBeTruthy();
    }
  });

  it('onay: not isteğe bağlıdır; karar kendi ucuna gider ve liste yeniden okunur', async () => {
    rows = [awaiting('k')];
    mocked.reviewTask.mockImplementation(async () => { rows = [row('k', { status: 'COMPLETED', reviewRequired: true, reviewStatus: 'APPROVED' })]; return {}; });
    await renderTasks('Görev k');
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
    const dialog = screen.getByRole('dialog', { name: 'Kontrol: onayla' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(mocked.reviewTask).toHaveBeenCalledWith('k', 'APPROVE', undefined));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('task-status-label').textContent).toBe('Tamamlandı');
    expect(mocked.put).not.toHaveBeenCalled();
  });

  it.each([
    ['Reddet', 'Kontrol: reddet', 'Ret gerekçesi', 'REJECT'],
    ['Revizyon iste', 'Kontrol: revizyon iste', 'Revizyon gerekçesi', 'REQUEST_REVISION'],
  ])('%s: gerekçe yazılmadan gönderilemez; gerekçe kırpılarak gider', async (button, title, label, decision) => {
    rows = [awaiting('k')];
    await renderTasks('Görev k');
    fireEvent.click(screen.getByRole('button', { name: button }));
    const dialog = screen.getByRole('dialog', { name: title });
    const confirm = within(dialog).getByRole('button', { name: button }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(label), { target: { value: '   ' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(label), { target: { value: '  Sentetik gerekçe  ' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocked.reviewTask).toHaveBeenCalledWith('k', decision, 'Sentetik gerekçe'));
  });

  it('sunucu reddederse (aynı kişi) neden pencerede görünür; pencere ve yazılan metin kalır, başarı gösterilmez', async () => {
    rows = [awaiting('k')];
    mocked.reviewTask.mockRejectedValue({ status: 403, body: { code: 'TASK_REVIEW_SAME_PERSON', message: 'İşi yapan kişi kendi işini kontrol edemez (aynı kişinin başka hesabı da sayılır).' } });
    await renderTasks('Görev k');
    fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));
    const dialog = screen.getByRole('dialog', { name: 'Kontrol: reddet' });
    fireEvent.change(within(dialog).getByLabelText('Ret gerekçesi'), { target: { value: 'Sentetik' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));
    await within(dialog).findByText(/kendi işini kontrol edemez/);
    expect((within(dialog).getByLabelText('Ret gerekçesi') as HTMLTextAreaElement).value).toBe('Sentetik');
    expect(screen.getByTestId('task-status-label').textContent).toBe('Kontrolde');
  });

  it('karar kaydedilip liste yenilenemezse "kaydedildi, liste yenilenemedi" denir; ikinci karar gönderilmez', async () => {
    rows = [awaiting('k')];
    await renderTasks('Görev k');
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
    mocked.get.mockRejectedValue(new Error('Yenileme yok'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Kontrol: onayla' })).getByRole('button', { name: 'Onayla' }));
    await screen.findByText(/Kontrol kararı KAYDEDİLDİ, ancak liste yenilenemedi/);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocked.reviewTask).toHaveBeenCalledTimes(1);
  });
});

describe('F03-C — işaret (K4-b, K8) ve kontrole gönderme', () => {
  it('"Kontrol işaretini kaldır" gerekçe ister ve kendi ucuna gider (oluşturan / yönetici)', async () => {
    rows = [awaiting('k')];
    await renderTasks('Görev k');
    fireEvent.click(screen.getByRole('button', { name: 'Kontrol işaretini kaldır' }));
    const dialog = screen.getByRole('dialog', { name: 'Kontrol işaretini kaldır' });
    const confirm = within(dialog).getByRole('button', { name: 'İşareti kaldır' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Kaldırma gerekçesi'), { target: { value: 'Sentetik: büroda başka yetkili yok' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocked.setTaskReviewRequirement).toHaveBeenCalledWith('k', false, 'Sentetik: büroda başka yetkili yok'));

    cleanup(); auth.user = { id: 'baskasi', tenantId: 'tenant', role: 'USER' };
    await renderTasks('Görev k');
    expect(screen.queryByRole('button', { name: 'Kontrol işaretini kaldır' })).toBeNull();
  });

  it('"Kontrol gerekli yap" yalnız görevi oluşturana, kullanıcının açtığı işaretsiz görevde sunulur', async () => {
    rows = [row('a'), row('s', { clientId: 'c1', taskCategory: 'OPERATIONAL_COMPLETENESS' })];
    await renderTasks();
    expect(screen.getAllByRole('button', { name: 'Kontrol gerekli yap' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Kontrol gerekli yap' }));
    const dialog = screen.getByRole('dialog', { name: 'Kontrol gerekli yap' });
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'İşaretle' }));
    await waitFor(() => expect(mocked.setTaskReviewRequirement).toHaveBeenCalledWith('a', true));

    cleanup(); auth.user = { id: 'admin', tenantId: 'tenant', role: 'ADMIN' };
    await renderTasks();
    expect(screen.queryByRole('button', { name: 'Kontrol gerekli yap' })).toBeNull();
  });

  it('işaretli görev tamamlanınca "tamamlandı" denmez: kontrole gönderildiği yazılır ve kart sunucu durumunu gösterir', async () => {
    rows = [row('a', { reviewRequired: true })];
    mocked.put.mockImplementation(async () => { rows = [awaiting('a', { reviewSubmittedByUserId: 'creator' })]; return { data: rows[0] }; });
    await renderTasks();
    fireEvent.click(document.querySelector('button.mt-0\\.5') as HTMLButtonElement); // durum düğmesi
    await waitFor(() => expect(mocked.put).toHaveBeenCalledWith('/tasks/a', { status: 'COMPLETED' }));
    expect((await screen.findByTestId('task-review-notice')).textContent).toContain('Görev kontrole gönderildi; onaylanınca tamamlanmış sayılır.');
    expect(screen.getByTestId('task-status-label').textContent).toBe('Kontrolde');
  });

  it('tamamlama reddedilirse (kontrol edebilecek kişi yok) neden görünür; kontrole gönderildi denmez', async () => {
    rows = [row('a', { reviewRequired: true })];
    mocked.put.mockRejectedValue({ status: 409, body: { code: 'TASK_REVIEW_NO_ELIGIBLE_REVIEWER', message: 'Bu görevi, işi yapan kişiden başka kontrol edebilecek kişi yok.' } });
    await renderTasks();
    fireEvent.click(document.querySelector('button.mt-0\\.5') as HTMLButtonElement);
    await screen.findByText(/kontrol edebilecek kişi yok/);
    expect(screen.queryByTestId('task-review-notice')).toBeNull();
    expect(screen.getByTestId('task-status-label').textContent).toBe('Bekliyor');
  });

  it('kontrolde görev düzenlenirken durum alanı kilitlidir ve nedeni yazılır', async () => {
    rows = [awaiting('k')];
    await renderTasks('Görev k');
    fireEvent.click(document.querySelector('button.p-2.text-gray-400') as HTMLButtonElement); // düzenle (kalem)
    expect((screen.getByLabelText('Durum') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByTestId('task-edit-review-hint').textContent).toContain('Görev kontrolde');
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    expect(mocked.put.mock.calls[0][1]).toMatchObject({ status: 'IN_PROGRESS' });
    expect(mocked.put.mock.calls[0][1]).not.toHaveProperty('reviewRequired');
  });
});
