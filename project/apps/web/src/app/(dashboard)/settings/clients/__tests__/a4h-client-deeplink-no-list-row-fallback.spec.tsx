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

const mocked = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

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
    // DIKKAT: sayfa `/clients/lifecycle-eligibility` de cagiriyor ve bu da
    // `/clients/<seg>` desenine uyuyor. DETAY yolu YALNIZ gercek id icindir;
    // aksi halde sayac tabanli fixture'larda yanlis cagri tuketilirdi.
    if (/^\/clients\/[^/?]+$/.test(u) && !u.includes('lifecycle-eligibility')) {
      return Promise.resolve(detail());
    }
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

/* ─────────────────────────────────────────────────────────────────────────────
   WSMR-A4i — YIKICI DUZENLEME KORUMASI (owner zorunlu matrisi).
   ───────────────────────────────────────────────────────────────────────────── */
describe('A4i — yıkıcı düzenleme koruması', () => {
  it('detay hatasinda HICBIR PUT/POST cagrisi yapilmaz (uc kapi icin de)', async () => {
    routeApi(() => Promise.reject(new Error('network down')));
    render(<ClientsSettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Yılmaz' }));
    await screen.findByRole('alert');

    expect(mocked.put).not.toHaveBeenCalled();
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it('dar liste projeksiyonu edit payload uretmez — form alanlari HIC render edilmez', async () => {
    routeApi(() => Promise.reject(new Error('network down')));
    render(<ClientsSettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Yılmaz' }));
    await screen.findByRole('alert');

    // Modal hic acilmadigi icin dar projeksiyondan tohumlanacak alan da yok.
    expect(screen.queryByText('Müvekkil Düzenle')).toBeNull();
    expect(screen.queryByPlaceholderText('Adres')).toBeNull();
  });

  it('deep-link BASARISIZ olursa state edit-ready KALMAZ', async () => {
    searchParams = new URLSearchParams('edit=cli-1');
    routeApi(() => Promise.reject(new Error('network down')));
    render(<ClientsSettingsPage />);
    await screen.findByRole('alert');

    // URL parametresi hala duruyor olabilir; ONEMLI olan UI durumu: modal KAPALI
    // ve duzenlenecek kayit SECILI DEGIL. Yeniden render/refresh edit modunu
    // kendiliginden ACMAZ.
    expect(screen.queryByText('Müvekkil Düzenle')).toBeNull();
    expect(mocked.put).not.toHaveBeenCalled();
  });

  it('retry BASARILI olursa modal YALNIZ taze detayla acilir', async () => {
    let attempt = 0;
    routeApi(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('geçici'))
        : Promise.resolve({ data: { data: DETAIL } });
    });
    render(<ClientsSettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Yılmaz' }));
    await screen.findByRole('alert');

    // Ayni kapiya ikinci tik = kullanicinin salt-okuma yeniden denemesi.
    fireEvent.click(screen.getByRole('button', { name: 'Ayşe Yılmaz' }));

    expect(await screen.findByText('Müvekkil Düzenle')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(attempt).toBe(2);
    expect(mocked.put).not.toHaveBeenCalled();
  });
});
