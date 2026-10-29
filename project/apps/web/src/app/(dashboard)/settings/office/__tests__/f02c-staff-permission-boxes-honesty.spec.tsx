import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * F02-C / OFP-10 (owner F02 uygulama talimatı 2026-10-29; STF-PRD-RBAC-001, OFF-INV-03) — personel kartı izin
 * kutularının dürüstlüğü.
 *
 * Ölçüm (apps/api/src, 2026-10-29): StaffMember izin bayraklarından yalnız `canSeeFinance` (claim-item yazma kapısı) ve
 * `canPrepareCollectionDisposition` (FD hazırlık yeterliliği) karar noktasında okunur; `canCreateCase`, `canEditCase`,
 * `canGenerateDocuments`, `canApproveDocuments`, `canApproveFinance` yalnız kaydedilip projeksiyonla geri okunur.
 *
 * Kanıtlanan sözleşme:
 *  1. Etkisiz beş kutu PASİF (disabled) ve "şu an uygulanmıyor" etiketli; etkili iki kutu işaretlenebilir.
 *  2. Kayıtlı değer korunur ve kaydetmede AYNEN gönderilir (veri kaybı yok; sessiz sıfırlama yok).
 *  3. Yeni personelde etkisiz kutular pasif ve işaretsiz.
 * stable key: app/(dashboard)/settings/office/page.tsx#StaffModal
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

// Düzenleme modalındaki PersonAccessInviteCard useAuth ister (kp9 spec'iyle aynı mock).
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' }, loading: false }),
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const OFFICE = { name: 'TELLI HUKUK', lawyers: [], bankAccounts: [] };
/** Kayıtlı değerler bilerek KARIŞIK: etkisiz kutulardan ikisi true (korunmalı), etkili kutulardan biri true. */
const STAFF = [
  {
    id: 's1', firstName: 'Aysu', lastName: 'Aktay', staffType: 'MUHASEBE', isDefaultForNewCases: false,
    canCreateCase: true, canEditCase: false, canGenerateDocuments: false, canApproveDocuments: true,
    canSeeFinance: false, canApproveFinance: true, canPrepareCollectionDisposition: true,
  },
];
const INEFFECTIVE = ['Dosya oluşturabilir', 'Dosya düzenleyebilir', 'Belge hazırlayabilir', 'Belge onaylayabilir', 'Muhasebe onaylayabilir'];
const EFFECTIVE = ['Muhasebe görebilir', 'Tahsilat dağıtımı hazırlayabilir'];

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

const drawer = () => screen.getByRole('dialog');
const DEL_STAFF = 'Aysu Aktay personelini sil';

async function openStaffDrawer() {
  search = new URLSearchParams('section=staff');
  render(<OfficeSettingsPage />);
  await waitFor(() => expect(within(drawer()).getByRole('button', { name: DEL_STAFF })).toBeTruthy());
  return within(drawer());
}

/** Modal formu: etiket metninden kutuya ulaşır (label kutuyu sarar). */
function box(form: HTMLFormElement, labelText: string): HTMLInputElement {
  const label = Array.from(form.querySelectorAll('label')).find((l) => (l.textContent ?? '').includes(labelText));
  expect(label, `etiket bulunamadı: ${labelText}`).toBeTruthy();
  const input = label!.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  expect(input, `kutu bulunamadı: ${labelText}`).toBeTruthy();
  return input!;
}

async function modalForm(): Promise<HTMLFormElement> {
  const kaydet = await screen.findByRole('button', { name: 'Kaydet' });
  const form = kaydet.closest('form') as HTMLFormElement;
  expect(form).toBeTruthy();
  return form;
}

beforeEach(() => {
  for (const k of Object.keys(mocked)) mocked[k].mockReset();
  primeReads();
});
afterEach(() => cleanup());

describe('F02-C — personel kartı izin kutuları: yalnız etkili yetki işaretlenebilir', () => {
  it('düzenleme: etkisiz beş kutu pasif + "şu an uygulanmıyor"; etkili iki kutu aktif; kayıtlı değerler görünür', async () => {
    const d = await openStaffDrawer();
    fireEvent.click(d.getByRole('button', { name: 'Düzenle' }));
    const form = await modalForm();

    for (const label of INEFFECTIVE) {
      const input = box(form, label);
      expect(input.disabled, `${label} pasif olmalı`).toBe(true);
      expect(input.closest('label')!.textContent).toContain('şu an uygulanmıyor');
    }
    for (const label of EFFECTIVE) {
      expect(box(form, label).disabled, `${label} aktif olmalı`).toBe(false);
    }
    // Kayıtlı değerler sessizce sıfırlanmaz: ekranda aynen görünür.
    expect(box(form, 'Dosya oluşturabilir').checked).toBe(true);
    expect(box(form, 'Belge onaylayabilir').checked).toBe(true);
    expect(box(form, 'Muhasebe onaylayabilir').checked).toBe(true);
    expect(box(form, 'Dosya düzenleyebilir').checked).toBe(false);
    expect(box(form, 'Muhasebe görebilir').checked).toBe(false);
    expect(box(form, 'Tahsilat dağıtımı hazırlayabilir').checked).toBe(true);
  });

  it('kaydet: etkisiz kutuların kayıtlı değerleri AYNEN PUT edilir (veri kaybı yok); etkili kutu değişikliği gider', async () => {
    mocked.put.mockResolvedValueOnce({ data: {} });
    const d = await openStaffDrawer();
    fireEvent.click(d.getByRole('button', { name: 'Düzenle' }));
    const form = await modalForm();
    fireEvent.click(box(form, 'Muhasebe görebilir')); // etkili kutu: false → true
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    const [url, payload] = mocked.put.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/staff/s1');
    expect(payload).toMatchObject({
      canCreateCase: true, canEditCase: false, canGenerateDocuments: false, canApproveDocuments: true,
      canApproveFinance: true, canPrepareCollectionDisposition: true,
      canSeeFinance: true,
    });
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it('yeni personel: etkisiz kutular pasif ve işaretsiz; etkili kutular aktif', async () => {
    const d = await openStaffDrawer();
    fireEvent.click(d.getByRole('button', { name: /Ekle/ }));
    const form = await modalForm();
    for (const label of INEFFECTIVE) {
      const input = box(form, label);
      expect(input.disabled).toBe(true);
      expect(input.checked).toBe(false);
    }
    for (const label of EFFECTIVE) expect(box(form, label).disabled).toBe(false);
  });
});
