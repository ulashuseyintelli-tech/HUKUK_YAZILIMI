import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    },
  };
});

const apiMock = api as unknown as {
  getClient: ReturnType<typeof vi.fn>;
  getCases: ReturnType<typeof vi.fn>;
  getClientActionCatalog: ReturnType<typeof vi.fn>;
  getClientOperatingSnapshot: ReturnType<typeof vi.fn>;
};

const client = {
  id: 'client-1',
  type: 'PERSON',
  displayName: 'Ada Müvekkil',
  firstName: 'Ada',
  lastName: 'Müvekkil',
  tckn: '12345678901',
  phone: '555',
  email: 'ada@example.test',
  contacts: [],
  powerOfAttorneys: [],
};

const snapshot = {
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
  poa: { status: 'active', activeCount: 1, nearestValidUntil: null },
  intake: { status: 'none', latestSubmission: null, latestLink: null },
  notification: { status: 'none', latest: null },
  signals: [],
};

describe('ClientProfile actions tab shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getClient.mockResolvedValue({ data: client });
    apiMock.getCases.mockResolvedValue({ data: [] });
    apiMock.getClientActionCatalog.mockResolvedValue({
      data: [
        {
          key: 'contact.update_missing_info',
          label: 'Update contact information',
          description: 'Open contact screen',
          category: 'contact',
          enabled: true,
          visibility: 'visible',
          dangerLevel: 'low',
          target: { clientId: 'client-1' },
          href: '/clients/client-1/edit',
          order: 10,
        },
      ],
    });
    apiMock.getClientOperatingSnapshot.mockResolvedValue({ data: snapshot });
  });

  it('renders İşlemler tab and loads read-only action shell when selected', async () => {
    render(<ClientProfile clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Ada Müvekkil')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'İşlemler' }));

    await waitFor(() => expect(screen.getByText('İletişim bilgilerini düzenle')).toBeTruthy());
    expect(apiMock.getClientActionCatalog).toHaveBeenCalledWith('client-1');
    expect(apiMock.getClientOperatingSnapshot).toHaveBeenCalledWith('client-1');
  });
});