import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ClientsSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4h — DETAY OKUNAMAZSA DÜZENLEME MODALI LİSTE SATIRIYLA AÇILMAZ.
 *
 * Müvekkil düzenleme modalı İKİ ayrı kapıdan açılıyordu — listedeki ad düğmesi
 * ve `/settings/clients?edit={id}` deep-link'i — ve İKİSİ de detay okuması
 * başarısız olunca modalı LİSTE SATIRINDAN tohumluyordu.
 *
 * Bu sayfanın kendi notu (VER-02) liste projeksiyonunun detaydan DAR olduğunu
 * zaten kayda geçirmiş: "liste projeksiyonu `addresses` İÇERMEZ (findAll ≠
 * findOne)". `ClientModal` ise tüm formu bu proptan tohumlar ve `handleSave`
 * TAM FORM `PUT` gönderir — yani listede bulunmayan alanlar boş/varsayılan
 * değerleriyle geri yazılır.
 *
 * ENVANTER NOTU: tarayıcı bu ikisini TEK bulgu olarak gösteriyordu, çünkü aynı
 * kararlı anahtarı paylaşıyorlar (aynı kural + aynı dosya + aynı kapsayan
 * sembol `ClientsSettingsPage`). Deep-link kapısı düzeltilince ikinci örnek
 * envanterde görünür hâle geldi ve aynı dilimde kapatıldı. İkisi de artık tek
 * bir korumalı `openClientForEdit` kapısından geçiyor.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

/** Test basina degistirilebilir arama parametresi. */
let searchParams = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/components/client/PoaScannerWizard', () => ({ PoaScannerWizard: () => null }));
vi.mock('@/components/bulk-email-modal', () => ({ BulkEmailModal: () => null }));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

/** Liste satiri: DAR projeksiyon (addresses, gender, notes YOK). */
const LIST_ROW = {
  id: 'cli-1',
  type: 'PERSON',
  name: 'Ayşe Yılmaz',
  firstName: 'Ayşe',
  lastName: 'Yılmaz',
};

/** Detay: liste satirinda BULUNMAYAN alanlari da tasir. */
const DETAIL = { ...LIST_ROW, gender: 'FEMALE', notes: 'Gerçek not', canWaive: true };

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams('');
});
afterEach(() => cleanup());

/** Liste ile detay cagrisini AYIRAN yonlendirici. */
function routeApi(detail: () => unknown) {
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (/^\/clients\/[^/?]+$/.test(u)) return Promise.resolve(detail());
    if (u.startsWith('/clients')) return Promise.resolve({ data: { data: [LIST_ROW] } });
    return Promise.resolve({ data: { data: [] } });
  });
}

/** Listedeki ad dugmesi — modalin BIRINCI kapisi. */
const clickRowName = async () =>
  fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Yılmaz' }));

describe('Kapı 1 — listedeki ad düğmesi', () => {
  it('detay HATASI: modal ACILMAZ, gorunur hata cikar', async () => {
    routeApi(() => Promise.reject(new Error('network down')));
    render(<ClientsSettingsPage />);
    await clickRowName();

    expect(await screen.findByRole('alert')).toBeTruthy();
    // Tam-form PUT'u besleyecek form basligi HIC basilmaz.
    expect(screen.queryByText('Müvekkil Düzenle')).toBeNull();
    expect(mocked.get).toHaveBeenCalledWith('/clients/cli-1');
  });

  it('BOZUK govde (kimlik uyusmuyor) detay SAYILMAZ', async () => {
    routeApi(() => ({ data: { data: { ...DETAIL, id: 'baska-muvekkil' } } }));
    render(<ClientsSettingsPage />);
    await clickRowName();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Müvekkil Düzenle')).toBeNull();
  });

  it('basarili detay: modal ACILIR, hata YOK', async () => {
    routeApi(() => ({ data: { data: DETAIL } }));
    render(<ClientsSettingsPage />);
    await clickRowName();

    expect(await screen.findByText('Müvekkil Düzenle')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Kapı 2 — satırdaki kalem (Düzenle) düğmesi', () => {
  const clickPencil = async () => fireEvent.click(await screen.findByTitle('Düzenle'));

  it('detay HATASI: modal ACILMAZ, gorunur hata cikar', async () => {
    routeApi(() => Promise.reject(new Error('network down')));
    render(<ClientsSettingsPage />);
    await clickPencil();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Müvekkil Düzenle')).toBeNull();
  });

  it('basarili detay: modal ACILIR, hata YOK', async () => {
    routeApi(() => ({ data: { data: DETAIL } }));
    render(<ClientsSettingsPage />);
    await clickPencil();

    expect(await screen.findByText('Müvekkil Düzenle')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Kapı 3 — ?edit={id} deep-link', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams('edit=cli-1');
  });

  it('detay HATASI: modal ACILMAZ, gorunur hata cikar', async () => {
    routeApi(() => Promise.reject(new Error('network down')));
    render(<ClientsSettingsPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Müvekkil Düzenle')).toBeNull();
  });

  it('BOS govde detay SAYILMAZ', async () => {
    routeApi(() => ({ data: { data: null } }));
    render(<ClientsSettingsPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Müvekkil Düzenle')).toBeNull();
  });

  it('basarili detay: modal ACILIR, hata YOK', async () => {
    routeApi(() => ({ data: { data: DETAIL } }));
    render(<ClientsSettingsPage />);

    expect(await screen.findByText('Müvekkil Düzenle')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocked.get).toHaveBeenCalledWith('/clients/cli-1');
  });
});
