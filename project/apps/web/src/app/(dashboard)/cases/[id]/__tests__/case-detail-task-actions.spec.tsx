import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/**
 * DOSYA ÇALIŞMA ALANI — Yapılacaklar sekmesi: yanlış adrese giden tıklama kaldırılır, hata görünür olur.
 *
 * Kusur (gerçek tarayıcıda ölçüldü, main 6681b1d5 / 88cd328d; yerel API + disposable PostgreSQL):
 *  - Masraf talebinden türetilen görevin (ör. "Müvekkilden Takip açılış masrafları talep edildi") onay (✓) simgesi
 *    `POST /api/address-tasks/<masraf talebi kimliği>/complete` gönderiyordu → 404 "Adres görevi bulunamadı".
 *    Görünür 7 masraf durumunun 7'sinde aynı; ekranda ileti yoktu, görev listede kalıyordu.
 *  - `onTaskAction` hatayı yalnız `console.error` ile yutuyordu; gerçek adres görevinde de (ağ kesintisi, 500, 401) ekranda
 *    ileti çıkmıyordu.
 *  - ✓ düğmesinin erişilebilir adı yoktu.
 *
 * Owner kararı (2026-10-05): pasif simge + somut, nötr açıklama ve görünür hata bandı. Bu teslim "görev tamamlama akışı
 * geliştirildi" DEĞİL, "yanlış eylem kaldırıldı ve hata görünür oldu"dur. Masraf ödeme akışı, öncelik rozeti, "Bir Sonraki
 * Hamle" kartının akıbeti ve VIEWER yetkisi bu testin konusu DEĞİLDİR.
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

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' }, loading: false }),
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

type Rec = Record<string, unknown>;

const EXPENSE_TITLE = 'Müvekkilden Takip açılış masrafları talep edildi';
const ADDRESS_TITLE = 'Müvekkil iletişim bilgilerini doğrula';
const REQUEST_TITLE = 'Müvekkile adres talebi gönder';
const PASSIVE_REASON = 'Masraf talebinden türetildi; buradan kapatılamaz';

/** GET /expense-requests/case/:caseId/three-view öğesi (bekleyen açılış masraf talebi). */
const openingExpenseRequest: Rec = {
  task: { id: 'exp-1', title: EXPENSE_TITLE, status: 'BEKLIYOR', priority: 'HIGH', dueDate: '2026-10-09T00:00:00.000Z' },
  finance: {
    id: 'exp-1',
    type: 'MASRAF_TALEP',
    date: '2026-02-01T00:00:00.000Z',
    description: 'Takip Açılış Masrafları',
    status: 'PENDING',
    totalAmount: 1431.1,
    paidAmount: 0,
    remainingAmount: 1431.1,
    items: [],
    payments: [],
  },
  clientRequest: { id: 'exp-1', content: 'Takip Açılış Masrafları - 1.431,10 TL', amount: 1431.1, status: 'BEKLIYOR', createdAt: '2026-02-01T00:00:00.000Z' },
};

/** GET /address-tasks/case/:caseId öğesi (AddressTaskDTO). */
const addressTask = (id: string, title: string, taskType: string, status = 'PENDING'): Rec => ({
  id,
  title,
  taskType,
  status,
  description: null,
  dueAt: '2026-10-03T00:00:00.000Z',
});

function mountCase(input: { workflowStage?: string; expenseThreeView?: Rec[]; addressTasks?: Rec[] } = {}) {
  const loaded = {
    id: 'case-1',
    fileNumber: '2026/1',
    currency: 'TRY',
    principalAmount: '10000',
    workflowStage: input.workflowStage ?? 'INITIAL',
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
  mocked.getExpenseThreeViewForCase.mockResolvedValue(input.expenseThreeView ?? []);
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

/** OperationDeck sekme düğmesi: yazısı etiketin kendisi (+ varsa rozet sayısı). */
function deckTab(label: string): HTMLElement {
  const hits = screen.getAllByRole('button').filter((b) => new RegExp(`^${label}(\\d+)?$`).test(norm(b.textContent)));
  if (hits.length !== 1) throw new Error(`"${label}" sekme düğmesi tek değil: ${hits.length}`);
  return hits[0];
}

/** Sayfa yüklendi, görev kaynakları okundu ve Yapılacaklar sekmesi açıldı. */
async function openTasksTab() {
  await waitFor(() => deckTab('Yapılacaklar'), WAIT);
  await waitFor(() => {
    expect(mocked.getAddressTasksForCase).toHaveBeenCalled();
    expect(mocked.getExpenseThreeViewForCase).toHaveBeenCalled();
  }, WAIT);
  fireEvent.click(deckTab('Yapılacaklar'));
}

/** Görev satırı: başlık metninin bulunduğu satır kapsayıcısı. */
function taskRow(title: string): HTMLElement {
  const row = screen.getByText(title).closest('div.flex.items-center.justify-between');
  if (!row) throw new Error(`"${title}" görev satırı bulunamadı`);
  return row as HTMLElement;
}

const rowButtons = (row: HTMLElement) => within(row).queryAllByRole('button');

beforeEach(() => {
  vi.clearAllMocks();
  // Alt bileşenler kendi istemcisiyle ağa çıkar; yerelde çalışan bir API'ye istek atmasın diye yanıt hiç dönmez.
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Yapılacaklar — masraf görevi: yanlış adrese giden ✓ kaldırılır', () => {
  it('masraf görevi satırında ✓ düğmesi YOK; pasif açıklama var ve tıklama hiçbir istek göndermez', async () => {
    mountCase({ expenseThreeView: [openingExpenseRequest] });
    await openTasksTab();

    const row = await waitFor(() => taskRow(EXPENSE_TITLE), WAIT);
    // Eylem düğmesi yok (satırda "Zaten aldık" da yok): bu satırda hiçbir etkileşimli öğe bulunmaz.
    expect(rowButtons(row)).toHaveLength(0);

    const reason = within(row).getByText(PASSIVE_REASON);
    expect(reason.getAttribute('title')).toBe(PASSIVE_REASON);
    fireEvent.click(reason);

    expect(mocked.completeAddressTask).not.toHaveBeenCalled();
    expect(mocked.cancelAddressTask).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('adres görevi ile birlikte listelenince yalnız adres görevinin ✓ düğmesi vardır', async () => {
    mountCase({
      expenseThreeView: [openingExpenseRequest],
      addressTasks: [addressTask('at-1', ADDRESS_TITLE, 'CLIENT_CONTACT_VALIDATE')],
    });
    await openTasksTab();

    const addressRow = await waitFor(() => taskRow(ADDRESS_TITLE), WAIT);
    const expenseRow = taskRow(EXPENSE_TITLE);
    expect(rowButtons(addressRow)).toHaveLength(1);
    expect(rowButtons(expenseRow)).toHaveLength(0);
  });
});

describe('Yapılacaklar — adres görevi ✓: erişilebilir ad ve gerçek istek', () => {
  it('✓ düğmesinin adı görev başlığını taşır ve istek adres görevi kimliğiyle gider', async () => {
    mocked.completeAddressTask.mockResolvedValue({ task: { id: 'at-1', status: 'DONE' } });
    mountCase({ addressTasks: [addressTask('at-1', ADDRESS_TITLE, 'CLIENT_CONTACT_VALIDATE')] });
    await openTasksTab();

    const row = await waitFor(() => taskRow(ADDRESS_TITLE), WAIT);
    const button = within(row).getByRole('button', { name: `Görevi tamamla: ${ADDRESS_TITLE}` });
    fireEvent.click(button);

    await waitFor(() => expect(mocked.completeAddressTask).toHaveBeenCalledWith('at-1', { resultType: 'POSITIVE' }), WAIT);
    expect(screen.queryByRole('alert')).toBeNull();
    // Başarıdan sonra görevler yeniden okunur (ilk okuma + yenileme).
    await waitFor(() => expect(mocked.getAddressTasksForCase.mock.calls.length).toBeGreaterThanOrEqual(2), WAIT);
  });

  it('"Zaten aldık" yolu aynen kalır (adres talebi görevinde düğme var, ✓ adlı)', async () => {
    mountCase({ addressTasks: [addressTask('at-2', REQUEST_TITLE, 'CLIENT_REQUEST_DEBTOR_ADDRESSES')] });
    await openTasksTab();

    const row = await waitFor(() => taskRow(REQUEST_TITLE), WAIT);
    expect(within(row).getByRole('button', { name: 'Zaten aldık' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: `Görevi tamamla: ${REQUEST_TITLE}` })).toBeTruthy();
  });
});

describe('Yapılacaklar — eylem hatası görünür olur', () => {
  it('sunucu hatası: iletisi role="alert" bandında yazılır; görev listede kalır', async () => {
    mocked.completeAddressTask.mockRejectedValue(Object.assign(new Error('Sunucu hatası (test)'), { status: 500, body: { message: 'Sunucu hatası (test)' } }));
    mountCase({ addressTasks: [addressTask('at-1', ADDRESS_TITLE, 'CLIENT_CONTACT_VALIDATE')] });
    await openTasksTab();

    const row = await waitFor(() => taskRow(ADDRESS_TITLE), WAIT);
    fireEvent.click(within(row).getByRole('button', { name: `Görevi tamamla: ${ADDRESS_TITLE}` }));

    const band = await screen.findByRole('alert', undefined, WAIT);
    expect(norm(band.textContent)).toContain('Sunucu hatası (test)');
    expect(norm(band.textContent)).toContain('Görev listede duruyor');
    expect(screen.getByText(ADDRESS_TITLE)).toBeTruthy();
  });

  it('ağ kesintisi: sunucu iletisi yoksa güvenli yedek metin yazılır (iç ayrıntı sızmaz)', async () => {
    mocked.completeAddressTask.mockRejectedValue(new TypeError('Failed to fetch http://localhost:8080/api/address-tasks/at-1/complete'));
    mountCase({ addressTasks: [addressTask('at-1', ADDRESS_TITLE, 'CLIENT_CONTACT_VALIDATE')] });
    await openTasksTab();

    const row = await waitFor(() => taskRow(ADDRESS_TITLE), WAIT);
    fireEvent.click(within(row).getByRole('button', { name: `Görevi tamamla: ${ADDRESS_TITLE}` }));

    const band = await screen.findByRole('alert', undefined, WAIT);
    expect(norm(band.textContent)).toContain('Sunucuya ulaşılamadı');
    expect(norm(band.textContent)).not.toMatch(/localhost|http/i);
  });

  it('başarılı yeniden deneme bandı kaldırır', async () => {
    mocked.completeAddressTask.mockRejectedValueOnce(Object.assign(new Error('Hata'), { status: 500, body: { message: 'Hata (test)' } }));
    mocked.completeAddressTask.mockResolvedValueOnce({ task: { id: 'at-1', status: 'DONE' } });
    mountCase({ addressTasks: [addressTask('at-1', ADDRESS_TITLE, 'CLIENT_CONTACT_VALIDATE')] });
    await openTasksTab();

    const click = () => fireEvent.click(within(taskRow(ADDRESS_TITLE)).getByRole('button', { name: `Görevi tamamla: ${ADDRESS_TITLE}` }));
    await waitFor(() => taskRow(ADDRESS_TITLE), WAIT);
    click();
    await screen.findByRole('alert', undefined, WAIT);

    click(); // bant "Kapat"a basılmadan yeniden deneme
    await waitFor(() => expect(mocked.completeAddressTask).toHaveBeenCalledTimes(2), WAIT);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), WAIT);
  });

  it('"Kapat" bandı kaldırır ve görev listede kalır', async () => {
    mocked.completeAddressTask.mockRejectedValue(Object.assign(new Error('Hata'), { status: 500, body: { message: 'Hata (test)' } }));
    mountCase({ addressTasks: [addressTask('at-1', ADDRESS_TITLE, 'CLIENT_CONTACT_VALIDATE')] });
    await openTasksTab();

    await waitFor(() => taskRow(ADDRESS_TITLE), WAIT);
    fireEvent.click(within(taskRow(ADDRESS_TITLE)).getByRole('button', { name: `Görevi tamamla: ${ADDRESS_TITLE}` }));
    const band = await screen.findByRole('alert', undefined, WAIT);
    fireEvent.click(within(band).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), WAIT);
    expect(screen.getByText(ADDRESS_TITLE)).toBeTruthy();
  });

  it('adres görevi olmayan kimlik ("Bir Sonraki Hamle" örneği): istek GİTMEZ, bant nedeni yazar', async () => {
    // Kartın tek üreticisi `workflowStage === "ODEME_EMRI"` örneğidir; gerçek aşamalarda çizilmez (ölçüldü). Çizildiğinde
    // düğmeler adres görevi ucuna gidip 404 almamalı. Kartın akıbeti bu işin konusu değildir.
    mountCase({ workflowStage: 'ODEME_EMRI' });
    await openTasksTab();

    const done = await screen.findByRole('button', { name: 'Yapıldı' }, WAIT);
    fireEvent.click(done);

    const band = await screen.findByRole('alert', undefined, WAIT);
    expect(norm(band.textContent)).toContain('buradan tamamlanamaz');
    fireEvent.click(within(band).getByRole('button', { name: 'Kapat' }));
    fireEvent.click(screen.getByRole('button', { name: 'İptal' }));
    expect(norm((await screen.findByRole('alert', undefined, WAIT)).textContent)).toContain('buradan');

    expect(mocked.completeAddressTask).not.toHaveBeenCalled();
    expect(mocked.cancelAddressTask).not.toHaveBeenCalled();
  });
});
