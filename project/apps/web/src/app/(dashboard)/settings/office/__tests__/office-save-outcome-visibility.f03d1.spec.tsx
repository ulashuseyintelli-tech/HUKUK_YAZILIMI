import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within, act } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';
import { buildApiHttpError } from '@/lib/api-error';

/**
 * F03-D1 (OFP-19a) — Büro Ayarları: Kaydet sonucunun görünürlüğü ve durum metni dürüstlüğü.
 * stable key: app/(dashboard)/settings/office/page.tsx#saveOutcome
 *
 * Sözleşme:
 *  - SMS ve tebrik Kaydet hatası ekranda görünür (önceden yalnız `console.error`); yetki reddi ile genel hata AYRI metin taşır.
 *  - Ham sunucu iletisi ekrana taşınmaz; başarısız kayıttan sonra "Kaydedildi" denmez; form değeri korunur.
 *  - Başarılı kayıt "Kaydedildi" der; alan değişince eski sonuç silinir.
 *  - Görev & Eskalasyon metinleri çalışan zamanlayıcıyla çelişmez: "sonraki sürümde aktifleşir" / "PR-3b" / sabit "şu an kapalı"
 *    iddiası yoktur. B-05 hükmü (motorun davranış kabulü yok) korunur: metin "kabul edildi" de demez.
 * Kanıt sınıfı: TEST (jsdom + sahte api). Gerçek tarayıcı / API kanıtı DEĞİLDİR.
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

const OFFICE = { name: 'SENTETIK BURO', lawyers: [], bankAccounts: [] };
const SMS = { smsProvider: 'NETGSM', smsSender: 'SENTETIK' };
const GREETING = { autoGreetingEnabled: true, autoGreetingTime: '09:00' };
const ESC = { opReminderDays: 3, opFounderDays: 6, opRepeatMonths: 3, opEmailEnabled: true, opSmsEnabled: false, opStaffTypes: ['SEKRETER'], caseTaskOwnerDays: 2, caseTaskTeamLeadDays: 2, caseTaskManagerDays: 3 };
const RAW_SERVER_TEXT = 'PRIVATE-PROVIDER-SECRET';

function prime() {
  const base: Record<string, unknown> = {
    '/office': OFFICE,
    '/office/smtp-settings': {},
    '/office/sms-settings': SMS,
    '/office/greeting-settings': GREETING,
    '/office/escalation-settings': ESC,
    '/staff': { data: [] },
    '/greetings/today': {},
    '/lawyers/default-permissions/status': {},
  };
  mocked.get.mockImplementation((url: string) => Promise.resolve({ data: url in base ? base[url] : {} }));
  mocked.put.mockResolvedValue({ data: {} });
  mocked.post.mockResolvedValue({ data: {} });
  mocked.delete.mockResolvedValue({ data: {} });
}
async function settle() { await act(async () => { await new Promise((r) => setTimeout(r, 30)); }); }
async function open(section: string) {
  search = new URLSearchParams(`section=${section}`);
  render(<OfficeSettingsPage />);
  await waitFor(() => { if (!screen.queryByRole('heading', { name: 'Büro Ayarları' })) throw new Error('yükleniyor'); }, { timeout: 3000 });
  await settle();
  return screen.getByRole('dialog');
}
const body = () => document.body.textContent ?? '';

let consoleErrors: unknown[][] = [];
beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  consoleErrors = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { consoleErrors.push(a); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('SMS Kaydet sonucu', () => {
  it.each([
    [403, 'Hata: SMS ayarlarını kaydetme yetkiniz yok.'],
    [500, 'Hata: SMS ayarları kaydedilemedi.'],
  ])('%s → görünür, güvenli hata; form korunur; "Kaydedildi" denmez', async (status, expected) => {
    prime();
    mocked.put.mockRejectedValueOnce(buildApiHttpError({ message: RAW_SERVER_TEXT }, status as number));
    const dlg = await open('sms');
    fireEvent.change(within(dlg).getByDisplayValue('SENTETIK'), { target: { value: 'YENIBASLIK' } });
    fireEvent.click(within(dlg).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(dlg.textContent).toContain(expected));
    expect(within(dlg).getByDisplayValue('YENIBASLIK')).toBeTruthy();
    expect(body()).not.toContain(RAW_SERVER_TEXT);
    expect(body()).not.toContain('Kaydedildi');
    expect(JSON.stringify(consoleErrors)).not.toContain(RAW_SERVER_TEXT);
    expect(mocked.put).toHaveBeenCalledTimes(1);
    expect(mocked.put.mock.calls[0][0]).toBe('/office/sms-settings');
  });

  it('başarı → "Kaydedildi"; alan değişince eski sonuç silinir; başarısız kayıt kendiliğinden yinelenmez', async () => {
    prime();
    const dlg = await open('sms');
    fireEvent.click(within(dlg).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(dlg.textContent).toContain('Kaydedildi'));
    fireEvent.change(within(dlg).getByDisplayValue('SENTETIK'), { target: { value: 'YENIBASLIK' } });
    await waitFor(() => expect(dlg.textContent).not.toContain('Kaydedildi'));
    mocked.put.mockRejectedValueOnce(buildApiHttpError({ message: RAW_SERVER_TEXT }, 500));
    fireEvent.click(within(dlg).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(dlg.textContent).toContain('Hata: SMS ayarları kaydedilemedi.'));
    await settle();
    expect(mocked.put).toHaveBeenCalledTimes(2);
  });
});

describe('Tebrik Kaydet sonucu', () => {
  it.each([
    [403, 'Hata: Tebrik ayarlarını kaydetme yetkiniz yok.'],
    [500, 'Hata: Tebrik ayarları kaydedilemedi.'],
  ])('%s → görünür, güvenli hata; "Kaydedildi" denmez', async (status, expected) => {
    prime();
    mocked.put.mockRejectedValueOnce(buildApiHttpError({ message: RAW_SERVER_TEXT }, status as number));
    const dlg = await open('greeting');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(within(dlg).getByTestId('greeting-save-status').textContent).toBe(expected));
    expect(body()).not.toContain(RAW_SERVER_TEXT);
    expect(body()).not.toContain('Kaydedildi');
    expect(mocked.put).toHaveBeenCalledTimes(1);
    expect(mocked.put.mock.calls[0]).toEqual(['/office/greeting-settings', GREETING]);
  });

  it('başarı → "Kaydedildi"; ayar değişince eski sonuç silinir', async () => {
    prime();
    const dlg = await open('greeting');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(within(dlg).getByTestId('greeting-save-status').textContent).toBe('Kaydedildi'));
    fireEvent.click(within(dlg).getByRole('checkbox', { name: /Otomatik tebrik gönderimi aktif/ }));
    await waitFor(() => expect(within(dlg).queryByTestId('greeting-save-status')).toBeNull());
  });
});

describe('Görev & Eskalasyon durum metni', () => {
  it('çalışan zamanlayıcıyla çelişen ya da kabul iddia eden metin yok', async () => {
    prime();
    const dlg = await open('escalation');
    const text = dlg.textContent ?? '';
    expect(text).toContain('Zamanlayıcı saatte bir çalışacak şekilde kuruludur ve aşağıdaki ayarları kullanır.');
    expect(text).toContain('Bu motor ayrı bir sistem ayarıyla açılır; kapalıyken bu ayarlar yalnız saklanır.');
    expect(text).not.toContain('sonraki sürümde');
    expect(text).not.toContain('PR-3b');
    expect(text).not.toContain('Motor şu an kapalı');
    expect(text).not.toMatch(/kabul edil/i);
  });
});
