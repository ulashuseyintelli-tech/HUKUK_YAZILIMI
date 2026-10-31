import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * Kişi kartı modalı görünür alana sığar (owner kullanıcı kontrolü 2026-10-31).
 *
 * Kusur: personel modalında yükseklik sınırı yoktu; avukat modalında bütün panel kayıyordu. Başlık, kapatma ve alt
 * işlem düğmeleri görünür alanın dışında kalabiliyordu.
 *
 * jsdom yerleşim hesaplamaz. Gerçek yükseklik ölçümü tarayıcıda yapılır; bu spec yapı sözleşmesini ve davranışı sabitler:
 *  1. Panel görünür alanla sınırlı, kayan tek bölge form gövdesi.
 *  2. Başlık, kapatma, İptal ve Kaydet kayan gövdenin dışında; Kaydet aynı formu gönderir.
 *  3. Kapatma ve İptal kayıt yazmaz, modalı kapatır.
 *  4. Kaydet mevcut güncelleme yolundan gider, form değerleri korunur.
 * stable key: app/(dashboard)/settings/office/page.tsx#PersonModalFrame
 */

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

let search = new URLSearchParams('');
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const OFFICE = {
  name: 'ORNEK BURO',
  lawyers: [{ id: 'l1', name: 'ORNEK', surname: 'AVUKAT', lawyerRank: 'LAWYER', isDefaultForNewCases: false, sortOrder: 0 }],
  bankAccounts: [],
};
const STAFF = [{
  id: 's1', firstName: 'Ornek', lastName: 'Personel', staffType: 'MUHASEBE', isDefaultForNewCases: false,
  canCreateCase: true, canEditCase: false, canGenerateDocuments: false, canApproveDocuments: true,
  canSeeFinance: false, canApproveFinance: true, canPrepareCollectionDisposition: true,
}];

function primeReads() {
  mocked.get.mockImplementation((url: string) => {
    const map: Record<string, unknown> = {
      '/office': { data: OFFICE },
      '/lawyers/default-permissions/status': { data: [] },
      '/office/smtp-settings': { data: {} },
      '/office/sms-settings': { data: {} },
      '/office/greeting-settings': { data: {} },
      '/office/escalation-settings': { data: {} },
      '/staff': { data: { data: STAFF } },
    };
    return Promise.resolve(map[url] ?? { data: {} });
  });
}

const drawer = () => screen.getByRole('dialog');

async function openStaff() {
  search = new URLSearchParams('section=staff');
  render(<OfficeSettingsPage />);
  await waitFor(() => expect(within(drawer()).getByRole('button', { name: 'Düzenle' })).toBeTruthy());
  fireEvent.click(within(drawer()).getByRole('button', { name: 'Düzenle' }));
  await screen.findByText('Personel Düzenle');
}

async function openLawyer() {
  search = new URLSearchParams('section=lawyers');
  render(<OfficeSettingsPage />);
  await waitFor(() => expect(within(drawer()).getByTitle('Düzenle')).toBeTruthy());
  fireEvent.click(within(drawer()).getByTitle('Düzenle'));
  await screen.findByText('Avukat Düzenle');
}

function expectNoWrites() {
  expect(mocked.post).not.toHaveBeenCalled();
  expect(mocked.put).not.toHaveBeenCalled();
  expect(mocked.patch).not.toHaveBeenCalled();
  expect(mocked.delete).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const k of Object.keys(mocked)) mocked[k].mockReset();
  primeReads();
});
afterEach(() => cleanup());

describe.each([
  ['personel', openStaff, 'Personel Düzenle', '/staff/s1'],
  ['avukat', openLawyer, 'Avukat Düzenle', '/lawyers/l1'],
] as const)('kişi kartı modalı: %s', (_ad, open, title, putUrl) => {
  it('panel görünür alanla sınırlı; yalnız form gövdesi kayar', async () => {
    await open();
    const panel = screen.getByTestId('person-modal-panel');
    const body = screen.getByTestId('person-modal-body');
    expect(panel.className).toContain('max-h-full');
    expect(panel.className).toContain('flex-col');
    expect(panel.className).not.toContain('overflow-y-auto');
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('min-h-0');
    expect(panel.contains(body)).toBe(true);
  });

  it('başlık, kapatma, İptal ve Kaydet kayan gövdenin dışında; Kaydet aynı formu gönderir', async () => {
    await open();
    const body = screen.getByTestId('person-modal-body');
    const panel = screen.getByTestId('person-modal-panel');
    const kaydet = screen.getByRole('button', { name: 'Kaydet' });
    for (const el of [
      screen.getByText(title),
      within(panel).getByRole('button', { name: 'Kapat' }),
      within(panel).getByRole('button', { name: 'İptal' }),
      kaydet,
    ]) {
      expect(panel.contains(el)).toBe(true);
      expect(body.contains(el)).toBe(false);
    }
    const form = kaydet.closest('form') as HTMLFormElement;
    expect(form).toBeTruthy();
    expect(form.contains(body)).toBe(true);
    expect((kaydet as HTMLButtonElement).type).toBe('submit');
    expect((within(panel).getByRole('button', { name: 'İptal' }) as HTMLButtonElement).type).toBe('button');
    expect((within(panel).getByRole('button', { name: 'Kapat' }) as HTMLButtonElement).type).toBe('button');
  });

  it.each(['Kapat', 'İptal'])('%s kayıt yazmaz ve modalı kapatır', async (ad) => {
    await open();
    fireEvent.click(within(screen.getByTestId('person-modal-panel')).getByRole('button', { name: ad }));
    await waitFor(() => expect(screen.queryByTestId('person-modal-panel')).toBeNull());
    expectNoWrites();
  });

  it('Kaydet mevcut güncelleme yolundan bir kez gider', async () => {
    mocked.put.mockResolvedValue({ data: {} });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    expect(mocked.put.mock.calls[0][0]).toBe(putUrl);
    expect(mocked.post).not.toHaveBeenCalled();
  });
});

describe('kişi kartı modalı: form değerleri', () => {
  it('personel: kayıtlı izinler ve girilen değer aynen gönderilir', async () => {
    mocked.put.mockResolvedValue({ data: {} });
    await openStaff();
    const form = screen.getByRole('button', { name: 'Kaydet' }).closest('form') as HTMLFormElement;
    const ad = form.querySelector('input') as HTMLInputElement;
    expect(ad.value).toBe('Ornek');
    fireEvent.change(ad, { target: { value: 'Degisen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    expect(mocked.put.mock.calls[0][1]).toMatchObject({
      firstName: 'Degisen', lastName: 'Personel', staffType: 'MUHASEBE',
      canCreateCase: true, canEditCase: false, canApproveDocuments: true, canApproveFinance: true,
      canSeeFinance: false, canPrepareCollectionDisposition: true,
    });
  });

  it('avukat: girilen değer gönderilir, dokunulmayan alan gönderilmez (mevcut fark davranışı)', async () => {
    mocked.put.mockResolvedValue({ data: {} });
    await openLawyer();
    const form = screen.getByRole('button', { name: 'Kaydet' }).closest('form') as HTMLFormElement;
    const ad = form.querySelector('input') as HTMLInputElement;
    expect(ad.value).toBe('ORNEK');
    fireEvent.change(ad, { target: { value: 'DEGISEN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    expect(mocked.put.mock.calls[0][1]).toMatchObject({ name: 'DEGISEN' });
    expect(mocked.put.mock.calls[0][1]).not.toHaveProperty('surname');
  });
});
