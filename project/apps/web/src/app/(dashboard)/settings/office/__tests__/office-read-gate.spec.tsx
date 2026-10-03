import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within, act } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';
import { buildApiHttpError } from '@/lib/api-error';

/**
 * OFFICE-READ-GATE (OFF-INV-09 deny ≠ empty) — Büro Ayarları: okuma sonucu ile yazma yüzeyi.
 * stable key: app/(dashboard)/settings/office/page.tsx#readState
 *
 * Sözleşme (owner talimatı 2026-10-02):
 *  - 403 → ilgili bölümde "Bu bilgiyi görüntüleme yetkiniz yok." (boş kayıt gibi DEĞİL); ham sunucu kodu görünmez.
 *  - İlk okuma sürerken ya da başarısızken ilgili Ekle / Düzenle / Kaydet KAPALI; o okumadan sonra yazma isteği ÇIKMAZ.
 *  - Başarılı boş sonuç ayrı bir durumdur ("Hesap yok" gerçek bir boş sonuçtur, yazma açık kalır).
 *  - Geçici hata ≠ yetki reddi: yalnız geçici hatada "Tekrar dene".
 *  - Bağımsız bölümler birbirini kapatmaz (SMTP düşünce banka açık kalır).
 *  - Geç gelen yenileme yanıtı kullanıcının kaydedilmemiş düzenlemesini EZMEZ.
 * Kanıt sınıfı: TEST (jsdom + sahte api). Gerçek tarayıcı/API kanıtı DEĞİLDİR.
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

const RAW_CODE = 'OFFICE_F01_AUTHORIZATION_REQUIRED';
const DENIED_TEXT = 'Bu bilgiyi görüntüleme yetkiniz yok.';
const FORBIDDEN = () => buildApiHttpError({ statusCode: 403, message: RAW_CODE }, 403);
const TRANSIENT = () => new TypeError('Failed to fetch');

const OFFICE = {
  name: 'TELLI HUKUK', barAssociation: 'ANKARA', email: 'b@x.test', phone: '0312', city: 'Ankara', district: 'Çankaya', address: 'A',
  lawyers: [
    { id: 'l1', name: 'ULAS', surname: 'TELLI', lawyerRank: 'PARTNER', isDefaultForNewCases: false, sortOrder: 0 },
    { id: 'l2', name: 'FATMA', surname: 'ULUCA', lawyerRank: 'LAWYER', isDefaultForNewCases: true, sortOrder: 1 },
  ],
  bankAccounts: [
    { id: 'b1', bankName: 'ZIRAAT', iban: 'TR000000000000000000000001', isDefault: true },
    { id: 'b2', bankName: 'IS', iban: 'TR000000000000000000000002', isDefault: false },
  ],
};
const EMPTY_OFFICE = { name: '', lawyers: [], bankAccounts: [] };
const STAFF = [{ id: 's1', firstName: 'AYSE', lastName: 'MUHASEBE', staffType: 'MUHASEBE', isActive: true, isDefaultForNewCases: false }];
const SMTP = { smtpHost: 'smtp.sunucu.test', smtpPort: 465, smtpUser: 'kullanici@sunucu.test', smtpFromName: 'Büro', smtpFromEmail: 'gonder@sunucu.test', smtpSecure: true };
const SMS = { smsProvider: 'NETGSM', smsSender: 'TELLI' };
const ESC = { opReminderDays: 3, opFounderDays: 6, opRepeatMonths: 3, opEmailEnabled: true, opSmsEnabled: false, opStaffTypes: ['SEKRETER'], caseTaskOwnerDays: 2, caseTaskTeamLeadDays: 2, caseTaskManagerDays: 3 };

type Reply = unknown | Error | (() => unknown | Error);
const OFFICE_URLS = ['/office', '/office/smtp-settings', '/office/sms-settings', '/office/greeting-settings', '/office/escalation-settings'] as const;

/** Her GET URL'i açıkça kurulur; `Error` reject eder, fonksiyon her çağrıda yeniden değerlendirilir. */
function prime(over: Partial<Record<(typeof OFFICE_URLS)[number] | '/staff', Reply>> = {}) {
  const base: Record<string, Reply> = {
    '/office': OFFICE,
    '/office/smtp-settings': SMTP,
    '/office/sms-settings': SMS,
    '/office/greeting-settings': {},
    '/office/escalation-settings': ESC,
    '/staff': { data: STAFF },
    '/greetings/today': {},
    '/lawyers/default-permissions/status': {},
    ...over,
  };
  mocked.get.mockImplementation((url: string) => {
    const hit = url in base ? base[url] : {};
    const value = typeof hit === 'function' ? (hit as () => unknown)() : hit;
    if (value instanceof Error) return Promise.reject(value);
    return Promise.resolve({ data: value });
  });
  mocked.put.mockResolvedValue({ data: {} });
  mocked.post.mockResolvedValue({ data: {} });
  mocked.delete.mockResolvedValue({ data: {} });
}
const allDenied = () => Object.fromEntries(OFFICE_URLS.map((u) => [u, FORBIDDEN])) as Partial<Record<(typeof OFFICE_URLS)[number], Reply>>;

const body = () => document.body.textContent ?? '';
const writes = () => mocked.put.mock.calls.length + mocked.post.mock.calls.length + mocked.delete.mock.calls.length + mocked.patch.mock.calls.length;
async function settle() { await act(async () => { await new Promise((r) => setTimeout(r, 30)); }); }
async function open(section: string | null = null) {
  search = new URLSearchParams(section ? `section=${section}` : '');
  const r = render(<OfficeSettingsPage />);
  await waitFor(() => { if (!screen.queryByRole('heading', { name: 'Büro Ayarları' })) throw new Error('yükleniyor'); }, { timeout: 3000 });
  await settle();
  return r;
}
/** Dashboard özet kartının başlığından kartın kendisini bulur. */
function card(title: string): HTMLElement {
  const el = screen.getAllByText(title).map((n) => n.closest('div.bg-white, button.bg-white')).find(Boolean) as HTMLElement | undefined;
  if (!el) throw new Error(`kart yok: ${title}`);
  return el;
}

let consoleErrors: unknown[][] = [];
beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  consoleErrors = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { consoleErrors.push(a); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('403 → "boş kayıt" DEĞİL: yetki reddi durumu', () => {
  it('pano: her F01 bölümü "yetkiniz yok" der; boş kayıt metni, ham kod, sahte varsayılan YOK; Personel bağımsız; yazma yok', async () => {
    prime(allDenied());
    await open();
    expect(screen.getAllByText(DENIED_TEXT)).toHaveLength(6); // büro, banka, avukatlar, SMTP, SMS, eskalasyon
    expect(body()).not.toContain(RAW_CODE);
    for (const sahte of ['Hesap yok', 'Avukat yok', 'Profil tamamlığı', 'Eksik', 'Seçilmedi', 'İlk hatırlatma', 'E-posta + SMS']) {
      expect(body()).not.toContain(sahte);
    }
    expect(screen.queryByRole('button', { name: 'Tekrar dene' })).toBeNull(); // yetki reddi tekrar denemeyle düzelmez
    // Personel kartı (GET /staff ayrı okuma) dolu ve çalışır
    expect(body()).toContain('AYSE');
    const ekle = screen.getAllByRole('button', { name: /Ekle/ }) as HTMLButtonElement[];
    expect(ekle).toHaveLength(3); // banka, avukat, personel
    expect(ekle[0].disabled).toBe(true);
    expect(ekle[1].disabled).toBe(true);
    expect(ekle[2].disabled).toBe(false);
    expect(writes()).toBe(0);
  });

  it('bağımsız okumalar BİRBİRİNİ beklemez: /office 403 olsa da smtp / sms / tebrik / eskalasyon / personel okunur', async () => {
    prime(allDenied());
    await open();
    const urls = mocked.get.mock.calls.map((c) => String(c[0]));
    for (const u of ['/office', '/office/smtp-settings', '/office/sms-settings', '/office/greeting-settings', '/office/escalation-settings', '/staff']) {
      expect(urls).toContain(u);
    }
  });

  it('dolu bölüm kapanmaz: yalnız /office/smtp-settings 403 → SMTP kapalı; banka, avukat, SMS, eskalasyon dolu ve açık', async () => {
    prime({ '/office/smtp-settings': FORBIDDEN });
    await open();
    expect(screen.getAllByText(DENIED_TEXT)).toHaveLength(1);
    expect(body()).toContain('ZIRAAT');
    expect(body()).toContain('NETGSM');
    expect(body()).toContain('ULAS');
    expect(body()).toContain('3 gün');
    expect((screen.getAllByRole('button', { name: /Ekle/ })[0] as HTMLButtonElement).disabled).toBe(false);
  });

  for (const section of ['office', 'bank', 'lawyers', 'smtp', 'sms', 'greeting', 'escalation']) {
    it(`derin bağlantı ?section=${section}: çekmece "yetkiniz yok" der; form, Ekle, Kaydet yok; yazma isteği çıkmaz`, async () => {
      prime(allDenied());
      await open(section);
      const dlg = screen.getByRole('dialog');
      expect(within(dlg).getByText(DENIED_TEXT)).toBeTruthy();
      expect(within(dlg).queryByRole('button', { name: /Kaydet|Ekle|Test et/ })).toBeNull();
      expect(dlg.querySelectorAll('input, select, textarea')).toHaveLength(0);
      expect(dlg.textContent).not.toContain(RAW_CODE);
      expect(writes()).toBe(0);
    });
  }
});

describe('geçici hata ≠ yetki reddi: Tekrar dene', () => {
  it('geçici hata: "okunamadı" + Tekrar dene (yetki metni DEĞİL); yenileme başarılı olunca bölüm dolar ve yazma açılır', async () => {
    let smtpReply: Reply = TRANSIENT();
    prime({ '/office/smtp-settings': () => smtpReply as never });
    await open();
    expect(screen.queryByText(DENIED_TEXT)).toBeNull();
    const err = screen.getByTestId('read-error');
    expect(err.textContent).toContain('okunamadı');
    expect(body()).not.toContain('Tanımlı');
    expect(body()).not.toContain('Eksik'); // "tanımsız" iddiası yok

    smtpReply = SMTP;
    await act(async () => { fireEvent.click(within(err).getByRole('button', { name: 'Tekrar dene' })); await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.queryByTestId('read-error')).toBeNull();
    expect(body()).toContain('smtp.sunucu.test');
    expect(body()).toContain('Tanımlı');
  });

  it('yenileme sürerken bölüm "Yükleniyor…": Kaydet yok, yazma yok; yanıt gelince açılır', async () => {
    let release: (v: unknown) => void = () => {};
    let smtpCalls = 0;
    prime();
    // smtp-settings: 1. çağrı geçici hata, 2. çağrı (Tekrar dene) ertelenmiş söz — yanıt, test serbest bırakınca gelir.
    const base = mocked.get.getMockImplementation() as (url: string) => Promise<unknown>;
    mocked.get.mockImplementation((url: string) => {
      if (url !== '/office/smtp-settings') return base(url);
      smtpCalls += 1;
      if (smtpCalls === 1) return Promise.reject(TRANSIENT());
      return new Promise((res) => { release = (v) => res({ data: v }); });
    });
    await open('smtp');
    const dlg = screen.getByRole('dialog');
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: 'Tekrar dene' })); await new Promise((r) => setTimeout(r, 10)); });
    expect(within(screen.getByRole('dialog')).getByTestId('read-loading')).toBeTruthy();
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Kaydet/ })).toBeNull();
    expect(writes()).toBe(0);
    await act(async () => { release(SMTP); await new Promise((r) => setTimeout(r, 10)); });
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Kaydet/ })).toBeTruthy();
  });

  it('ESKİ KUSUR: /office geçici hata + SMTP çekmecesi → artık boş ön-değerle PUT ÇIKMAZ (SMTP kendi okumasıyla dolu gelir)', async () => {
    prime({ '/office': TRANSIENT });
    await open('smtp');
    const dlg = screen.getByRole('dialog');
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: /Kaydet/ })); await new Promise((r) => setTimeout(r, 30)); });
    const smtpPuts = mocked.put.mock.calls.filter((c) => c[0] === '/office/smtp-settings');
    expect(smtpPuts).toHaveLength(1);
    expect((smtpPuts[0][1] as Record<string, unknown>).smtpHost).toBe('smtp.sunucu.test'); // "" DEĞİL
    expect((smtpPuts[0][1] as Record<string, unknown>).smtpUser).toBe('kullanici@sunucu.test');
  });

  it('SMTP okuması düşünce SMTP çekmecesinde Kaydet YOK → boş alan "mevcut ayarı sil" olarak gönderilemez', async () => {
    prime({ '/office/smtp-settings': TRANSIENT });
    await open('smtp');
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).queryByRole('button', { name: /Kaydet/ })).toBeNull();
    expect(within(dlg).getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
    expect(mocked.put.mock.calls.filter((c) => String(c[0]).includes('smtp'))).toHaveLength(0);
  });

  it('/office geçici hata: büro / banka / avukat kapalı + Tekrar dene; SMTP, SMS, personel açık', async () => {
    prime({ '/office': TRANSIENT });
    await open();
    expect(screen.queryByText(DENIED_TEXT)).toBeNull();
    expect(screen.getAllByTestId('read-error').length).toBeGreaterThanOrEqual(3);
    expect(body()).toContain('smtp.sunucu.test');
    expect(body()).toContain('AYSE');
    expect(body()).not.toContain('Hesap yok');
    expect(body()).not.toContain('Avukat yok');
  });
});

describe('başarılı boş sonuç ≠ yetki reddi; dolu sonuç; yetkili normal kaydetme', () => {
  it('başarılı BOŞ sonuç: "Hesap yok / Avukat yok" gerçek boş durum; yazma AÇIK; yetki / hata metni YOK', async () => {
    prime({ '/office': EMPTY_OFFICE, '/office/smtp-settings': {}, '/office/sms-settings': {}, '/office/escalation-settings': {}, '/staff': { data: [] } });
    await open();
    expect(body()).toContain('Hesap yok');
    expect(body()).toContain('Avukat yok');
    expect(body()).toContain('Personel yok');
    expect(screen.queryByText(DENIED_TEXT)).toBeNull();
    expect(screen.queryByTestId('read-error')).toBeNull();
    for (const b of screen.getAllByRole('button', { name: /Ekle/ }) as HTMLButtonElement[]) expect(b.disabled).toBe(false);
  });

  it('DOLU sonuç: değerler görünür, yetki / hata metni yok', async () => {
    prime();
    await open();
    expect(body()).toContain('TELLI HUKUK');
    expect(body()).toContain('ZIRAAT');
    expect(body()).toContain('smtp.sunucu.test');
    expect(body()).toContain('NETGSM');
    expect(body()).toContain('FATMA');
    expect(screen.queryByText(DENIED_TEXT)).toBeNull();
    expect(screen.queryByTestId('read-error')).toBeNull();
    expect(screen.queryByTestId('blocked-card')).toBeNull();
  });

  it('yetkili NORMAL KAYDETME çalışır: SMTP, büro ve banka hesabı isteği çıkar', async () => {
    prime();
    await open('smtp');
    let dlg = screen.getByRole('dialog');
    const host = within(dlg).getByDisplayValue('smtp.sunucu.test');
    fireEvent.change(host, { target: { value: 'yeni.sunucu.test' } });
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: /Kaydet/ })); await new Promise((r) => setTimeout(r, 30)); });
    const smtpPut = mocked.put.mock.calls.find((c) => c[0] === '/office/smtp-settings');
    expect(smtpPut).toBeTruthy();
    expect((smtpPut![1] as Record<string, unknown>).smtpHost).toBe('yeni.sunucu.test');
    cleanup();

    mocked.put.mockClear();
    await open('office');
    dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByDisplayValue('TELLI HUKUK'), { target: { value: 'YENİ AD' } });
    await settle();
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: /Kaydet/ })); await new Promise((r) => setTimeout(r, 30)); });
    const officePut = mocked.put.mock.calls.find((c) => c[0] === '/office');
    expect(officePut).toBeTruthy();
    expect((officePut![1] as Record<string, unknown>).name).toBe('YENİ AD');
  });

  it('yetkili banka hesabı ekleme: pencere açılır ve POST /office/bank-accounts çıkar', async () => {
    prime();
    await open();
    fireEvent.click(screen.getAllByRole('button', { name: /Ekle/ })[0]);
    await settle();
    const modal = screen.getByText('Yeni Hesap').closest('div.bg-white') as HTMLElement;
    const inputs = modal.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'YENİ BANKA' } });
    fireEvent.change(inputs[2], { target: { value: 'TR330006100519786457841326' } });
    await act(async () => { fireEvent.submit(modal.querySelector('form') as HTMLFormElement); await new Promise((r) => setTimeout(r, 50)); });
    expect(mocked.post.mock.calls.map((c) => c[0])).toContain('/office/bank-accounts');
  });
});

describe('geç gelen yanıt kullanıcının düzenlemesini ezmez', () => {
  it('büro formu kirliyken banka kaydı sonrası /office yenilemesi gelir → yazılan ad KORUNUR', async () => {
    prime();
    await open('office');
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByDisplayValue('TELLI HUKUK'), { target: { value: 'YAZDIĞIM AD' } });
    await settle();
    // Çekmecenin arkasındaki panodan banka hesabı ekle → mutation sonrası GET /office yenilemesi tetiklenir
    const ekle = screen.getAllByRole('button', { name: /Ekle/ }).find((b) => !dlg.contains(b)) as HTMLElement;
    fireEvent.click(ekle);
    await settle();
    const modal = screen.getByText('Yeni Hesap').closest('div.bg-white') as HTMLElement;
    const inputs = modal.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'B' } });
    fireEvent.change(inputs[2], { target: { value: 'TR330006100519786457841326' } });
    const officeGetsBefore = mocked.get.mock.calls.filter((c) => c[0] === '/office').length;
    await act(async () => { fireEvent.submit(modal.querySelector('form') as HTMLFormElement); await new Promise((r) => setTimeout(r, 60)); });
    expect(mocked.get.mock.calls.filter((c) => c[0] === '/office').length).toBeGreaterThan(officeGetsBefore); // yenileme gerçekten geldi
    expect(within(screen.getByRole('dialog')).getByDisplayValue('YAZDIĞIM AD')).toBeTruthy();
    expect(within(screen.getByRole('dialog')).queryByDisplayValue('TELLI HUKUK')).toBeNull();
  });

  it('mutation sonrası yenileme SMTP formunu yeniden doldurmaz (ayrı okuma): smtp-settings tekrar okunmaz', async () => {
    prime();
    await open();
    const smtpGetsBefore = mocked.get.mock.calls.filter((c) => c[0] === '/office/smtp-settings').length;
    fireEvent.click(screen.getAllByRole('button', { name: /Ekle/ })[0]);
    await settle();
    const modal = screen.getByText('Yeni Hesap').closest('div.bg-white') as HTMLElement;
    const inputs = modal.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'B' } });
    fireEvent.change(inputs[2], { target: { value: 'TR330006100519786457841326' } });
    await act(async () => { fireEvent.submit(modal.querySelector('form') as HTMLFormElement); await new Promise((r) => setTimeout(r, 60)); });
    expect(mocked.get.mock.calls.filter((c) => c[0] === '/office/smtp-settings')).toHaveLength(smtpGetsBefore);
  });
});
