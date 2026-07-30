import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientProfile } from '@/components/client/client-profile';
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
      // ARC-07 I03: staff arsiv okumasi + I02 aksiyonlari
      getClientAddresses: vi.fn(),
      archiveClientAddress: vi.fn(),
      restoreClientAddress: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  getClient: ReturnType<typeof vi.fn>;
  getCases: ReturnType<typeof vi.fn>;
  getClientActionCatalog: ReturnType<typeof vi.fn>;
  getClientOperatingSnapshot: ReturnType<typeof vi.fn>;
  createClientAddress: ReturnType<typeof vi.fn>;
  updateClientAddress: ReturnType<typeof vi.fn>;
  deleteClientAddress: ReturnType<typeof vi.fn>;
  getClientAddresses: ReturnType<typeof vi.fn>;
  archiveClientAddress: ReturnType<typeof vi.fn>;
  restoreClientAddress: ReturnType<typeof vi.fn>;
};

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
  tckn: '12345678901',
  contacts: [],
  powerOfAttorneys: [],
};

async function openIdentityTab() {
  apiMock.getClientActionCatalog.mockResolvedValue({ data: [] });
  apiMock.getClientOperatingSnapshot.mockResolvedValue({ data: rightPanelSnapshot });
  render(<ClientProfile clientId="client-1" />);
  await waitFor(() => expect(screen.getByText('Ada Müvekkil')).toBeTruthy());
  fireEvent.click(screen.getByRole('tab', { name: 'Kimlik & İletişim' }));
}

describe('ClientAddressSection — flat fallback (addresses boş)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getClient.mockResolvedValue({
      data: { ...baseClient, address: 'Atatürk Cad. No:5', city: 'İstanbul', district: 'Kadıköy', addresses: [] },
    });
    apiMock.getCases.mockResolvedValue({ data: [] });
    apiMock.getClientAddresses.mockResolvedValue([]);
  });

  it('addresses=[] iken flat clientPrimaryAddress() fallback gösterilir', async () => {
    await openIdentityTab();

    // Aynı flat adres header özetinde de göründüğü için >=2 eşleşme beklenir (header + tab fallback).
    await waitFor(() => expect(screen.getAllByText(/Atatürk Cad\. No:5/).length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText('Birincil Yap')).toBeNull();
    expect(screen.getByText('+ Adres Ekle')).toBeTruthy();
  });
});

describe('ClientAddressSection — çok-adres listesi', () => {
  const addresses = [
    {
      id: 'addr-1',
      clientId: 'client-1',
      type: 'BEYAN',
      street: 'Cadde 1',
      city: 'İstanbul',
      district: 'Kadıköy',
      region: null,
      postalCode: null,
      isPrimary: true,
      isCurrent: true,
    },
    {
      id: 'addr-2',
      clientId: 'client-1',
      type: 'TEBLIGAT',
      street: 'Cadde 2',
      city: 'İstanbul',
      district: 'Beşiktaş',
      region: null,
      postalCode: null,
      isPrimary: false,
      isCurrent: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getClient.mockResolvedValue({ data: { ...baseClient, addresses } });
    apiMock.getCases.mockResolvedValue({ data: [] });
    apiMock.getClientAddresses.mockResolvedValue([]);
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('addresses doluyken liste satırları gösterilir (flat fallback DEĞİL)', async () => {
    await openIdentityTab();

    // VER-02 DAVRANIŞ DEĞİŞİKLİĞİ (kasıtlı): primary yapısal adres ARTIK header'da DA görünür
    // (eskiden header düz kolonları okuyordu → aynı ekranda iki farklı adres). Bu yüzden
    // "Cadde 1" iki yerde eşleşir: header özeti + Adres sekmesi satırı. Assertion GEVŞETİLMEDİ,
    // tam tersine tek-kaynak beklentisi olarak GÜÇLENDİRİLDİ.
    await waitFor(() => expect(screen.getAllByText(/Cadde 1/).length).toBeGreaterThanOrEqual(2));
    // Primary OLMAYAN adres yalnız sekmede görünür — header birincili seçer, ikinciyi göstermez.
    expect(screen.getAllByText(/Cadde 2/)).toHaveLength(1);
    // Yalnız primary olmayan satırda "Birincil Yap" görünür.
    expect(screen.getAllByText('Birincil Yap')).toHaveLength(1);
  });

  it('primary olmayan satırda "Birincil Yap" → PUT { isPrimary: true }', async () => {
    apiMock.updateClientAddress.mockResolvedValue({ id: 'addr-2', isPrimary: true });
    await openIdentityTab();

    await waitFor(() => expect(screen.getByText(/Cadde 2/)).toBeTruthy());
    fireEvent.click(screen.getByText('Birincil Yap'));

    await waitFor(() =>
      expect(apiMock.updateClientAddress).toHaveBeenCalledWith('client-1', 'addr-2', { isPrimary: true }),
    );
    // Refresh sonrası client tekrar çekilir.
    await waitFor(() => expect(apiMock.getClient).toHaveBeenCalledTimes(2));
  });

  it('ARC-07 I03: fiziksel silme aksiyonu personel arayüzünde SUNULMAZ; yerine Arşivle vardır', async () => {
    // I03 §7 KASITLI DEĞİŞİKLİK: bu test eskiden "Sil" butonuna tıklayıp backend'in primary-silme
    // reddini gösteriyordu. I02 fiziksel silmeyi KOŞULSUZ fail-closed yaptığı için silme artık
    // ulaşılabilir bir personel aksiyonu DEĞİLDİR. Test GEVŞETİLMEDİ — DELETE'in hiç sunulmadığı
    // ve arşivlemenin DELETE olarak yeniden etiketlenmediği ayrıca kanıtlanır.
    await openIdentityTab();

    await waitFor(() => expect(screen.getAllByText(/Cadde 1/).length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText('Sil')).toBeNull();
    expect(screen.getAllByText('Arşivle').length).toBeGreaterThanOrEqual(1);
    expect(apiMock.deleteClientAddress).not.toHaveBeenCalled();
  });

  it('ARC-07 I03: birincil adres arşivlenirken yerine geçecek birincil AÇIKÇA seçtirilir', async () => {
    apiMock.archiveClientAddress.mockResolvedValue({ id: 'addr-1', isCurrent: false });
    await openIdentityTab();

    await waitFor(() => expect(screen.getAllByText(/Cadde 1/).length).toBeGreaterThanOrEqual(2));
    fireEvent.click(screen.getAllByText('Arşivle')[0]); // addr-1 = birincil

    // Onay modali replacement seçimi ister; seçim yapılmadan onay butonu DEVRE DIŞIDIR.
    const select = (await screen.findByLabelText('Yeni birincil adres')) as HTMLSelectElement;
    const confirmBtn = screen.getAllByRole('button', { name: 'Arşivle' }).slice(-1)[0] as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    // Aday listesi hedefi İÇERMEZ (yalnız addr-2 + "Seçiniz").
    expect(select.querySelectorAll('option')).toHaveLength(2);
    expect(select.querySelector('option[value="addr-1"]')).toBeNull();
    expect(select.querySelector('option[value="addr-2"]')).toBeTruthy();

    fireEvent.change(select, { target: { value: 'addr-2' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Arşivle' }).slice(-1)[0]);

    await waitFor(() =>
      expect(apiMock.archiveClientAddress).toHaveBeenCalledWith('client-1', 'addr-1', {
        replacementPrimaryAddressId: 'addr-2',
      }),
    );
  });

  it('ARC-07 I03: arşivlenmiş adresler AYRI listede gösterilir ve aktif listeye karışmaz', async () => {
    apiMock.getClientAddresses.mockResolvedValue([
      {
        id: 'addr-9',
        clientId: 'client-1',
        type: 'FATURA',
        street: 'Eski Cadde 9',
        city: 'İzmir',
        district: 'Konak',
        region: null,
        postalCode: null,
        isPrimary: false,
        isCurrent: false,
      },
    ]);
    await openIdentityTab();

    await waitFor(() => expect(screen.getByText('Arşivlenmiş Adresler')).toBeTruthy());
    expect(screen.getByText(/Eski Cadde 9/)).toBeTruthy();
    expect(screen.getByText('Arşivlendi')).toBeTruthy();
    // Arşiv satırı için "Birincil Yap" SUNULMAZ; yalnız "Geri Al" vardır.
    expect(screen.getAllByText('Birincil Yap')).toHaveLength(1); // yalnız aktif addr-2
    expect(screen.getByText('Geri Al')).toBeTruthy();
    expect(apiMock.getClientAddresses).toHaveBeenCalledWith('client-1', 'archived');
  });

  it('ARC-07 I03: geri alma VARSAYILAN olarak birincil YAPMAZ', async () => {
    apiMock.getClientAddresses.mockResolvedValue([
      {
        id: 'addr-9',
        clientId: 'client-1',
        type: 'FATURA',
        street: 'Eski Cadde 9',
        city: 'İzmir',
        district: 'Konak',
        region: null,
        postalCode: null,
        isPrimary: false,
        isCurrent: false,
      },
    ]);
    apiMock.restoreClientAddress.mockResolvedValue({ id: 'addr-9', isCurrent: true });
    await openIdentityTab();

    await waitFor(() => expect(screen.getByText('Geri Al')).toBeTruthy());
    fireEvent.click(screen.getByText('Geri Al'));

    // Modaldaki onay butonuna basılır (checkbox işaretlenmez → makePrimary gönderilmez).
    await waitFor(() => expect(screen.getByText('Adresi Geri Al')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: 'Geri Al' }).slice(-1)[0]);

    await waitFor(() => expect(apiMock.restoreClientAddress).toHaveBeenCalledWith('client-1', 'addr-9', {}));
  });
});
