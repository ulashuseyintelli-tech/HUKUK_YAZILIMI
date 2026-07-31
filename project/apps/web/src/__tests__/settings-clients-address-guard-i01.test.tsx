/**
 * CLIENT-MULTI-ADDRESS-UX-CONSOLIDATION-I01
 *
 * settings/clients ClientModal'ın canonical ClientAddress lifecycle ile hizalanması.
 *
 * Kapsanan (R01 analizinin bulduğu defekt): ClientModal, yapısal ClientAddress kayıtlarından
 * habersizdi — yapısal adres mevcutken legacy flat alanları editable gösterip payload'a
 * `addresses` koyuyordu; backend bunu sessizce atlıyordu (yalnız post-save alert).
 *
 * Bu suite doğrular:
 *  - create mode DEĞİŞMEDİ (adres editable, ilk-adres persist payload'ı korunur),
 *  - structured-YOK edit mode DEĞİŞMEDİ (compatibility davranışı korunur),
 *  - structured-VAR edit mode salt-okuma+redirect'e döner: editable adres alanı YOK,
 *    modal-local "Birincil" kontrolü YOK, submit payload'ında ne `addresses` ne türetilmiş
 *    flat address/city/district/region VAR (client.service.ts update()'in flat kolonları
 *    addresses[]'ten HER ZAMAN türettiği — existingAddressCount guard'ının yalnız
 *    ClientAddress tablosu için olduğu — preflight'ta doğrulandı),
 *  - structured durumu DETAYLI fetch'ten belirlenir; detay-fetch başarısız olursa (yalnız
 *    liste projeksiyonuyla fallback) güvenli tarafa (yönetiliyor varsayımı) geçilir.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/client/PoaScannerWizard', () => ({
  PoaScannerWizard: () => null,
}));

vi.mock('@/components/bulk-email-modal', () => ({
  BulkEmailModal: () => null,
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from '@/lib/api';
import ClientsSettingsPage from '@/app/(dashboard)/settings/clients/page';

const apiMock = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

const NO_STRUCTURED = {
  id: 'client-1',
  type: 'PERSON',
  name: 'Ada Müvekkil',
  firstName: 'Ada',
  lastName: 'Müvekkil',
  tckn: '11111111110',
  phone: '5551234567',
  email: 'ada@example.com',
  address: 'Eski Cad. No:1',
  city: 'İstanbul',
  district: 'Kadıköy',
  region: null,
  contacts: [],
  powerOfAttorneys: [],
  addresses: [],
};

const STRUCTURED = {
  ...NO_STRUCTURED,
  id: 'client-2',
  name: 'Beste Müvekkil',
  firstName: 'Beste',
  addresses: [
    {
      id: 'addr-1',
      clientId: 'client-2',
      type: 'BEYAN',
      street: 'Yapısal Cad. No:9',
      city: 'Ankara',
      district: 'Çankaya',
      region: null,
      postalCode: null,
      isPrimary: true,
      isCurrent: true,
    },
  ],
};

/** Liste projeksiyonu satırı — findAll() addresses İÇERMEZ (VER-02 ile aynı gerçek kısıt). */
function toListRow(client: Record<string, unknown>) {
  const { addresses, ...rest } = client;
  return rest;
}

function mockGetRouter(byId: Record<string, unknown>, listRows: unknown[], opts: { detailFails?: string[] } = {}) {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/clients') return Promise.resolve({ data: { data: listRows } });
    if (url === '/clients/lifecycle-eligibility') {
      return Promise.resolve({ data: { data: { eligible: true } } });
    }
    const match = url.match(/^\/clients\/([^/]+)$/);
    if (match) {
      if (opts.detailFails?.includes(match[1])) return Promise.reject(new Error('network error'));
      const found = byId[match[1]];
      if (found) return Promise.resolve({ data: { data: found } });
      return Promise.reject(new Error(`not found: ${match[1]}`));
    }
    return Promise.reject(new Error(`unmocked GET ${url}`));
  });
}

/** Sayfanın üst arama kutusunu ve tablo checkbox'larını dışlar — yalnız modal içi inputlar. */
function modalInputs(container: HTMLElement): HTMLInputElement[] {
  const modalRoot = container.querySelector('.fixed.inset-0');
  if (!modalRoot) throw new Error('Modal DOM içinde bulunamadı');
  return Array.from(modalRoot.querySelectorAll('input'));
}

async function clickEditFor(displayName: string) {
  await screen.findByText(displayName);
  const editButtons = screen.getAllByTitle('Düzenle');
  const nameCell = screen.getByText(displayName).closest('tr');
  const editButton = (nameCell?.querySelector('button[title="Düzenle"]') ?? editButtons[0]) as Element;
  fireEvent.click(editButton);
  await screen.findByText('Müvekkil Düzenle');
}

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
});

describe('[1-2] settings/clients ClientModal — create mode (I01 guard uygulanmaz)', () => {
  it('[1] Manuel Ekle → adres alanları editable görünür, yönetim-notice YOK', async () => {
    mockGetRouter({}, []);
    const { container } = render(<ClientsSettingsPage />);
    fireEvent.click(await screen.findByText('Manuel Ekle'));
    await screen.findByText('Yeni Müvekkil');

    expect(screen.getByPlaceholderText('Adres')).toBeTruthy();
    expect(screen.queryByTestId('settings-client-address-managed')).toBeNull();
    expect(container.querySelectorAll('input[name="primaryAddress"]').length).toBeGreaterThan(0);
  });

  it('[2] Manuel Ekle submit → addresses payload’ı taşır (ilk-adres persist regresyonu)', async () => {
    mockGetRouter({}, []);
    apiMock.post.mockResolvedValue({ data: { data: { id: 'new-1' } } });
    const { container } = render(<ClientsSettingsPage />);
    fireEvent.click(await screen.findByText('Manuel Ekle'));
    await screen.findByText('Yeni Müvekkil');

    // ClientModal'da Ad/Soyad/TCKN/Telefon alanları htmlFor/id ile etiketlenmemiş (mevcut kod
    // tabanının kendi kısıtı, bu I01 kapsamında REFACTOR edilmiyor) — DOM sırasına göre erişim,
    // sayfanın üst arama kutusunu dışlamak için modal-scope'lu.
    const inputs = modalInputs(container);
    fireEvent.change(inputs[0], { target: { value: 'Test' } });
    fireEvent.change(inputs[1], { target: { value: 'Kullanici' } });
    fireEvent.change(inputs[2], { target: { value: '22222222222' } });
    fireEvent.change(inputs[3], { target: { value: '5559998877' } });
    // "Eksik iletişim" ara-modalını tetiklememek için e-posta da doldurulur. DOM sırası
    // (debug ile doğrulandı): 0=Ad,1=Soyad,2=TCKN,3=Telefon,4=TelefonEtiket,5=primaryPhone
    // radio,6=E-posta,7=E-postaEtiket,8=primaryEmail radio.
    fireEvent.change(inputs[6], { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Adres'), { target: { value: 'Yeni Cad. No:5' } });

    fireEvent.click(screen.getByText('Kaydet'));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());

    const [, payload] = apiMock.post.mock.calls[0];
    expect(payload.addresses?.[0]?.street).toBe('Yeni Cad. No:5');
  });
});

describe('[3-4] settings/clients ClientModal — edit mode, structured adres YOK (compatibility korunur)', () => {
  it('[3] adres alanları editable görünür, yönetim-notice YOK', async () => {
    mockGetRouter({ 'client-1': NO_STRUCTURED }, [toListRow(NO_STRUCTURED)]);
    render(<ClientsSettingsPage />);
    await clickEditFor('Ada Müvekkil');

    expect(screen.getByPlaceholderText('Adres')).toBeTruthy();
    expect(screen.queryByTestId('settings-client-address-managed')).toBeNull();
  });

  it('[4] submit → addresses + türetilmiş flat alanlar payload’da VAR (regresyon)', async () => {
    mockGetRouter({ 'client-1': NO_STRUCTURED }, [toListRow(NO_STRUCTURED)]);
    apiMock.put.mockResolvedValue({ data: { data: { ...NO_STRUCTURED } } });
    render(<ClientsSettingsPage />);
    await clickEditFor('Ada Müvekkil');

    fireEvent.click(screen.getByText('Kaydet'));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalled());

    const [, payload] = apiMock.put.mock.calls[0];
    expect(payload.addresses).toBeDefined();
    expect(payload.address).toBe('Eski Cad. No:1');
    expect(payload.city).toBe('İstanbul');
  });
});

describe('[5-11] settings/clients ClientModal — edit mode, structured adres VAR (I01 guard aktif)', () => {
  it('[5-6] salt-okuma notice + doğru client ID’li profil linki görünür', async () => {
    mockGetRouter({ 'client-2': STRUCTURED }, [toListRow(STRUCTURED)]);
    render(<ClientsSettingsPage />);
    await clickEditFor('Beste Müvekkil');

    const notice = screen.getByTestId('settings-client-address-managed');
    expect(notice.textContent).toContain('Müvekkil Detayı');
    const link = screen.getByText('Müvekkil detayına git') as HTMLAnchorElement;
    // OWN-11 (D03) KASITLI SINIR İLERLETMESİ (gevşetme DEĞİL): bağlantı artık yalnız doğru
    // müvekkile değil, doğrudan adresin yönetildiği "Kimlik & İletişim" sekmesine gider.
    // Eski hâli kullanıcıyı Workspace'in varsayılan sekmesine bırakıyor, adres bölümüne
    // elle geçmesini gerektiriyordu.
    expect(link.getAttribute('href')).toBe('/clients/client-2?tab=identity');
  });

  it('[7] editable adres alanı (textarea) YOK', async () => {
    mockGetRouter({ 'client-2': STRUCTURED }, [toListRow(STRUCTURED)]);
    render(<ClientsSettingsPage />);
    await clickEditFor('Beste Müvekkil');

    expect(screen.queryByPlaceholderText('Adres')).toBeNull();
  });

  it('[8] modal-local "Birincil" adres radio kontrolü YOK', async () => {
    mockGetRouter({ 'client-2': STRUCTURED }, [toListRow(STRUCTURED)]);
    const { container } = render(<ClientsSettingsPage />);
    await clickEditFor('Beste Müvekkil');

    expect(container.querySelectorAll('input[name="primaryAddress"]').length).toBe(0);
  });

  it('[9-10] submit payload’ında `addresses` VE flat address/city/district/region YOK', async () => {
    mockGetRouter({ 'client-2': STRUCTURED }, [toListRow(STRUCTURED)]);
    apiMock.put.mockResolvedValue({ data: { data: { ...STRUCTURED } } });
    render(<ClientsSettingsPage />);
    await clickEditFor('Beste Müvekkil');

    fireEvent.click(screen.getByText('Kaydet'));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalled());

    const [, payload] = apiMock.put.mock.calls[0];
    expect(payload.addresses).toBeUndefined();
    expect(payload.address).toBeUndefined();
    expect(payload.city).toBeUndefined();
    expect(payload.district).toBeUndefined();
    expect(payload.region).toBeUndefined();
  });

  it('[11] non-address alanlar (isim) hâlâ payload’da güncellenmiş olarak gider', async () => {
    mockGetRouter({ 'client-2': STRUCTURED }, [toListRow(STRUCTURED)]);
    apiMock.put.mockResolvedValue({ data: { data: { ...STRUCTURED } } });
    const { container } = render(<ClientsSettingsPage />);
    await clickEditFor('Beste Müvekkil');

    const firstNameInput = modalInputs(container)[0];
    fireEvent.change(firstNameInput, { target: { value: 'BesteYeni' } });
    fireEvent.click(screen.getByText('Kaydet'));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalled());

    const [, payload] = apiMock.put.mock.calls[0];
    expect(payload.firstName).toBe('BesteYeni');
  });
});

describe('[12-13] structured belirleme kaynağı ve fail-safe', () => {
  it('[12] structured durumu DETAYLI fetch’ten belirlenir (liste satırı addresses içermez)', async () => {
    // Liste satırında `addresses` hiç yok (VER-02 findAll projeksiyonu); yalnız Düzenle
    // tıklanınca yapılan detaylı GET /clients/:id addresses'i taşır. Guard yalnız detaylı
    // veri geldikten SONRA doğru sonuca ulaşmalı.
    mockGetRouter({ 'client-2': STRUCTURED }, [toListRow(STRUCTURED)]);
    render(<ClientsSettingsPage />);
    await clickEditFor('Beste Müvekkil');

    await waitFor(() =>
      expect(screen.getByTestId('settings-client-address-managed')).toBeTruthy(),
    );
  });

  it('[13] detaylı fetch BAŞARISIZ olursa (yalnız liste-fallback) güvenli tarafa geçilir', async () => {
    // catch bloğu editingClient'i liste satırıyla set eder (addresses alanı YOK, undefined).
    // "yok" ile "bilinmiyor" KARIŞTIRILMAZ: guard bu durumda da yönetiliyor VARSAYAR.
    mockGetRouter({}, [toListRow(STRUCTURED)], { detailFails: ['client-2'] });
    render(<ClientsSettingsPage />);
    await clickEditFor('Beste Müvekkil');

    await waitFor(() =>
      expect(screen.getByTestId('settings-client-address-managed')).toBeTruthy(),
    );
    expect(screen.queryByPlaceholderText('Adres')).toBeNull();
  });
});
