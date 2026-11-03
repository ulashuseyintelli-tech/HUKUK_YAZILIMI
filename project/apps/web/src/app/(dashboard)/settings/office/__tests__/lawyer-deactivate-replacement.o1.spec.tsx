import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within, act } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * O-1 — Avukat pasifleştirmede devralan (yeni sorumlu avukat) seçimi.
 * stable key: app/(dashboard)/settings/office/page.tsx#deactivateLawyer
 *
 * Backend kuralı (lawyer.service.ts `delete`, H1) DEĞİŞMEZ; gövdeler backend yanıtıyla birebir:
 *  - sorumlu dosyası yok  → gövdesiz istek kabul edilir (seçim istenmez)
 *  - sorumlu dosyası var  → 400 düz metin ("... (replacementLawyerId) seçilmelidir.")
 *  - devralan eksik atanmış → 400 { code: REPLACEMENT_NOT_ASSIGNED_TO_CASES, caseIds }
 * Gerçek kayıt / canlı veri YOK: istemci tamamen taklit edilir.
 */

let search = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings/office',
  useSearchParams: () => search,
}));

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const LAWYERS = [
  { id: 'l1', name: 'DENEME', surname: 'BIR', isDefaultForNewCases: false, sortOrder: 0 },
  { id: 'l2', name: 'DENEME', surname: 'IKI', isDefaultForNewCases: true, sortOrder: 1 },
  { id: 'l3', name: 'DENEME', surname: 'UC', isDefaultForNewCases: false, sortOrder: 2 },
];
const office = (lawyers: unknown[]) => ({ name: 'DENEME HUKUK', lawyers, bankAccounts: [] });

function primeReads(over: Record<string, unknown> = {}) {
  mocked.get.mockImplementation((url: string) => {
    const map: Record<string, unknown> = {
      '/office': { data: office(LAWYERS) },
      '/office/smtp-settings': { data: {} },
      '/office/sms-settings': { data: {} },
      '/office/greeting-settings': { data: {} },
      '/office/escalation-settings': { data: {} },
      '/staff': { data: { data: [] } },
      ...over,
    };
    const hit = map[url];
    if (hit instanceof Error) return Promise.reject(hit);
    return Promise.resolve(hit ?? { data: {} });
  });
}

const REQUIRED = {
  status: 400,
  body: {
    statusCode: 400,
    message: 'Bu avukat bir veya daha fazla dosyada sorumlu; pasifleştirmeden önce yeni sorumlu avukat (replacementLawyerId) seçilmelidir.',
    error: 'Bad Request',
  },
};
const NOT_ASSIGNED = {
  status: 400,
  body: {
    message: 'Yeni sorumlu avukat aşağıdaki dosyalara henüz atanmamış; önce dosyalara ekleyin.',
    code: 'REPLACEMENT_NOT_ASSIGNED_TO_CASES',
    caseIds: ['c-1', 'c-2'],
  },
};

const DEL_L1 = 'DENEME BIR avukatını pasifleştir';
const SUBMIT = 'Devret ve pasifleştir';

function drawer(): HTMLElement {
  return screen.getByRole('dialog');
}

async function renderLawyers() {
  search = new URLSearchParams('section=lawyers');
  render(<OfficeSettingsPage />);
  await waitFor(() => expect(within(drawer()).getByRole('button', { name: DEL_L1 })).toBeTruthy());
  return within(drawer());
}

/** Devralan isteyen ilk yanıtı üretip seçim bölgesini açar. */
async function openPicker(d: ReturnType<typeof within>) {
  mocked.delete.mockRejectedValueOnce(REQUIRED);
  fireEvent.click(d.getByRole('button', { name: DEL_L1 }));
  return within(await d.findByRole('region', { name: 'Devralan avukat seçimi' }));
}

let consoleErrors: unknown[][] = [];
let unhandled: unknown[] = [];
const onUnhandled = (e: PromiseRejectionEvent) => {
  unhandled.push(e.reason);
  e.preventDefault();
};

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeReads();
  search = new URLSearchParams('');
  consoleErrors = [];
  unhandled = [];
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args);
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  window.addEventListener('unhandledrejection', onUnhandled);
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  const errs = consoleErrors;
  const unh = unhandled;
  window.removeEventListener('unhandledrejection', onUnhandled);
  cleanup();
  vi.restoreAllMocks();
  // console.error, unhandled rejection ve act uyarısı PASS SAYILMAZ.
  expect(unh).toHaveLength(0);
  expect(errs).toHaveLength(0);
});

describe('O-1 avukat pasifleştirme — devralan seçimi', () => {
  it('devralan GEREKMEYEN avukat: tek gövdesiz istek, seçim AÇILMAZ, liste yenilenir', async () => {
    mocked.delete.mockResolvedValueOnce({ data: {} });
    const d = await renderLawyers();
    const before = mocked.get.mock.calls.length;
    fireEvent.click(d.getByRole('button', { name: DEL_L1 }));
    await waitFor(() => expect(mocked.get.mock.calls.length).toBeGreaterThan(before));
    expect(mocked.delete.mock.calls).toEqual([['/lawyers/l1']]);
    expect(d.queryByRole('region', { name: 'Devralan avukat seçimi' })).toBeNull();
  });

  it('devralan GEREKLİ: seçim açılır, adaylar kendisi hariç aktif avukatlar; seçimle gövdeli istek; başarıda kapanır', async () => {
    const d = await renderLawyers();
    const r = await openPicker(d);
    expect(r.getByRole('alert').textContent).toMatch(/dosyaları devralacak avukatı seçin\. Hiçbir değişiklik yapılmadı/);
    const select = r.getByLabelText('Yeni sorumlu avukat') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'l2', 'l3']);
    expect((r.getByRole('button', { name: SUBMIT }) as HTMLButtonElement).disabled).toBe(true);
    // satır pasif GÖSTERİLMEZ, istek yalnız bir kez gitti
    expect((d.getByRole('button', { name: DEL_L1 }) as HTMLButtonElement).disabled).toBe(false);
    expect(mocked.delete).toHaveBeenCalledTimes(1);

    fireEvent.change(select, { target: { value: 'l2' } });
    mocked.delete.mockResolvedValueOnce({ data: {} });
    const before = mocked.get.mock.calls.length;
    fireEvent.click(r.getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(d.queryByRole('region', { name: 'Devralan avukat seçimi' })).toBeNull());
    expect(mocked.delete.mock.calls).toEqual([['/lawyers/l1'], ['/lawyers/l1', { replacementLawyerId: 'l2' }]]);
    expect(mocked.get.mock.calls.length).toBeGreaterThan(before);
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it('EKSİK ATAMA: backend dosya listesi gösterilir, seçim korunur, otomatik atama YOK, satır KORUNUR; atama tamamlanınca aynı seçimle geçer', async () => {
    const d = await renderLawyers();
    const r = await openPicker(d);
    fireEvent.change(r.getByLabelText('Yeni sorumlu avukat'), { target: { value: 'l2' } });
    mocked.delete.mockRejectedValueOnce(NOT_ASSIGNED);
    fireEvent.click(r.getByRole('button', { name: SUBMIT }));

    const list = await r.findByRole('list', { name: 'Devralanın atanmadığı dosyalar' });
    expect(Array.from(list.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['/cases/c-1', '/cases/c-2']);
    const notice = r.getByRole('alert').textContent ?? '';
    expect(notice).toMatch(/aşağıdaki 2 dosyaya henüz atanmamış/);
    expect(notice).toMatch(/Otomatik atama yapılmaz: önce bu dosyalarda avukat atamasını tamamlayın/);
    expect((r.getByLabelText('Yeni sorumlu avukat') as HTMLSelectElement).value).toBe('l2');
    expect((d.getByRole('button', { name: DEL_L1 }) as HTMLButtonElement).disabled).toBe(false);
    expect((r.getByRole('button', { name: SUBMIT }) as HTMLButtonElement).disabled).toBe(false);
    // otomatik atama ya da başka yazma çağrısı YOK
    expect(mocked.post).not.toHaveBeenCalled();
    expect(mocked.put).not.toHaveBeenCalled();
    expect(mocked.patch).not.toHaveBeenCalled();
    expect(mocked.delete).toHaveBeenCalledTimes(2);

    // kullanıcı dosya atamalarını tamamladıktan sonra AYNI seçimle yeniden gönderir
    mocked.delete.mockResolvedValueOnce({ data: {} });
    fireEvent.click(r.getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(d.queryByRole('region', { name: 'Devralan avukat seçimi' })).toBeNull());
    expect(mocked.delete.mock.calls[2]).toEqual(['/lawyers/l1', { replacementLawyerId: 'l2' }]);
  });

  it('seçim değişince önceki seçime ait eksik dosya listesi temizlenir', async () => {
    const d = await renderLawyers();
    const r = await openPicker(d);
    fireEvent.change(r.getByLabelText('Yeni sorumlu avukat'), { target: { value: 'l2' } });
    mocked.delete.mockRejectedValueOnce(NOT_ASSIGNED);
    fireEvent.click(r.getByRole('button', { name: SUBMIT }));
    await r.findByRole('list', { name: 'Devralanın atanmadığı dosyalar' });
    fireEvent.change(r.getByLabelText('Yeni sorumlu avukat'), { target: { value: 'l3' } });
    expect(r.queryByRole('list', { name: 'Devralanın atanmadığı dosyalar' })).toBeNull();
    expect(r.queryByRole('alert')).toBeNull();
  });

  it('bilinmeyen hata GİZLENMEZ; seçim ve satır korunur', async () => {
    const d = await renderLawyers();
    const r = await openPicker(d);
    fireEvent.change(r.getByLabelText('Yeni sorumlu avukat'), { target: { value: 'l3' } });
    mocked.delete.mockRejectedValueOnce({ status: 409, body: { code: 'YENI_KURAL', message: 'Yeni bir kural ihlali.' } });
    fireEvent.click(r.getByRole('button', { name: SUBMIT }));
    await screen.findByText('Yeni bir kural ihlali.');
    expect((r.getByLabelText('Yeni sorumlu avukat') as HTMLSelectElement).value).toBe('l3');
    expect(d.getByRole('region', { name: 'Devralan avukat seçimi' })).toBeTruthy();
    expect((d.getByRole('button', { name: DEL_L1 }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('işlem SÜRERKEN yinelenen gönderim engellenir; düğmeler kapalı, bitince açılır', async () => {
    const d = await renderLawyers();
    const r = await openPicker(d);
    fireEvent.change(r.getByLabelText('Yeni sorumlu avukat'), { target: { value: 'l2' } });
    let finish!: (v: unknown) => void;
    mocked.delete.mockImplementationOnce(() => new Promise((_, rej) => { finish = rej; }));
    const submit = r.getByRole('button', { name: SUBMIT }) as HTMLButtonElement;
    act(() => {
      submit.click();
      submit.click();
    });
    await waitFor(() => expect(submit.disabled).toBe(true));
    expect((d.getByRole('button', { name: DEL_L1 }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(d.getByRole('button', { name: DEL_L1 }));
    expect(mocked.delete).toHaveBeenCalledTimes(2); // ilk gövdesiz + TEK gövdeli

    await act(async () => {
      finish({ status: 400, body: { message: 'Yeni sorumlu avukat aktif olmalıdır.' } });
    });
    await screen.findByText('Yeni sorumlu avukat aktif olmalıdır.');
    expect(submit.disabled).toBe(false);
    expect((d.getByRole('button', { name: DEL_L1 }) as HTMLButtonElement).disabled).toBe(false);
    expect(mocked.delete).toHaveBeenCalledTimes(2);
  });

  it('FARKLI iki avukatın eşzamanlı istekleri: her satır kendi isteği bitene kadar meşgul; biri bitince diğeri AÇILMAZ', async () => {
    const DEL_L2 = 'DENEME IKI avukatını pasifleştir';
    const pending: Record<string, (v: unknown) => void> = {};
    mocked.delete.mockImplementation((url: string) => new Promise((_, rej) => { pending[url] = rej; }));
    const d = await renderLawyers();
    const b1 = d.getByRole('button', { name: DEL_L1 }) as HTMLButtonElement;
    const b2 = d.getByRole('button', { name: DEL_L2 }) as HTMLButtonElement;

    fireEvent.click(b1);
    await waitFor(() => expect(b1.disabled).toBe(true));
    fireEvent.click(b2);
    await waitFor(() => expect(b2.disabled).toBe(true));
    // ikinci istek ilkinin meşgul durumunu SİLMEZ
    expect(b1.disabled).toBe(true);
    expect(mocked.delete.mock.calls).toEqual([['/lawyers/l1'], ['/lawyers/l2']]);

    // ikinci biter → yalnız ikinci satır açılır
    await act(async () => {
      pending['/lawyers/l2']({ status: 400, body: { message: 'İkinci istek reddedildi.' } });
    });
    await screen.findByText('İkinci istek reddedildi.');
    expect(b2.disabled).toBe(false);
    expect(b1.disabled).toBe(true);
    // çift gönderim koruması: hâlâ meşgul satıra tıklama yeni istek BAŞLATMAZ
    fireEvent.click(b1);
    expect(mocked.delete).toHaveBeenCalledTimes(2);

    // ilk biter → o satır da açılır
    await act(async () => {
      pending['/lawyers/l1']({ status: 400, body: { message: 'İlk istek reddedildi.' } });
    });
    await screen.findByText('İlk istek reddedildi.');
    expect(b1.disabled).toBe(false);
    expect(b2.disabled).toBe(false);
    expect(mocked.delete).toHaveBeenCalledTimes(2);
  });

  it('devralabilecek başka aktif avukat yoksa açıklama görünür, gönderim kapalı', async () => {
    primeReads({ '/office': { data: office([LAWYERS[0]]) } });
    const d = await renderLawyers();
    const r = await openPicker(d);
    expect(r.getByText(/Büroda devralabilecek başka aktif avukat yok/)).toBeTruthy();
    expect((r.getByRole('button', { name: SUBMIT }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocked.delete).toHaveBeenCalledTimes(1);
  });

  it('Vazgeç seçimi kapatır, istek GÖNDERMEZ', async () => {
    const d = await renderLawyers();
    const r = await openPicker(d);
    fireEvent.change(r.getByLabelText('Yeni sorumlu avukat'), { target: { value: 'l2' } });
    fireEvent.click(r.getByRole('button', { name: 'Vazgeç' }));
    expect(d.queryByRole('region', { name: 'Devralan avukat seçimi' })).toBeNull();
    expect(mocked.delete).toHaveBeenCalledTimes(1);
  });
});
