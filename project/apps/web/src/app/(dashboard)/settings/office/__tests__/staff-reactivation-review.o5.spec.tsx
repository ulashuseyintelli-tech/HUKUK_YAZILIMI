import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * O-5 (owner 05.11.2026, C politikası) — Büro Ayarları > Personel: aynı kimlikle eklenmek istenen PASİF personel.
 * stable key: app/(dashboard)/settings/office/page.tsx#confirmStaffReactivation
 *
 * Sunucu yanıtları backend sözleşmesiyle birebir:
 *  - POST /staff → 409 { code: STAFF_REACTIVATION_REVIEW, staff: { izinler, linkedAccount, caseAssignmentCount, responsibleCaseCount } } (yazım yok)
 *  - POST /staff/:id/reactivate → 201 { data: { staff, linkedAccount, caseAssignmentCount, responsibleCaseCount } }
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

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' }, loading: false }),
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const OFFICE = { name: 'DENEME HUKUK', lawyers: [], bankAccounts: [] };
const STAFF = [{ id: 's1', firstName: 'Aktif', lastName: 'Kisi', staffType: 'SEKRETER', isDefaultForNewCases: false }];

function primeReads() {
  mocked.get.mockImplementation((url: string) => {
    const map: Record<string, unknown> = {
      '/office': { data: OFFICE },
      '/office/smtp-settings': { data: {} },
      '/office/sms-settings': { data: {} },
      '/office/greeting-settings': { data: {} },
      '/office/escalation-settings': { data: {} },
      '/staff': { data: { data: STAFF } },
    };
    return Promise.resolve(map[url] ?? { data: {} });
  });
}

/** Kartın pasifleştirilmeden önceki (GENİŞ) izinleri: etkisiz kutulardan ikisi de işaretli — korunmalı. */
const REVIEW = {
  status: 409,
  body: {
    statusCode: 409,
    code: 'STAFF_REACTIVATION_REVIEW',
    message: 'Bu TCKN veya e-posta ile pasif bir personel kaydı var. Kayıt yeniden etkinleştirilmedi ve hiçbir değişiklik yapılmadı; izinleri gözden geçirerek ayrıca yeniden etkinleştirin.',
    staff: {
      id: 's-pasif', firstName: 'Ayse', lastName: 'Pasif', staffType: 'MUHASEBE',
      canCreateCase: true, canEditCase: false, canGenerateDocuments: false, canApproveDocuments: true,
      canSeeFinance: true, canApproveFinance: false, canPrepareCollectionDisposition: true, canSendNotifications: false,
      isDefaultForNewCases: true,
      linkedAccount: { exists: true, isActive: false }, caseAssignmentCount: 2, responsibleCaseCount: 1,
    },
  },
};
const SUCCESS = {
  data: { data: { staff: { id: 's-pasif', isActive: true }, linkedAccount: { exists: true, isActive: false }, caseAssignmentCount: 2, responsibleCaseCount: 1 } },
};
const DIALOG = 'Pasif personel kaydı bulundu';
const CONFIRM = 'İzinleri onayla ve yeniden etkinleştir';

const drawer = () => screen.getByRole('dialog');

/** Yeni personel formunu doldurup kaydeder; 409 incelemesiyle açılan diyaloğu AYNI adımda bekler (act dışı güncelleme yok). */
async function submitNewStaff(): Promise<HTMLElement> {
  search = new URLSearchParams('section=staff');
  render(<OfficeSettingsPage />);
  await waitFor(() => expect(within(drawer()).getByRole('button', { name: /Ekle/ })).toBeTruthy());
  fireEvent.click(within(drawer()).getByRole('button', { name: /Ekle/ }));
  const kaydet = await screen.findByRole('button', { name: 'Kaydet' });
  const form = kaydet.closest('form') as HTMLFormElement;
  const [ad, soyad, , eposta] = within(form).getAllByRole('textbox') as HTMLInputElement[];
  fireEvent.change(ad, { target: { value: 'Ayse' } });
  fireEvent.change(soyad, { target: { value: 'Yeni' } });
  fireEvent.change(eposta, { target: { value: 'ayse@ornek.test' } });
  mocked.post.mockRejectedValueOnce(REVIEW);
  fireEvent.click(kaydet);
  return screen.findByRole('alertdialog', { name: DIALOG });
}

function box(scope: HTMLElement, labelText: string): HTMLInputElement {
  const label = Array.from(scope.querySelectorAll('label')).find((l) => (l.textContent ?? '').includes(labelText));
  expect(label, `etiket bulunamadı: ${labelText}`).toBeTruthy();
  return label!.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

let consoleErrors: unknown[][] = [];
let alerts: string[] = [];

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeReads();
  search = new URLSearchParams('');
  consoleErrors = [];
  alerts = [];
  vi.spyOn(window, 'alert').mockImplementation((m?: unknown) => { alerts.push(String(m)); });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { consoleErrors.push(args); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  const errs = consoleErrors;
  cleanup();
  vi.restoreAllMocks();
  // console.error / act uyarısı PASS SAYILMAZ (içerik görünür olsun diye metinle karşılaştırılır).
  expect(errs.map((e) => `${String(e[0]).slice(0, 120)} | ${String(e[1] ?? '')}`)).toEqual([]);
});

describe('O-5 pasif personel — gözden geçirerek yeniden etkinleştirme', () => {
  it('409 incelemesi: diyalog kartın MEVCUT izinleriyle açılır; etki ve kapalı hesap onaydan ÖNCE açıklanır', async () => {
    const dlg = await submitNewStaff();
    expect(mocked.post.mock.calls).toEqual([['/staff', expect.objectContaining({ email: 'ayse@ornek.test' })]]);
    expect(dlg.textContent).toContain('Yeni kayıt açılmadı ve hiçbir değişiklik yapılmadı');

    const etki = within(dlg).getByRole('list', { name: 'Yeniden etkinleştirmenin etkisi' }).textContent ?? '';
    expect(etki).toContain('Kartın 2 dosya ataması var; yeniden etkinleştirilirse bu atamalar yeniden etkili olur.');
    expect(etki).toContain('1 dosyada dosya sorumlusu');
    expect(etki).toContain('Bağlı giriş hesabı KAPALI');
    expect(etki).toContain('personel giriş yapamaz');
    expect(dlg.textContent).toContain('her yeni takibe otomatik atanır; bu, giriş hesabı kapalı olsa bile işler');

    // Düzenlenebilir: tür + iki etkili izin + otomatik atama; mevcut değerlerle dolu.
    expect((within(dlg).getByRole('combobox', { name: 'Personel türü' }) as HTMLSelectElement).value).toBe('MUHASEBE');
    expect(box(dlg, 'Muhasebe görebilir')).toMatchObject({ checked: true, disabled: false });
    expect(box(dlg, 'Tahsilat dağıtımı hazırlayabilir')).toMatchObject({ checked: true, disabled: false });
    expect(box(dlg, 'Yeni takiplerde otomatik seç')).toMatchObject({ checked: true, disabled: false });
    // Uygulanmayan alanlar pasif; kayıtlı değer görünür ve korunur.
    expect(box(dlg, 'Dosya oluşturabilir')).toMatchObject({ checked: true, disabled: true });
    expect(box(dlg, 'Belge onaylayabilir')).toMatchObject({ checked: true, disabled: true });
    expect(box(dlg, 'Tebligat gönderebilir')).toMatchObject({ checked: false, disabled: true });
  });

  it('Vazgeç hiçbir istek göndermez; personel formu açık kalır', async () => {
    const dlg = await submitNewStaff();
    fireEvent.click(box(dlg, 'Muhasebe görebilir'));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: DIALOG })).toBeNull());
    expect(mocked.post).toHaveBeenCalledTimes(1); // yalnız ilk POST /staff
    expect(mocked.put).not.toHaveBeenCalled();
    expect(mocked.delete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeTruthy();
  });

  it('onay: SEÇİLEN izinler tam gövdeyle ayrı uca gider; sonuç kapalı hesabı söyler, giriş erişimi açılmış izlenimi vermez', async () => {
    const dlg = await submitNewStaff();
    fireEvent.change(within(dlg).getByRole('combobox', { name: 'Personel türü' }), { target: { value: 'SEKRETER' } });
    fireEvent.click(box(dlg, 'Muhasebe görebilir'));
    fireEvent.click(box(dlg, 'Yeni takiplerde otomatik seç'));
    const staffReadsBefore = mocked.get.mock.calls.filter(([u]) => u === '/staff').length;
    mocked.post.mockResolvedValueOnce(SUCCESS);
    fireEvent.click(within(dlg).getByRole('button', { name: CONFIRM }));

    const status = await within(dlg).findByRole('status');
    expect(status.textContent).toBe('Personel yeniden etkinleştirildi. Bağlı giriş hesabı kapalı kaldı; giriş erişimi açılmadı.');
    expect(mocked.post).toHaveBeenCalledTimes(2);
    expect(mocked.post.mock.calls[1]).toEqual([
      '/staff/s-pasif/reactivate',
      {
        staffType: 'SEKRETER',
        canCreateCase: true, canEditCase: false, canGenerateDocuments: false, canApproveDocuments: true,
        canSeeFinance: false, canApproveFinance: false, canPrepareCollectionDisposition: true, canSendNotifications: false,
        isDefaultForNewCases: false,
      },
    ]);
    expect(mocked.get.mock.calls.filter(([u]) => u === '/staff').length).toBeGreaterThan(staffReadsBefore); // liste yenilendi
    expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull(); // yeni personel formu kapandı
    fireEvent.click(within(dlg).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: DIALOG })).toBeNull());
  });

  it('yarışı kaybeden istek: hata görünür, otomatik yeniden deneme YOK, diyalog açık kalır', async () => {
    const dlg = await submitNewStaff();
    mocked.post.mockRejectedValueOnce({ status: 409, body: { code: 'STAFF_REACTIVATION_CONFLICT', message: 'değişti' } });
    fireEvent.click(within(dlg).getByRole('button', { name: CONFIRM }));
    const alert = await within(dlg).findByRole('alert');
    expect(alert.textContent).toContain('yeniden etkinleştirme uygulanmadı');
    expect(mocked.post).toHaveBeenCalledTimes(2);
    expect((within(dlg).getByRole('button', { name: CONFIRM }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('yetkisiz aktör (403): hiçbir değişiklik yapılmadı mesajı', async () => {
    const dlg = await submitNewStaff();
    mocked.post.mockRejectedValueOnce({ status: 403, body: { message: 'OFFICE_F01_AUTHORIZATION_REQUIRED' } });
    fireEvent.click(within(dlg).getByRole('button', { name: CONFIRM }));
    expect((await within(dlg).findByRole('alert')).textContent).toBe('Bu işlem için büro yönetim yetkisi gerekir. Hiçbir değişiklik yapılmadı.');
  });

  it('inceleme gövdesi eksikse izin ekranı AÇILMAZ; yazım olmadığı söylenir', async () => {
    search = new URLSearchParams('section=staff');
    render(<OfficeSettingsPage />);
    await waitFor(() => expect(within(drawer()).getByRole('button', { name: /Ekle/ })).toBeTruthy());
    fireEvent.click(within(drawer()).getByRole('button', { name: /Ekle/ }));
    const kaydet = await screen.findByRole('button', { name: 'Kaydet' });
    const [ad, soyad] = within(kaydet.closest('form') as HTMLFormElement).getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(ad, { target: { value: 'Ayse' } });
    fireEvent.change(soyad, { target: { value: 'Yeni' } });
    mocked.post.mockRejectedValueOnce({ status: 409, body: { code: 'STAFF_REACTIVATION_REVIEW', staff: { id: 's-pasif' } } });
    fireEvent.click(kaydet);
    await waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0]).toContain('Hiçbir değişiklik yapılmadı');
    expect(screen.queryByRole('alertdialog', { name: DIALOG })).toBeNull();
    expect(mocked.post).toHaveBeenCalledTimes(1);
  });
});
