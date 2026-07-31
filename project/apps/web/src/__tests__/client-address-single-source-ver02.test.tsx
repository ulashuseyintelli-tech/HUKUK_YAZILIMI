/**
 * VER-02 — ADRES TEK-KAYNAK ve YANILTICI-BAŞARI ÖNLEME testleri.
 *
 * Kapsanan owner gereksinimleri:
 *   - profil header'ı ile Adres sekmesi AYNI yapısal adresi seçer
 *   - yapısal ClientAddress, çelişen düz (legacy) veriye KARŞI KAZANIR
 *   - yalnız düz veri varsa AÇIK legacy fallback kullanılır
 *   - adressiz müvekkil güvenli render eder
 *   - yapısal satır varken legacy form adresi OTORİTER göstermez (yanıltıcı başarı yok)
 *   - isCurrent/arşiv semantiği EKLENMEZ (ARC-07 açık kalır)
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// OWN-11 (CLIENT-OWN-11-WORKSPACE-URL-CONTRACT-I01): ClientProfile aktif sekmeyi ARTIK
// URL'den (`?tab=`) turetir. Bu suite sekme URL kontratini test ETMEZ, ancak ClientProfile'i
// render ettigi icin router hook'lari mock'lanmalidir. Kanonik kontrat testleri:
// `client-workspace-url-contract-own11.test.tsx`.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/clients/client-1',
  useSearchParams: () => new URLSearchParams(),
}));
import { ClientProfile } from '@/components/client/client-profile';
import { ClientForm } from '@/components/client/client-form';
import {
  clientAddressLine,
  clientPrimaryAddress,
  clientResolvedAddress,
} from '@/lib/client-display';
import { buildEditClientPayload, emptyClientFormValues, hasStructuredAddresses } from '@/lib/client-write';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      getClient: vi.fn(),
      getCases: vi.fn(),
      getClientActionCatalog: vi.fn(),
      getClientOperatingSnapshot: vi.fn(),
      createClientAddress: vi.fn(),
      updateClientAddress: vi.fn(),
      deleteClientAddress: vi.fn(),
    },
  };
});

const apiMock = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const rightPanelSnapshot = {
  clientId: 'client-1',
  health: 'healthy',
  riskLevel: 'low',
  contact: {
    status: 'complete',
    missingFields: [],
    followUpStatus: null,
    openTaskCount: 0,
    overdueTaskCount: 0,
    nextFollowUpAt: null,
    escalationLevel: null,
  },
  poa: { status: 'active', activeCount: 0, nearestValidUntil: null },
  intake: { status: 'none', latestSubmission: null, latestLink: null },
  notification: { status: 'none', latest: null },
  signals: [],
};

const baseClient = {
  id: 'client-1',
  type: 'PERSON',
  displayName: 'Ada Müvekkil',
  firstName: 'Ada',
  lastName: 'Müvekkil',
  tckn: '11111111110',
  contacts: [],
  powerOfAttorneys: [],
};

function structuredRow(over: Record<string, unknown> = {}) {
  return {
    id: 'addr-1',
    clientId: 'client-1',
    type: 'BEYAN',
    street: 'Yapısal Cad. No:1',
    city: 'İstanbul',
    district: 'Kadıköy',
    region: null,
    postalCode: null,
    isPrimary: true,
    isCurrent: true,
    ...over,
  };
}

async function renderProfileIdentityTab(client: Record<string, unknown>) {
  apiMock.getClient.mockResolvedValue({ data: client });
  apiMock.getCases.mockResolvedValue({ data: [] });
  apiMock.getClientActionCatalog.mockResolvedValue({ data: [] });
  apiMock.getClientOperatingSnapshot.mockResolvedValue({ data: rightPanelSnapshot });
  render(<ClientProfile clientId="client-1" />);
  await waitFor(() => expect(screen.getByText('Ada Müvekkil')).toBeTruthy());
}

describe('clientResolvedAddress — deterministik seçim sırası (saf)', () => {
  it('[A] aktif isPrimary=true satırı seçilir (dizi sırası ikinci olsa bile)', () => {
    const resolved = clientResolvedAddress({
      address: 'Legacy Cad',
      city: 'Ankara',
      district: null,
      region: null,
      postalCode: null,
      addresses: [
        structuredRow({ id: 'a1', street: 'İkincil Cad', isPrimary: false }),
        structuredRow({ id: 'a2', street: 'Birincil Cad', isPrimary: true }),
      ] as any,
    });
    expect(resolved.source).toBe('structured');
    expect(resolved.text).toContain('Birincil Cad');
    expect(resolved.hasStructured).toBe(true);
  });

  it('[B] isPrimary yoksa mevcut kararlı sıradaki İLK aktif satır seçilir', () => {
    const resolved = clientResolvedAddress({
      address: null,
      city: null,
      district: null,
      region: null,
      postalCode: null,
      addresses: [
        structuredRow({ id: 'a1', street: 'İlk Cad', isPrimary: false }),
        structuredRow({ id: 'a2', street: 'Sonra Cad', isPrimary: false }),
      ] as any,
    });
    expect(resolved.source).toBe('structured');
    expect(resolved.text).toContain('İlk Cad');
  });

  it('[C] yapısal satır YOK → AÇIK legacy düz fallback', () => {
    const resolved = clientResolvedAddress({
      address: 'Sadece Legacy Cad',
      city: 'İzmir',
      district: 'Konak',
      region: null,
      postalCode: null,
      addresses: [] as any,
    });
    expect(resolved.source).toBe('legacy');
    expect(resolved.text).toBe(clientPrimaryAddress({
      address: 'Sadece Legacy Cad',
      city: 'İzmir',
      district: 'Konak',
      region: null,
      postalCode: null,
    }));
    expect(resolved.hasStructured).toBe(false);
  });

  it('[D] ne yapısal ne düz veri → source=none, text=null (güvenli)', () => {
    const resolved = clientResolvedAddress({
      address: null,
      city: null,
      district: null,
      region: null,
      postalCode: null,
      addresses: [] as any,
    });
    expect(resolved.source).toBe('none');
    expect(resolved.text).toBeNull();
    expect(resolved.hasStructured).toBe(false);
  });

  it('[E] YAPISAL, ÇELİŞEN DÜZ VERİYE KARŞI KAZANIR', () => {
    const resolved = clientResolvedAddress({
      address: 'ESKI Legacy Cad',
      city: 'Ankara',
      district: null,
      region: null,
      postalCode: null,
      addresses: [structuredRow({ street: 'GUNCEL Yapısal Cad', city: 'İstanbul' })] as any,
    });
    expect(resolved.text).toContain('GUNCEL Yapısal Cad');
    expect(resolved.text).not.toContain('ESKI Legacy Cad');
  });

  it('[F] isCurrent/arşiv semantiği EKLENMEDİ — fonksiyon isCurrent değerini YORUMLAMAZ (ARC-07 açık)', () => {
    // Backend findOne() zaten yalnız isCurrent:true döner; bu katman ek filtre UYGULAMAZ.
    // isCurrent:false bir satır verilirse (backend sözleşmesi dışı) yine de seçilir —
    // yani burada gizli bir arşivleme kuralı YOK.
    const resolved = clientResolvedAddress({
      address: null,
      city: null,
      district: null,
      region: null,
      postalCode: null,
      addresses: [structuredRow({ street: 'Filtresiz Cad', isCurrent: false })] as any,
    });
    expect(resolved.source).toBe('structured');
    expect(resolved.text).toContain('Filtresiz Cad');
  });
});

describe('ClientProfile — header ve Adres sekmesi AYNI kaynaktan çözer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('[G] yapısal adres varken header YAPISAL adresi gösterir, çelişen düz veriyi GÖSTERMEZ', async () => {
    await renderProfileIdentityTab({
      ...baseClient,
      address: 'ESKI Legacy Cad',
      city: 'Ankara',
      addresses: [structuredRow({ street: 'GUNCEL Yapısal Cad', city: 'İstanbul' })],
    });

    // Header (sekmeye tıklanmadan görünür) yapısal adresi taşır.
    await waitFor(() => expect(screen.getAllByText(/GUNCEL Yapısal Cad/).length).toBeGreaterThanOrEqual(1));
    // Çelişen legacy değer HİÇBİR yerde görünmez.
    expect(screen.queryByText(/ESKI Legacy Cad/)).toBeNull();
  });

  it('[H] yapısal adres YOKken header açık legacy fallback gösterir', async () => {
    await renderProfileIdentityTab({
      ...baseClient,
      address: 'Sadece Legacy Cad',
      city: 'İzmir',
      addresses: [],
    });

    await waitFor(() => expect(screen.getAllByText(/Sadece Legacy Cad/).length).toBeGreaterThanOrEqual(1));
  });

  it('[I] hiç adres yok → header adres satırı render edilmez (çökme yok)', async () => {
    await renderProfileIdentityTab({ ...baseClient, addresses: [] });

    await waitFor(() => expect(screen.getByText('Ada Müvekkil')).toBeTruthy());
    // Adres metni yok; sayfa yine de sağlıklı render eder.
    expect(screen.queryByText(/Cad\./)).toBeNull();
  });
});

describe('ClientForm — yapısal adres varken OTORİTER görünmez (yanıltıcı başarı yok)', () => {
  const noop = () => {};

  it('[J] addressManagedExternally=true → düzenlenebilir adres alanları YOK, uyarı + yönlendirme VAR', () => {
    render(
      <ClientForm
        mode="edit"
        initialValues={emptyClientFormValues()}
        readOnlyContact={{ phone: null, email: null, address: 'Yapısal Cad. No:1, Kadıköy/İstanbul' }}
        addressManagedExternally
        addressManagerHref="/clients/client-1"
        saving={false}
        onSubmit={noop}
        onCancel={noop}
      />,
    );

    expect(screen.getByTestId('client-form-address-managed')).toBeTruthy();
    // Mevcut gerçek adres gösterilir (kullanıcı ne olduğunu görür).
    expect(screen.getByText(/Yapısal Cad\. No:1/)).toBeTruthy();
    // Buradan yapılan değişikliğin UYGULANMAYACAĞI açıkça yazılır.
    expect(screen.getByText(/UYGULANMAZ/)).toBeTruthy();
    // Yetkili editöre yönlendirme linki.
    const link = screen.getByRole('link', { name: /Adres bölümünü/ });
    expect(link.getAttribute('href')).toBe('/clients/client-1');
    // Düzenlenebilir adres girdileri RENDER EDİLMEZ.
    expect(screen.queryByPlaceholderText('Adres')).toBeNull();
    expect(screen.queryByPlaceholderText('İl')).toBeNull();
  });

  it('[K] addressManagedExternally=false → normal düzenlenebilir adres alanları görünür (regresyon yok)', () => {
    render(
      <ClientForm
        mode="edit"
        initialValues={emptyClientFormValues()}
        readOnlyContact={{ phone: null, email: null, address: null }}
        saving={false}
        onSubmit={noop}
        onCancel={noop}
      />,
    );

    expect(screen.queryByTestId('client-form-address-managed')).toBeNull();
    expect(screen.getByPlaceholderText('Adres')).toBeTruthy();
    expect(screen.getByPlaceholderText('İl')).toBeTruthy();
  });
});

describe('buildEditClientPayload — yapısal adres varken addresses GÖNDERİLMEZ', () => {
  it('[L] addressManagedExternally=true → payload.addresses undefined (çelişen düz değer oluşmaz)', () => {
    const form = { ...emptyClientFormValues(), address: 'Form Cad', city: 'Bursa' };
    const payload = buildEditClientPayload(form, { addressManagedExternally: true });
    expect(payload.addresses).toBeUndefined();
  });

  it('[M] addressManagedExternally=false → payload.addresses gönderilir (mevcut davranış korunur)', () => {
    const form = { ...emptyClientFormValues(), address: 'Form Cad', city: 'Bursa' };
    const payload = buildEditClientPayload(form, { addressManagedExternally: false });
    expect(Array.isArray(payload.addresses)).toBe(true);
    expect((payload.addresses as any[])[0]).toMatchObject({ street: 'Form Cad', city: 'Bursa' });
  });

  it('[N] opts hiç verilmezse mevcut çağıranlar bozulmaz (geriye uyumluluk)', () => {
    const form = { ...emptyClientFormValues(), address: 'Form Cad' };
    const payload = buildEditClientPayload(form);
    expect(Array.isArray(payload.addresses)).toBe(true);
  });
});

describe('hasStructuredAddresses + clientAddressLine (paylaşılan yardımcılar)', () => {
  it('[O] yapısal satır varlığını doğru bildirir', () => {
    expect(hasStructuredAddresses({ ...baseClient, addresses: [structuredRow()] } as any)).toBe(true);
    expect(hasStructuredAddresses({ ...baseClient, addresses: [] } as any)).toBe(false);
    expect(hasStructuredAddresses({ ...baseClient } as any)).toBe(false);
  });

  it('[P] tek satır formatı header ve sekmede AYNI (çoğaltma yok)', () => {
    const row = structuredRow({ street: 'Cad', district: 'Kadıköy', city: 'İstanbul' });
    expect(clientAddressLine(row as any)).toBe('Cad, Kadıköy/İstanbul');
  });

  it('[Q] tamamen boş satır "—" döner (çökme yok)', () => {
    expect(
      clientAddressLine({ street: null, district: null, city: null, region: null, postalCode: null } as any),
    ).toBe('—');
  });
});
