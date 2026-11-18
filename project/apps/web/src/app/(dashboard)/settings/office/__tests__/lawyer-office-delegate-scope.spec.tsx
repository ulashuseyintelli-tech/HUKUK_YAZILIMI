import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * Owner 18.11.2026 — "Büro yönetim ve onay yetkisi (delege)" ayarı gerçek kapsamını açıkça anlatır (yetki modeli DEĞİŞMEZ):
 *  - ad "Ofis onay yetkisi" değil; kapsam (onay, dosya ekibi / dosya yetkileri, Büro Ayarları, kayıt yaşam döngüsü) GÖRÜNÜR metin,
 *    yalnız fare ipucu değil; kutu açıklamaya `aria-describedby` ile bağlı;
 *  - ortak avukatta (PARTNER) ayar ve açıklama yok (rütbe zaten kapsar);
 *  - kutu işaretlenip kaydedilince mevcut güncelleme yolu aynı alanı gönderir.
 * Gerçek sayfa render edilir; yalnız ağ ve Next yönlendirme katmanı mock'tur (kp9 deseni).
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

const OFFICE = {
  name: 'ORNEK HUKUK',
  lawyers: [
    { id: 'l1', name: 'AYSE', surname: 'ORTAK', lawyerRank: 'PARTNER', isDefaultForNewCases: false, sortOrder: 0 },
    { id: 'l2', name: 'MERT', surname: 'YETKILI', lawyerRank: 'AUTHORIZED', canApproveOfficeActions: false, isDefaultForNewCases: false, sortOrder: 1 },
  ],
  bankAccounts: [],
};

function primeReads() {
  mocked.get.mockImplementation((url: string) => {
    const map: Record<string, unknown> = {
      '/office': { data: OFFICE },
      '/lawyers/default-permissions/status': { data: [] },
      '/office/smtp-settings': { data: {} },
      '/office/sms-settings': { data: {} },
      '/office/greeting-settings': { data: {} },
      '/office/escalation-settings': { data: {} },
      '/staff': { data: { data: [] } },
    };
    return Promise.resolve(map[url] ?? { data: {} });
  });
}

const drawer = () => screen.getByRole('dialog');

async function renderLawyers() {
  search = new URLSearchParams('section=lawyers');
  render(<OfficeSettingsPage />);
  await waitFor(() => expect(within(drawer()).getByRole('button', { name: 'AYSE ORTAK varsayılan ayarını değiştir' })).toBeTruthy());
  return within(drawer());
}

function rowOf(view: ReturnType<typeof within>, fullName: string): HTMLElement {
  const button = view.getByRole('button', { name: `${fullName} varsayılan ayarını değiştir` });
  const row = button.closest('[draggable="true"]') ?? button.parentElement?.parentElement;
  if (!row) throw new Error(`satır bulunamadı: ${fullName}`);
  return row as HTMLElement;
}

async function openEdit(view: ReturnType<typeof within>, fullName: string) {
  fireEvent.click(within(rowOf(view, fullName)).getByTitle('Düzenle'));
  await waitFor(() => expect(screen.getByText('Avukat Düzenle')).toBeTruthy());
}

let consoleErrors: unknown[][] = [];

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeReads();
  consoleErrors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args);
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  const errs = consoleErrors;
  cleanup();
  vi.restoreAllMocks();
  expect(errs).toHaveLength(0);
});

describe('Büro yönetim ve onay yetkisi (delege) — ad ve görünür kapsam', () => {
  it('ortak olmayan avukatta ayar yeni adıyla gelir; kapsam görünür metin ve kutuya bağlı', async () => {
    const view = await renderLawyers();
    await openEdit(view, 'MERT YETKILI');

    const box = screen.getByLabelText('Büro yönetim ve onay yetkisi (delege)') as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.queryByText('Ofis onay yetkisi (delege)')).toBeNull();

    const scope = screen.getByTestId('lawyer-office-delegate-scope');
    expect(box.getAttribute('aria-describedby')).toBe(scope.id);
    const text = scope.textContent ?? '';
    expect(text).toContain('Ofis onay taleplerini onaylar (kendi açtığı talebi onaylayamaz).');
    expect(text).toContain('Dosya ekibine avukat ve personel ekler ya da çıkarır; dosya yetkisi verir.');
    expect(text).toContain("Büro Ayarları'nda yönetim değişikliği yapar");
    expect(text).toContain('Müvekkil ve borçlu kaydını arşivler ya da siler');
    expect(text).toContain('Bu ayarı yalnız ADMIN veya ortak avukat değiştirebilir.');
    expect(within(scope).getAllByRole('listitem')).toHaveLength(4);
    // eski davranış: kapsam yalnız fare ipucundaydı
    expect(box.closest('label')?.getAttribute('title')).toBeNull();
  });

  it('ortak avukatta (PARTNER) ayar ve açıklama yok', async () => {
    const view = await renderLawyers();
    await openEdit(view, 'AYSE ORTAK');
    expect(screen.queryByLabelText('Büro yönetim ve onay yetkisi (delege)')).toBeNull();
    expect(screen.queryByTestId('lawyer-office-delegate-scope')).toBeNull();
  });

  it('işaretleyip kaydetmek mevcut güncelleme yolunda aynı alanı gönderir (yetki modeli değişmez)', async () => {
    mocked.put.mockResolvedValue({ data: {} });
    mocked.patch.mockResolvedValue({ data: {} });
    const view = await renderLawyers();
    await openEdit(view, 'MERT YETKILI');
    fireEvent.click(screen.getByLabelText('Büro yönetim ve onay yetkisi (delege)'));
    fireEvent.click(screen.getByRole('button', { name: /^Kaydet$|^Güncelle$/ }));
    await waitFor(() => expect(mocked.put.mock.calls.length + mocked.patch.mock.calls.length).toBeGreaterThan(0));
    const call = [...mocked.put.mock.calls, ...mocked.patch.mock.calls].find(([url]) => String(url).startsWith('/lawyers/l2'));
    expect(call).toBeTruthy();
    expect((call as unknown[])[1]).toEqual(expect.objectContaining({ canApproveOfficeActions: true }));
  });
});
