import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * K3-L KP-9 (owner kararı 2026-10-01) — Ayarlar > Büro: avukatın varsayılan dosya yetkisinin durumu açıkça görünür.
 *  - liste: avukat başına "uygulanıyor" / "uygulanmıyor" rozeti;
 *  - avukat formu: durum, neden, yönetim kaydı zamanı (TSİ) ve KAYITLI değer; işaretler kayıtlı değerle başlar
 *    (önceden sunucunun taşımadığı alan yerine sabit bir yedek gösteriliyordu);
 *  - onay aksiyonu YOK; dokunulmayan değer gönderilmez, değişen değer mevcut güncelleme yolundan gider;
 *  - durum okunamazsa sayfa aynen çalışır ve durum "okunamadı" olarak söylenir.
 * Gerçek sayfa render edilir; yalnız ağ ve Next yönlendirme katmanı mock'tur (office-mutation-matrix deseni).
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

// Avukat formundaki giriş daveti kartı oturum bağlamını okur (yalnız yönetici rolü kontrolü)
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' }, loading: false }),
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const OFFICE = {
  name: 'TELLI HUKUK',
  lawyers: [
    { id: 'l1', name: 'ULAS', surname: 'TELLI', lawyerRank: 'PARTNER', isDefaultForNewCases: false, sortOrder: 0 },
    { id: 'l2', name: 'FATMA', surname: 'ULUCA', lawyerRank: 'LAWYER', isDefaultForNewCases: true, sortOrder: 1 },
    { id: 'l3', name: 'DENIZ', surname: 'KAYA', lawyerRank: 'LAWYER', isDefaultForNewCases: false, sortOrder: 2 },
  ],
  bankAccounts: [],
};
const STATUSES = [
  {
    lawyerId: 'l1',
    appliesAtCaseOpen: true,
    reason: null,
    storedPermissions: { canEditCase: true, canGenerateDocs: true, canViewFinance: true, canEditFinance: true },
    managementRecordedAt: '2026-09-30T21:30:00.000Z',
  },
  {
    lawyerId: 'l2',
    appliesAtCaseOpen: false,
    reason: 'SOURCE_NOT_MANAGEMENT_VERIFIED',
    // Sabit yedekten FARKLI bir kayıtlı değer: yalnız mali düzenleme açık
    storedPermissions: { canEditCase: false, canEditFinance: true },
    managementRecordedAt: null,
  },
  { lawyerId: 'l3', appliesAtCaseOpen: false, reason: 'NO_DEFAULTS', storedPermissions: null, managementRecordedAt: null },
];

/** Her GET URL'i AÇIKÇA kurulur. */
function primeReads(over: Record<string, unknown> = {}) {
  mocked.get.mockImplementation((url: string) => {
    const map: Record<string, unknown> = {
      '/office': { data: OFFICE },
      '/lawyers/default-permissions/status': { data: STATUSES },
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

const drawer = () => screen.getByRole('dialog');

async function renderLawyers() {
  search = new URLSearchParams('section=lawyers');
  render(<OfficeSettingsPage />);
  await waitFor(() => expect(within(drawer()).getByRole('button', { name: 'ULAS TELLI varsayılan ayarını değiştir' })).toBeTruthy());
  return within(drawer());
}

/** Avukat satırı: "varsayılan ayarını değiştir" düğmesini taşıyan satır kapsayıcısı */
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

const checkbox = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

let consoleErrors: unknown[][] = [];

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeReads();
  search = new URLSearchParams('');
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

describe('K3-L KP-9: avukat listesinde varsayılan yetki durumu', () => {
  it('her avukatta rozet: uygulanıyor / uygulanmıyor; açıklama rozetin ipucunda', async () => {
    const view = await renderLawyers();
    await waitFor(() => expect(view.getAllByTestId('lawyer-default-permissions-badge')).toHaveLength(3));

    const badge = (name: string) => within(rowOf(view, name)).getByTestId('lawyer-default-permissions-badge');
    expect(badge('ULAS TELLI')).toHaveTextContent('Varsayılan yetki uygulanıyor');
    expect(badge('ULAS TELLI').getAttribute('data-tone')).toBe('applied');
    expect(badge('FATMA ULUCA')).toHaveTextContent('Varsayılan yetki uygulanmıyor');
    expect(badge('FATMA ULUCA').getAttribute('data-tone')).toBe('not-applied');
    expect(badge('FATMA ULUCA').getAttribute('title')).toContain('yönetim tarafından kaydedilmemiş');
    expect(badge('DENIZ KAYA').getAttribute('title')).toContain('Kayıtlı varsayılan yetki yok');
  });

  it('durum okunamazsa rozet YOK; sayfa aynen çalışır (hata yutulmaz gibi görünmez: form "okunamadı" der)', async () => {
    primeReads({ '/lawyers/default-permissions/status': new Error('403') });
    const view = await renderLawyers();
    expect(view.queryAllByTestId('lawyer-default-permissions-badge')).toHaveLength(0);

    await openEdit(view, 'FATMA ULUCA');
    expect(screen.getByTestId('lawyer-default-permissions-status-unknown')).toHaveTextContent('Durum okunamadı');
    expect(screen.queryByTestId('lawyer-default-permissions-status')).toBeNull();
    // Durum bilinmiyorken form bugünkü yedeği gösterir (davranış değişmez)
    expect(checkbox('Dosya düzenleme').checked).toBe(true);
    expect(checkbox('Masraf düzenleme').checked).toBe(false);
  });

  it('dizi olmayan yanıt da "bilinmiyor" sayılır (rozet yok)', async () => {
    primeReads({ '/lawyers/default-permissions/status': { data: {} } });
    const view = await renderLawyers();
    expect(view.queryAllByTestId('lawyer-default-permissions-badge')).toHaveLength(0);
  });
});

describe('K3-L KP-9: avukat formunda durum ve kayıtlı değer', () => {
  it('UYGULANIYOR: yönetim kaydı zamanı TSİ ile; kayıtlı değer listelenir; işaretler kayıtlı değeri gösterir', async () => {
    const view = await renderLawyers();
    await waitFor(() => expect(view.getAllByTestId('lawyer-default-permissions-badge')).toHaveLength(3));
    await openEdit(view, 'ULAS TELLI');

    const block = screen.getByTestId('lawyer-default-permissions-status');
    expect(block.getAttribute('data-tone')).toBe('applied');
    expect(block).toHaveTextContent('Varsayılan yetki uygulanıyor');
    expect(block).toHaveTextContent('Yönetim kaydı: 01.10.2026 00:30 (TSİ)');
    expect(screen.getByTestId('lawyer-default-permissions-stored')).toHaveTextContent(
      'Kayıtlı değer: Dosya düzenleme, Evrak oluşturma, Hesap görme, Masraf düzenleme',
    );
    expect(checkbox('Masraf düzenleme').checked).toBe(true);
    expect(checkbox('UYAP senkron').checked).toBe(false);
  });

  it('UYGULANMIYOR (yönetim kaydı yok): neden görünür; işaretler SABİT YEDEĞİ değil KAYITLI değeri gösterir', async () => {
    const view = await renderLawyers();
    await waitFor(() => expect(view.getAllByTestId('lawyer-default-permissions-badge')).toHaveLength(3));
    await openEdit(view, 'FATMA ULUCA');

    const block = screen.getByTestId('lawyer-default-permissions-status');
    expect(block.getAttribute('data-tone')).toBe('not-applied');
    expect(block).toHaveTextContent('Varsayılan yetki uygulanmıyor');
    expect(block).toHaveTextContent('yönetim tarafından kaydedilmemiş');
    expect(screen.getByTestId('lawyer-default-permissions-stored')).toHaveTextContent('Kayıtlı değer: Masraf düzenleme');
    // Sabit yedekte "Dosya düzenleme" açık, "Masraf düzenleme" kapalıdır; kayıtlı değer tersidir
    expect(checkbox('Dosya düzenleme').checked).toBe(false);
    expect(checkbox('Masraf düzenleme').checked).toBe(true);
    // Onay aksiyonu yok
    expect(screen.queryByRole('button', { name: /onayla/i })).toBeNull();
  });

  it('KAYIT YOK: "Kayıtlı değer: yok"; işaretler bugünkü yedekle başlar', async () => {
    const view = await renderLawyers();
    await waitFor(() => expect(view.getAllByTestId('lawyer-default-permissions-badge')).toHaveLength(3));
    await openEdit(view, 'DENIZ KAYA');

    expect(screen.getByTestId('lawyer-default-permissions-status')).toHaveTextContent('Kayıtlı varsayılan yetki yok');
    expect(screen.getByTestId('lawyer-default-permissions-stored')).toHaveTextContent('Kayıtlı değer: yok');
    expect(checkbox('Dosya düzenleme').checked).toBe(true);
    expect(checkbox('Masraf düzenleme').checked).toBe(false);
  });

  it('dokunulmayan varsayılan yetki GÖNDERİLMEZ (durum bloğu yazma tetiklemez)', async () => {
    mocked.put.mockResolvedValue({ data: {} });
    const view = await renderLawyers();
    await waitFor(() => expect(view.getAllByTestId('lawyer-default-permissions-badge')).toHaveLength(3));
    await openEdit(view, 'FATMA ULUCA');

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    const [url, body] = mocked.put.mock.calls[0];
    expect(url).toBe('/lawyers/l2');
    expect(body).not.toHaveProperty('defaultPermissions');
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it('değiştirilen değer mevcut güncelleme yolundan gider: kayıtlı değer + değişiklik (sabit yedek karışmaz)', async () => {
    mocked.put.mockResolvedValue({ data: {} });
    const view = await renderLawyers();
    await waitFor(() => expect(view.getAllByTestId('lawyer-default-permissions-badge')).toHaveLength(3));
    await openEdit(view, 'FATMA ULUCA');

    fireEvent.click(checkbox('Hesap görme'));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    const [url, body] = mocked.put.mock.calls[0];
    expect(url).toBe('/lawyers/l2');
    expect(body.defaultPermissions).toEqual({
      canEditCase: false,
      canGenerateDocs: false,
      canSyncUYAP: false,
      canViewFinance: true,
      canEditFinance: true,
      canChangeStatus: false,
      canEditParties: false,
    });
    // Kayıt sonrası büro ve durum yeniden okunur
    await waitFor(() =>
      expect(mocked.get.mock.calls.filter((c) => c[0] === '/lawyers/default-permissions/status').length).toBeGreaterThanOrEqual(2),
    );
  });

  it('yeni avukat formunda durum bloğu yok (henüz kayıt yok)', async () => {
    const view = await renderLawyers();
    fireEvent.click(view.getByRole('button', { name: /Ekle/ }));
    await waitFor(() => expect(screen.getByText('Yeni Avukat')).toBeTruthy());
    expect(screen.queryByTestId('lawyer-default-permissions-status')).toBeNull();
    expect(screen.queryByTestId('lawyer-default-permissions-status-unknown')).toBeNull();
    expect(screen.getByTestId('default-permissions-rule')).toBeTruthy();
  });
});
