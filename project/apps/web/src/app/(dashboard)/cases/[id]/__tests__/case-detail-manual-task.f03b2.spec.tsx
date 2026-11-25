import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';
import { buildApiHttpError } from '@/lib/api-error';

/**
 * F03-B2 (OFP-02; owner kararı K2-a, 25.11.2026) — DOSYADAN GÖREV.
 * stable key: app/(dashboard)/cases/[id]/page.tsx#caseTasks
 *
 * Önce: "Manuel Görev Ekle" yalnız `console.log` çalıştırıyordu; dosyanın Task satırları dosyada görünmüyordu.
 * Sözleşme:
 *  - Dosyanın açık Task satırları (GET /tasks?caseId=, PENDING + IN_PROGRESS) Yapılacaklar'da görünür.
 *  - Task satırının ✓ eylemi `/tasks` ucuna gider (PUT status=COMPLETED); adres görevi ucuna GİTMEZ. Hata görünür olur.
 *  - "Manuel Görev Ekle" gerçek pencere açar; kayıt `POST /tasks` + açık dosyanın `caseId`'si; başarıda liste yeniden okunur.
 *  - VIEWER için düğme sunulmaz (sunucu da reddeder). Okuma hatası "Bekleyen iş yok" gibi görünmez.
 * Kanıt sınıfı: TEST (jsdom + sahte api). Gerçek sayfa kanıtı ayrı (yalıtılmış yığın).
 */

// `importActual`: sayfa alt bileşenleri aynı modülden sabitler alır; yalnız { api } dönen sahte onları düşürür.
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/api');
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn().mockResolvedValue([]);
      return registry[prop];
    },
  };
  return { ...actual, api: new Proxy({}, handler) };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'case-1' }),
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/cases/case-1',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const auth = vi.hoisted(() => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' } }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: auth.user, loading: false }),
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
type Rec = Record<string, unknown>;

const TASK_TITLE = 'Sentetik dosya görevi';
const NEW_TITLE = 'Dosyadan açılan sentetik görev';
const ADDRESS_TITLE = 'Müvekkil iletişim bilgilerini doğrula';

const taskRow = (id: string, title: string, status = 'PENDING'): Rec => ({
  id,
  title,
  status,
  priority: 'MEDIUM',
  dueDate: '2026-12-01T00:00:00.000Z',
  caseId: 'case-1',
  createdById: 'u1',
});
const envelope = (rows: Rec[]) => ({ data: rows, meta: { total: rows.length, page: 1, limit: 100, totalPages: 1 } });

/** GET /tasks sahte uygulaması: durum süzgecine göre satır döner; `rows` test içinde değiştirilebilir. */
function primeTasks(rows: { current: Rec[] }) {
  mocked.getTasks.mockImplementation(async (params: { status?: string }) =>
    envelope(rows.current.filter((row) => row.status === params?.status)),
  );
}

function mountCase(input: { addressTasks?: Rec[] } = {}) {
  const loaded = {
    id: 'case-1',
    fileNumber: '2026/1',
    currency: 'TRY',
    principalAmount: '10000',
    workflowStage: 'INITIAL',
    debtors: [],
    caseClients: [{ id: 'cc-1', role: 'ALACAKLI', client: { id: 'client-1', displayName: 'Müvekkil A.Ş.', name: 'Müvekkil' } }],
    lawyers: [],
    claimItems: [],
  };
  mocked.getCase.mockResolvedValue(loaded);
  mocked.getCaseDues.mockResolvedValue([]);
  mocked.getCaseCollections.mockResolvedValue([]);
  mocked.getCaseDebtors.mockResolvedValue({ summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 }, items: [] });
  mocked.getAddressTasksForCase.mockResolvedValue({ tasks: input.addressTasks ?? [] });
  mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  mocked.getActiveCaseFeeAgreement.mockResolvedValue(null);
  mocked.getCollectionDispositionsByCase.mockResolvedValue([]);
  mocked.getExpenseThreeViewForCase.mockResolvedValue([]);
  mocked.getCaseResponsibilityAt.mockResolvedValue({
    caseId: loaded.id,
    asOf: new Date().toISOString(),
    operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' },
    legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' },
    horizon: {},
  });
  mocked.getCaseResponsibilityHistory.mockResolvedValue({ caseId: loaded.id, from: null, to: null, events: [], horizon: {} });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

// Tam paralel regresyonda sayfa render'ı CPU rekabetine girer — bekleme süresi geniş, test süresinden KISA tutulur.
const WAIT = { timeout: 8_000 };
vi.setConfig({ testTimeout: 30_000 });

const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function deckTab(label: string): HTMLElement {
  const hits = screen.getAllByRole('button').filter((b) => new RegExp(`^${label}(\\d+)?$`).test(norm(b.textContent)));
  if (hits.length !== 1) throw new Error(`"${label}" sekme düğmesi tek değil: ${hits.length}`);
  return hits[0];
}

async function openTasksTab() {
  await waitFor(() => deckTab('Yapılacaklar'), WAIT);
  await waitFor(() => expect(mocked.getTasks).toHaveBeenCalled(), WAIT);
  fireEvent.click(deckTab('Yapılacaklar'));
}

function rowOf(title: string): HTMLElement {
  const row = screen.getByText(title).closest('div.flex.items-center.justify-between');
  if (!row) throw new Error(`"${title}" görev satırı bulunamadı`);
  return row as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 'u1', tenantId: 't1', role: 'ADMIN' };
  // Alt bileşenler kendi istemcisiyle ağa çıkar; yerelde çalışan bir API'ye istek atmasın diye yanıt hiç dönmez.
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Yapılacaklar — dosyaya bağlı Task satırları', () => {
  it('dosyanın açık görevleri (bekliyor + devam ediyor) dosya kimliğiyle okunur ve listede görünür', async () => {
    primeTasks({ current: [taskRow('task-1', TASK_TITLE), taskRow('task-2', 'Devam eden sentetik görev', 'IN_PROGRESS')] });
    mountCase();
    await openTasksTab();

    await waitFor(() => rowOf(TASK_TITLE), WAIT);
    expect(rowOf('Devam eden sentetik görev')).toBeTruthy();
    const calls = mocked.getTasks.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual({ caseId: 'case-1', status: 'PENDING', page: 1, limit: 100 });
    expect(calls).toContainEqual({ caseId: 'case-1', status: 'IN_PROGRESS', page: 1, limit: 100 });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('görevin kendi öncelik adı yazılır: "Yüksek" görev listede "Acil" diye görünmez', async () => {
    primeTasks({ current: [{ ...taskRow('task-1', TASK_TITLE), priority: 'HIGH' }, { ...taskRow('task-2', 'Acil sentetik görev'), priority: 'URGENT' }] });
    mountCase();
    await openTasksTab();

    const high = await waitFor(() => rowOf(TASK_TITLE), WAIT);
    expect(within(high).getByText('Yüksek')).toBeTruthy();
    expect(within(high).queryByText('Acil')).toBeNull();
    expect(within(rowOf('Acil sentetik görev')).getByText('Acil')).toBeTruthy();
  });

  it('Task satırının ✓ eylemi /tasks ucuna gider; adres görevi ucuna GİTMEZ; liste yeniden okunur', async () => {
    const rows = { current: [taskRow('task-1', TASK_TITLE)] };
    primeTasks(rows);
    mocked.updateTask.mockImplementation(async () => {
      rows.current = [];
      return {};
    });
    mountCase({ addressTasks: [{ id: 'at-1', title: ADDRESS_TITLE, taskType: 'CLIENT_CONTACT_VALIDATE', status: 'PENDING', description: null, dueAt: '2026-10-03T00:00:00.000Z' }] });
    await openTasksTab();

    const row = await waitFor(() => rowOf(TASK_TITLE), WAIT);
    fireEvent.click(within(row).getByRole('button', { name: `Görevi tamamla: ${TASK_TITLE}` }));

    await waitFor(() => expect(mocked.updateTask).toHaveBeenCalledWith('task-1', { status: 'COMPLETED' }), WAIT);
    expect(mocked.completeAddressTask).not.toHaveBeenCalled();
    expect(mocked.cancelAddressTask).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(TASK_TITLE)).toBeNull(), WAIT);
    // Adres görevi yerinde durur ve kendi ucunu kullanmaya devam eder.
    fireEvent.click(within(rowOf(ADDRESS_TITLE)).getByRole('button', { name: `Görevi tamamla: ${ADDRESS_TITLE}` }));
    await waitFor(() => expect(mocked.completeAddressTask).toHaveBeenCalledWith('at-1', { resultType: 'POSITIVE' }), WAIT);
    expect(mocked.updateTask).toHaveBeenCalledTimes(1);
  });

  it('tamamlama reddedilirse hata görünür olur ve görev listede kalır', async () => {
    primeTasks({ current: [taskRow('task-1', TASK_TITLE)] });
    mocked.updateTask.mockRejectedValue(buildApiHttpError({ statusCode: 403, message: 'Bu işlem için yetkiniz yok' }, 403));
    mountCase();
    await openTasksTab();

    const row = await waitFor(() => rowOf(TASK_TITLE), WAIT);
    fireEvent.click(within(row).getByRole('button', { name: `Görevi tamamla: ${TASK_TITLE}` }));

    const alert = await screen.findByRole('alert', {}, WAIT);
    expect(norm(alert.textContent)).toContain('Görev listede duruyor.');
    expect(rowOf(TASK_TITLE)).toBeTruthy();
    expect(mocked.updateTask).toHaveBeenCalledTimes(1);
  });

  it('dosya görevleri okunamazsa hata bandı çıkar; "Tekrar dene" yalnız bu kaynağı yeniden okur', async () => {
    const rows = { current: [taskRow('task-1', TASK_TITLE)] };
    mocked.getTasks.mockRejectedValue(new TypeError('Failed to fetch'));
    mountCase();
    await waitFor(() => deckTab('Yapılacaklar'), WAIT);

    const alert = await screen.findByRole('alert', {}, WAIT);
    expect(norm(alert.textContent)).toContain('Yapılacaklar listesinde dosya görevleri eksik olabilir.');
    const addressReads = mocked.getAddressTasksForCase.mock.calls.length;

    primeTasks(rows);
    fireEvent.click(within(alert).getByRole('button', { name: 'Tekrar dene' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), WAIT);
    fireEvent.click(deckTab('Yapılacaklar'));
    await waitFor(() => rowOf(TASK_TITLE), WAIT);
    expect(mocked.getAddressTasksForCase.mock.calls.length).toBe(addressReads);
  });
});

describe('Yapılacaklar — "Manuel Görev Ekle" gerçek görev oluşturur', () => {
  it('pencere açılır; kayıt açık dosyanın kimliğiyle POST /tasks gönderir; başarıda liste yeniden okunur ve görev görünür', async () => {
    const rows = { current: [] as Rec[] };
    primeTasks(rows);
    mocked.createTask.mockImplementation(async (body: Rec) => {
      rows.current = [taskRow('task-new', String(body.title))];
      return { id: 'task-new' };
    });
    mountCase();
    await openTasksTab();

    fireEvent.click(await screen.findByRole('button', { name: /Manuel Görev Ekle/ }, WAIT));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(norm(dialog.textContent)).toContain('Manuel Görev Ekle — 2026/1');
    fireEvent.change(within(dialog).getByLabelText('Başlık *'), { target: { value: NEW_TITLE } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Görevi Oluştur' }));

    await waitFor(() => expect(mocked.createTask).toHaveBeenCalledTimes(1), WAIT);
    expect(mocked.createTask.mock.calls[0][0]).toMatchObject({ title: NEW_TITLE, caseId: 'case-1', priority: 'MEDIUM' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    await waitFor(() => rowOf(NEW_TITLE), WAIT);
    expect(console.log).not.toHaveBeenCalledWith('Görev ekle');
  });

  it('sunucu reddederse pencere açık kalır, hata görünür ve liste değişmez', async () => {
    primeTasks({ current: [] });
    mocked.createTask.mockRejectedValue(buildApiHttpError({ statusCode: 400, message: 'Geçersiz dosya: aynı ofise ait bir dosya değil.' }, 400));
    mountCase();
    await openTasksTab();

    fireEvent.click(await screen.findByRole('button', { name: /Manuel Görev Ekle/ }, WAIT));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    fireEvent.change(within(dialog).getByLabelText('Başlık *'), { target: { value: NEW_TITLE } });
    const readsBefore = mocked.getTasks.mock.calls.length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Görevi Oluştur' }));

    const alert = await within(dialog).findByRole('alert', {}, WAIT);
    expect(norm(alert.textContent)).toContain('Görev oluşturulmadı.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(mocked.getTasks.mock.calls.length).toBe(readsBefore);
    expect(screen.queryByText(NEW_TITLE)).toBeNull();
  });

  it('VIEWER için "Manuel Görev Ekle" sunulmaz', async () => {
    auth.user = { id: 'u9', tenantId: 't1', role: 'VIEWER' };
    primeTasks({ current: [] });
    mountCase();
    await openTasksTab();

    await waitFor(() => expect(screen.getByText('Bekleyen iş yok')).toBeTruthy(), WAIT);
    expect(screen.queryByRole('button', { name: /Manuel Görev Ekle/ })).toBeNull();
    expect(mocked.createTask).not.toHaveBeenCalled();
  });
});
