import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';
import { StaffAccountReopenDialog } from '@/components/settings/staff-account-reopen-dialog';
import { StaffAccountReopenCard } from '@/components/settings/staff-account-reopen-card';

/**
 * O-5b (owner 05.11.2026, A politikası) — Büro Ayarları > Personel: yeniden etkinleştirilmiş personelin KAPALI giriş hesabını açma.
 * stable key: components/settings/staff-account-reopen-dialog.tsx#StaffAccountReopenDialog
 *
 * Sunucu yanıtları backend sözleşmesiyle birebir:
 *  - GET /staff/:id/account-reopen-review → { data: { staffId, reopenable, reason, account, allowGrants, denyKeys, reviewFingerprint } }
 *  - POST /staff/:id/account-reopen { reviewFingerprint, keepGrantIds } → 201 { data: { account, keptGrantCount, expiredGrantCount, … } }
 *  - 409 STAFF_ACCOUNT_REVIEW_STALE (yazım yok) → yeniden inceleme.
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

let role = 'ADMIN';
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role }, loading: false }),
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const FP = 'c'.repeat(64);
const REVIEW_OK = {
  staffId: 's1', reopenable: true, reason: null,
  account: { role: 'USER', isActive: false, hasPassword: true },
  allowGrants: [
    { id: 'g-gorev', permissionKey: 'office.tasks.view_all', validFrom: '2026-10-01T00:00:00.000Z', validUntil: null, startsInFuture: false },
    { id: 'g-masraf', permissionKey: 'office.expenses.view_all', validFrom: '2026-10-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z', startsInFuture: false },
    { id: 'g-ileri', permissionKey: 'office.tasks.view_all', validFrom: '2099-01-01T00:00:00.000Z', validUntil: null, startsInFuture: true },
  ],
  denyKeys: ['office.expenses.view_all'],
  reviewFingerprint: FP,
};
const REOPEN_OK = { data: { data: { staffId: 's1', account: { isActive: true, role: 'USER' }, keptGrantCount: 1, expiredGrantCount: 2, revokedResetTokenCount: 1, sessionsInvalidated: true } } };
const TITLE = 'Giriş erişimini gözden geçir';

function primeReview(review: unknown = REVIEW_OK) {
  mocked.get.mockImplementation((url: string) =>
    Promise.resolve(url.endsWith('/account-reopen-review') ? { data: { data: review } } : { data: {} }),
  );
}

let consoleErrors: unknown[][] = [];

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  role = 'ADMIN';
  search = new URLSearchParams('');
  consoleErrors = [];
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { consoleErrors.push(args); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  const errs = consoleErrors;
  cleanup();
  vi.restoreAllMocks();
  // console.error / act uyarısı PASS SAYILMAZ.
  expect(errs.map((e) => `${String(e[0]).slice(0, 120)} | ${String(e[1] ?? '')}`)).toEqual([]);
});

const openDialog = async (onClose = vi.fn(), onDone = vi.fn()) => {
  render(<StaffAccountReopenDialog staffId="s1" staffName="Ayse Pasif" onClose={onClose} onDone={onDone} />);
  const dlg = await screen.findByRole('alertdialog', { name: TITLE });
  return { dlg, onClose, onDone };
};
const keepBox = (dlg: HTMLElement, label: RegExp) => within(dlg).getAllByRole('checkbox', { name: label }) as HTMLInputElement[];

describe('O-5b hesap açma onay diyaloğu', () => {
  it('onaydan ÖNCE: rol, parola ve oturum etkisi, sıfırlama iptali, DENY korunur; ALLOW izinleri varsayılan İŞARETSİZ, ileri tarihli belirtilir', async () => {
    primeReview();
    const { dlg } = await openDialog();
    const etki = (await within(dlg).findByRole('list', { name: 'Hesap açmanın etkisi' })).textContent ?? '';
    expect(etki).toContain('mevcut parolasıyla giriş yapabilir. Parola değiştirilmez.');
    expect(etki).toContain('bütün oturumlar geçersiz olur');
    expect(etki).toContain('Açık parola sıfırlama bağlantıları iptal edilir.');
    expect(etki).toContain('Rol değişmez: Kullanıcı (USER).');
    expect(etki).toContain('İşaretlemediğiniz büro geneli görünüm izinleri sona erer');
    expect(etki).toContain('Açık ret (DENY) kayıtları değişmez: Masraflar — büro geneli görünüm.');
    expect(mocked.get).toHaveBeenCalledWith('/staff/s1/account-reopen-review');
    const boxes = within(dlg).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => !b.checked)).toBe(true);
    expect(dlg.textContent).toContain('İleri tarihli:');
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it('Vazgeç hiçbir yazım isteği göndermez', async () => {
    primeReview();
    const { dlg, onClose } = await openDialog();
    await within(dlg).findByRole('list', { name: 'Hesap açmanın etkisi' });
    fireEvent.click(keepBox(dlg, /Masraflar/)[0]);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Vazgeç' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocked.post).not.toHaveBeenCalled();
    expect(mocked.put).not.toHaveBeenCalled();
    expect(mocked.delete).not.toHaveBeenCalled();
  });

  it('onay: incelemenin parmak izi + YALNIZ işaretlenen izin gönderilir; sonuç gerçek durumu söyler', async () => {
    primeReview();
    const { dlg, onDone } = await openDialog();
    await within(dlg).findByRole('list', { name: 'Hesap açmanın etkisi' });
    fireEvent.click(keepBox(dlg, /Masraflar/)[0]);
    mocked.post.mockResolvedValueOnce(REOPEN_OK);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Giriş hesabını aç' }));
    const status = await within(dlg).findByRole('status');
    expect(status.textContent).toBe('Giriş hesabı açıldı. Eski oturumlar geçersiz; personel yeniden giriş yapmalı. 1 büro geneli izin korundu, 2 izin sona erdi. Rol ve parola değişmedi.');
    expect(mocked.post.mock.calls).toEqual([['/staff/s1/account-reopen', { reviewFingerprint: FP, keepGrantIds: ['g-masraf'] }]]);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(within(dlg).queryByRole('button', { name: 'Giriş hesabını aç' })).toBeNull();
    expect(within(dlg).getByRole('button', { name: 'Kapat' })).toBeTruthy();
  });

  it('bayat inceleme (409): hiçbir şey yazılmadığı söylenir; onay düğmesi kalkar; "İncelemeyi yenile" yeniden okur ve seçimi sıfırlar', async () => {
    primeReview();
    const { dlg } = await openDialog();
    await within(dlg).findByRole('list', { name: 'Hesap açmanın etkisi' });
    fireEvent.click(keepBox(dlg, /Görevler/)[0]);
    mocked.post.mockRejectedValueOnce({ status: 409, body: { code: 'STAFF_ACCOUNT_REVIEW_STALE' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Giriş hesabını aç' }));
    const alert = await within(dlg).findByRole('alert');
    expect(alert.textContent).toContain('siz incelerken değişti; hiçbir şey yazılmadı');
    expect(within(dlg).queryByRole('button', { name: 'Giriş hesabını aç' })).toBeNull();
    fireEvent.click(within(dlg).getByRole('button', { name: 'İncelemeyi yenile' }));
    await waitFor(() => expect(mocked.get.mock.calls.filter(([u]) => u === '/staff/s1/account-reopen-review')).toHaveLength(2));
    await within(dlg).findByRole('button', { name: 'Giriş hesabını aç' });
    expect((within(dlg).getAllByRole('checkbox') as HTMLInputElement[]).every((b) => !b.checked)).toBe(true);
    expect(mocked.post).toHaveBeenCalledTimes(1); // otomatik yeniden deneme yok
  });

  it('açılamayan inceleme (hesap zaten açık): neden söylenir, onay düğmesi yok', async () => {
    primeReview({ ...REVIEW_OK, reopenable: false, reason: 'ACCOUNT_ALREADY_ACTIVE', account: { role: 'USER', isActive: true, hasPassword: true }, reviewFingerprint: null });
    const { dlg } = await openDialog();
    expect(await within(dlg).findByText(/zaten açık; bu işlem bir şey değiştirmez/)).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: 'Giriş hesabını aç' })).toBeNull();
  });

  it('ADMIN olmayan F01 aktörü (403): yetki mesajı; yazım yok', async () => {
    mocked.get.mockRejectedValue({ status: 403, body: { code: 'STAFF_ACCOUNT_REOPEN_ADMIN_REQUIRED' } });
    const { dlg } = await openDialog();
    const alert = await within(dlg).findByRole('alert');
    expect(alert.textContent).toBe('Bu işlem için güncel ADMIN yetkisi gerekir. Hiçbir değişiklik yapılmadı.');
    expect(mocked.post).not.toHaveBeenCalled();
  });
});

describe('O-5b kişi kartı bloğu', () => {
  it('ADMIN + bağlı hesap + açılabilir inceleme → "Giriş hesabı kapalı" ve gözden geçirme düğmesi', async () => {
    primeReview();
    render(<StaffAccountReopenCard staffId="s1" personUserId="u-hedef" staffName="Ayse Pasif" formDirty={false} />);
    expect(await screen.findByTestId('staff-account-reopen-card')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: TITLE }));
    expect(await screen.findByRole('alertdialog', { name: TITLE })).toBeTruthy();
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it('kaydedilmemiş form: düğme kapalı', async () => {
    primeReview();
    render(<StaffAccountReopenCard staffId="s1" personUserId="u-hedef" staffName="Ayse Pasif" formDirty />);
    await screen.findByTestId('staff-account-reopen-card');
    expect((screen.getByRole('button', { name: TITLE }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('açılamaz inceleme, bağlı hesap yok ya da ADMIN değil → blok görünmez', async () => {
    primeReview({ ...REVIEW_OK, reopenable: false, reason: 'ACCOUNT_ALREADY_ACTIVE', reviewFingerprint: null });
    const { unmount } = render(<StaffAccountReopenCard staffId="s1" personUserId="u-hedef" staffName="X" formDirty={false} />);
    await waitFor(() => expect(mocked.get).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('staff-account-reopen-card')).toBeNull();
    unmount();

    mocked.get.mockClear();
    render(<StaffAccountReopenCard staffId="s1" personUserId={null} staffName="X" formDirty={false} />);
    expect(mocked.get).not.toHaveBeenCalled();
    cleanup();

    role = 'USER';
    render(<StaffAccountReopenCard staffId="s1" personUserId="u-hedef" staffName="X" formDirty={false} />);
    expect(mocked.get).not.toHaveBeenCalled();
    expect(screen.queryByTestId('staff-account-reopen-card')).toBeNull();
  });
});

describe('O-5 sonucundan O-5b incelemesine geçiş (sayfa)', () => {
  const O5_REVIEW = {
    status: 409,
    body: {
      statusCode: 409, code: 'STAFF_REACTIVATION_REVIEW', message: 'inceleme',
      staff: {
        id: 's1', firstName: 'Ayse', lastName: 'Pasif', staffType: 'MUHASEBE',
        canCreateCase: false, canEditCase: false, canGenerateDocuments: false, canApproveDocuments: false,
        canSeeFinance: false, canApproveFinance: false, canPrepareCollectionDisposition: false, canSendNotifications: false,
        isDefaultForNewCases: false, linkedAccount: { exists: true, isActive: false }, caseAssignmentCount: 0, responsibleCaseCount: 0,
      },
    },
  };
  const O5_OK = { data: { data: { staff: { id: 's1', isActive: true }, linkedAccount: { exists: true, isActive: false }, caseAssignmentCount: 0, responsibleCaseCount: 0 } } };

  it('yeniden etkinleştirme sonrası hesap kapalı → ADMIN "Giriş erişimini gözden geçir" ile hesap açma diyaloğuna geçer; geçiş yazım yapmaz', async () => {
    mocked.get.mockImplementation((url: string) => {
      if (url.endsWith('/account-reopen-review')) return Promise.resolve({ data: { data: REVIEW_OK } });
      const map: Record<string, unknown> = { '/office': { data: { name: 'DENEME', lawyers: [], bankAccounts: [] } }, '/staff': { data: { data: [] } } };
      return Promise.resolve(map[url] ?? { data: {} });
    });
    search = new URLSearchParams('section=staff');
    render(<OfficeSettingsPage />);
    const drawer = () => screen.getByRole('dialog');
    await waitFor(() => expect(within(drawer()).getByRole('button', { name: /Ekle/ })).toBeTruthy());
    fireEvent.click(within(drawer()).getByRole('button', { name: /Ekle/ }));
    const kaydet = await screen.findByRole('button', { name: 'Kaydet' });
    const form = kaydet.closest('form') as HTMLFormElement;
    const [ad, soyad, , eposta] = within(form).getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(ad, { target: { value: 'Ayse' } });
    fireEvent.change(soyad, { target: { value: 'Pasif' } });
    fireEvent.change(eposta, { target: { value: 'ayse@ornek.test' } });
    mocked.post.mockRejectedValueOnce(O5_REVIEW);
    fireEvent.click(kaydet);
    const o5 = await screen.findByRole('alertdialog', { name: 'Pasif personel kaydı bulundu' });
    mocked.post.mockResolvedValueOnce(O5_OK);
    fireEvent.click(within(o5).getByRole('button', { name: 'İzinleri onayla ve yeniden etkinleştir' }));
    const gecis = await within(o5).findByRole('button', { name: TITLE });
    fireEvent.click(gecis);
    const dlg = await screen.findByRole('alertdialog', { name: TITLE });
    await within(dlg).findByRole('list', { name: 'Hesap açmanın etkisi' });
    expect(screen.queryByRole('alertdialog', { name: 'Pasif personel kaydı bulundu' })).toBeNull();
    expect(mocked.post.mock.calls.map(([u]) => u)).toEqual(['/staff', '/staff/s1/reactivate']); // geçiş yazmaz
    fireEvent.click(within(dlg).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: TITLE })).toBeNull());
    expect(mocked.post).toHaveBeenCalledTimes(2);
  });
});
