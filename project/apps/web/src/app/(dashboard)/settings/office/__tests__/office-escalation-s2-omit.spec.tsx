import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * F-B01-03 (2026-09-06) — S2 alıcı listeleri (escalation*LawyerIds) sunucudan GELMEDİĞİNDE form davranışı.
 * stable key: app/(dashboard)/settings/office/page.tsx#handleSaveEscalation
 *
 * Sözleşme:
 *  - GET /office/escalation-settings yanıtında liste alanı YOKSA: ilgili seçim kutuları devre dışı, açık not gösterilir,
 *    KAYDET payload'ında o alan HİÇ yer almaz (boş listeye dönüştürülüp PUT edilmez → sunucu mevcut alıcıları korur).
 *  - Yanıtta liste GELİRSE (ileride explicit field-level permission): düzenlenebilir; kullanıcı listeyi boşaltırsa
 *    açıkça [] gönderilir (bilinçli, yazma yetkisine tabi ayrı işlem).
 * Kanıt sınıfı: TEST (jsdom + mock api). Production davranış kanıtı değildir.
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

const OFFICE = {
  name: 'TELLI HUKUK',
  lawyers: [
    { id: 'l1', name: 'ULAS', surname: 'TELLI', isDefaultForNewCases: false, sortOrder: 0 },
    { id: 'l2', name: 'FATMA', surname: 'ULUCA', isDefaultForNewCases: true, sortOrder: 1 },
  ],
  bankAccounts: [],
};

const ESC_SCALARS = {
  opReminderDays: 3,
  opFounderDays: 6,
  opRepeatMonths: 3,
  opEmailEnabled: true,
  opSmsEnabled: false,
  opStaffTypes: ['SEKRETER'],
  caseTaskOwnerDays: 2,
  caseTaskTeamLeadDays: 2,
  caseTaskManagerDays: 3,
};

const S2_KEYS = ['escalationManagerLawyerIds', 'escalationFounderLawyerIds', 'escalationTeamLeadLawyerIds'];

/** Her GET URL'i açıkça kurulur. `Error` değeri reject eder; `officeFailFromCall` verilirse '/office' o çağrıdan itibaren reject eder (yeniden yükleme hatası simülasyonu). */
function primeReads(escalation: Record<string, unknown> | Error, opts: { officeFailFromCall?: number } = {}) {
  let officeCalls = 0;
  mocked.get.mockImplementation((url: string) => {
    if (url === '/office') {
      officeCalls += 1;
      if (opts.officeFailFromCall && officeCalls >= opts.officeFailFromCall) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ data: OFFICE });
    }
    const map: Record<string, unknown> = {
      '/office/smtp-settings': { data: {} },
      '/office/sms-settings': { data: {} },
      '/office/greeting-settings': { data: {} },
      '/office/escalation-settings': escalation instanceof Error ? escalation : { data: escalation },
      '/staff': { data: { data: [] } },
    };
    const hit = map[url];
    if (hit instanceof Error) return Promise.reject(hit);
    return Promise.resolve(hit ?? { data: {} });
  });
}

function drawer(): HTMLElement {
  return screen.getByRole('dialog');
}

async function openEscalation() {
  search = new URLSearchParams('section=escalation');
  render(<OfficeSettingsPage />);
  await waitFor(() => expect(within(drawer()).getByRole('button', { name: 'Kaydet' })).toBeTruthy());
  return within(drawer());
}

let consoleErrors: unknown[][] = [];
let unhandled: unknown[] = [];
const onUnhandled = (e: PromiseRejectionEvent) => { unhandled.push(e.reason); e.preventDefault(); };

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  search = new URLSearchParams('');
  consoleErrors = []; unhandled = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { consoleErrors.push(args); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  window.addEventListener('unhandledrejection', onUnhandled);
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  const errs = consoleErrors; const unh = unhandled;
  window.removeEventListener('unhandledrejection', onUnhandled);
  cleanup();
  vi.restoreAllMocks();
  expect(unh).toHaveLength(0);
  expect(errs).toHaveLength(0);
});

describe('F-B01-03 — escalation ayarları: S2 alıcı listeleri sunucudan gelmediğinde', () => {
  it('seçim kutuları devre dışı + açık not; KAYDET payload\'ında S2 anahtarı YOK (boş listeye dönüştürülüp PUT edilmez)', async () => {
    primeReads({ ...ESC_SCALARS });
    mocked.put.mockResolvedValueOnce({ data: {} });
    const d = await openEscalation();
    expect(d.getByTestId('esc-recipients-hidden-manager')).toBeTruthy();
    expect(d.getByTestId('esc-recipients-hidden-founder')).toBeTruthy();
    expect(d.getByTestId('esc-recipients-hidden-teamlead')).toBeTruthy();
    const lawyerBoxes = d.getAllByRole('checkbox', { name: /ULAS TELLI/ });
    expect(lawyerBoxes).toHaveLength(3);
    for (const cb of lawyerBoxes) expect((cb as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(d.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    const [url, body] = mocked.put.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/office/escalation-settings');
    for (const k of S2_KEYS) expect(Object.prototype.hasOwnProperty.call(body, k)).toBe(false);
    expect(body).toMatchObject({ opReminderDays: 3, opFounderDays: 6, opRepeatMonths: 3, opEmailEnabled: true, opSmsEnabled: false, opStaffTypes: ['SEKRETER'], caseTaskOwnerDays: 2, caseTaskTeamLeadDays: 2, caseTaskManagerDays: 3 });
  });

  it('dashboard kartı "Atanan sorumlu" görünmeyen listeyi 0 kişi gibi GÖSTERMEZ ("—")', async () => {
    primeReads({ ...ESC_SCALARS });
    search = new URLSearchParams('');
    render(<OfficeSettingsPage />);
    await waitFor(() => expect(screen.getByText('Atanan sorumlu')).toBeTruthy());
    const row = screen.getByText('Atanan sorumlu').parentElement as HTMLElement;
    expect(row.textContent).toContain('—');
    expect(row.textContent).not.toMatch(/\d+ kişi/);
  });
});

describe('F-B01-03 — yükleme hatası ve eski state: gizli alanlar payload\'a GİRMEZ', () => {
  it('escalation-settings GET hata verirse: görünür yükleme hatası, kutular devre dışı, KAYDET payload\'ında S2 anahtarı YOK', async () => {
    primeReads(new TypeError('Failed to fetch'));
    mocked.put.mockResolvedValueOnce({ data: {} });
    const d = await openEscalation();
    // okuma hatası YUTULMAZ: ActionError (role=alert, data-testid=action-error) görünür; metin ağ/sunucu hatasına göre değişir
    await waitFor(() => expect(screen.getAllByTestId('action-error').length).toBeGreaterThanOrEqual(1));
    expect(d.getByTestId('esc-recipients-hidden-manager')).toBeTruthy();
    for (const cb of d.getAllByRole('checkbox', { name: /ULAS TELLI/ })) expect((cb as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(d.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    const [, body] = mocked.put.mock.calls[0] as [string, Record<string, unknown>];
    for (const k of S2_KEYS) expect(Object.prototype.hasOwnProperty.call(body, k)).toBe(false);
  });

  it('önce listeler GELDİ (kutular etkin), sonra yeniden yükleme BAŞARISIZ → eski liste state\'i payload\'a GİRMEZ (bayraklar sıfırlanır)', async () => {
    // 1. yükleme: listeler mevcut → düzenlenebilir. 2. yükleme (avukat pasifleştirme sonrası refresh): /office reddeder.
    primeReads({ ...ESC_SCALARS, escalationManagerLawyerIds: ['l1'], escalationFounderLawyerIds: ['l2'], escalationTeamLeadLawyerIds: ['l1'] }, { officeFailFromCall: 2 });
    mocked.delete.mockResolvedValueOnce({ data: {} });
    mocked.put.mockResolvedValueOnce({ data: {} });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    search = new URLSearchParams('section=lawyers');
    const view = render(<OfficeSettingsPage />);
    const DEL_LAWYER = 'ULAS TELLI avukatını pasifleştir';
    await waitFor(() => expect(within(drawer()).getByRole('button', { name: DEL_LAWYER })).toBeTruthy());
    fireEvent.click(within(drawer()).getByRole('button', { name: DEL_LAWYER }));
    await waitFor(() => expect(mocked.delete).toHaveBeenCalledWith('/lawyers/l1'));
    // mutasyon OK + yeniden yükleme FAIL → sayfa stale bant gösterir; escalation bölümüne geç (remount YOK, state korunur)
    await waitFor(() => expect(mocked.get.mock.calls.filter((c) => c[0] === '/office').length).toBeGreaterThanOrEqual(2));
    search = new URLSearchParams('section=escalation');
    view.rerender(<OfficeSettingsPage />);
    await waitFor(() => expect(within(drawer()).getByRole('button', { name: 'Kaydet' })).toBeTruthy());
    const d = within(drawer());
    expect(d.getByTestId('esc-recipients-hidden-manager')).toBeTruthy();
    for (const cb of d.getAllByRole('checkbox', { name: /ULAS TELLI/ })) expect((cb as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(d.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    const [url, body] = mocked.put.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/office/escalation-settings');
    for (const k of S2_KEYS) expect(Object.prototype.hasOwnProperty.call(body, k)).toBe(false);
  });
});

describe('F-B01-03 — listeler sunucudan GELDİĞİNDE (ileride explicit izin) düzenleme ve açık [] gönderimi', () => {
  it('kutular etkin; kullanıcı listeyi boşaltırsa açıkça [] gider, dokunulmayan listeler aynen gider', async () => {
    primeReads({ ...ESC_SCALARS, escalationManagerLawyerIds: ['l1'], escalationFounderLawyerIds: [], escalationTeamLeadLawyerIds: ['l2'] });
    mocked.put.mockResolvedValueOnce({ data: {} });
    const d = await openEscalation();
    expect(d.queryByTestId('esc-recipients-hidden-manager')).toBeNull();
    expect(d.queryByTestId('esc-recipients-hidden-founder')).toBeNull();
    expect(d.queryByTestId('esc-recipients-hidden-teamlead')).toBeNull();
    const managerUlas = d.getAllByRole('checkbox', { name: /ULAS TELLI/ })[0] as HTMLInputElement;
    expect(managerUlas.disabled).toBe(false);
    expect(managerUlas.checked).toBe(true);
    fireEvent.click(managerUlas);
    expect(managerUlas.checked).toBe(false);
    fireEvent.click(d.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    const [, body] = mocked.put.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.escalationManagerLawyerIds).toEqual([]);
    expect(body.escalationFounderLawyerIds).toEqual([]);
    expect(body.escalationTeamLeadLawyerIds).toEqual(['l2']);
  });

  it('karışık durum: yalnız gelen liste alanı payload\'a girer, gelmeyen alan girmez', async () => {
    primeReads({ ...ESC_SCALARS, escalationTeamLeadLawyerIds: ['l2'] });
    mocked.put.mockResolvedValueOnce({ data: {} });
    const d = await openEscalation();
    expect(d.getByTestId('esc-recipients-hidden-manager')).toBeTruthy();
    expect(d.queryByTestId('esc-recipients-hidden-teamlead')).toBeNull();
    fireEvent.click(d.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    const [, body] = mocked.put.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.prototype.hasOwnProperty.call(body, 'escalationManagerLawyerIds')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(body, 'escalationFounderLawyerIds')).toBe(false);
    expect(body.escalationTeamLeadLawyerIds).toEqual(['l2']);
  });
});
