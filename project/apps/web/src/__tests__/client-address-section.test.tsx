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
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('addresses doluyken liste satırları gösterilir (flat fallback DEĞİL)', async () => {
    await openIdentityTab();

    await waitFor(() => expect(screen.getByText(/Cadde 1/)).toBeTruthy());
    expect(screen.getByText(/Cadde 2/)).toBeTruthy();
    // Yalnız primary olmayan satırda "Birincil Yap" görünür.
    expect(screen.getAllByText('Birincil Yap')).toHaveLength(1);
  });

  it('primary olmayan satırda "Birincil Yap" → PUT { isPrimary: true }', async () => {
    apiMock.updateClientAddress.mockResolvedValue({ id: 'addr-2', isPrimary: true });
    await openIdentityTab();

    await waitFor(() => expect(screen.getByText(/Cadde 2/)).toBeTruthy());
    fireEvent.click(screen.getByText('Birincil Yap'));

    await waitFor(() =>
      expect(apiMock.updateClientAddress).toHaveBeenCalledWith('addr-2', { isPrimary: true }),
    );
    // Refresh sonrası client tekrar çekilir.
    await waitFor(() => expect(apiMock.getClient).toHaveBeenCalledTimes(2));
  });

  it('primary adres silme reddinde backend mesajı aynen gösterilir', async () => {
    apiMock.deleteClientAddress.mockRejectedValue(
      new Error('Bu adres birincil (primary) — silmeden önce başka bir adresi birincil yapın.'),
    );
    await openIdentityTab();

    await waitFor(() => expect(screen.getByText(/Cadde 1/)).toBeTruthy());
    const silButtons = screen.getAllByText('Sil');
    fireEvent.click(silButtons[0]); // addr-1 = primary satır

    await waitFor(() =>
      expect(
        screen.getByText('Bu adres birincil (primary) — silmeden önce başka bir adresi birincil yapın.'),
      ).toBeTruthy(),
    );
  });
});
