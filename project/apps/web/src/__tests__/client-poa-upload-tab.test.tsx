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
      uploadClientWorkspacePoaFile: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  getClient: ReturnType<typeof vi.fn>;
  getCases: ReturnType<typeof vi.fn>;
  getClientActionCatalog: ReturnType<typeof vi.fn>;
  getClientOperatingSnapshot: ReturnType<typeof vi.fn>;
  uploadClientWorkspacePoaFile: ReturnType<typeof vi.fn>;
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

function clientWithPoa(fileSize: number | null = null) {
  return {
    id: 'client-1',
    type: 'PERSON',
    displayName: 'Ada Client',
    firstName: 'Ada',
    lastName: 'Client',
    tckn: '12345678901',
    phone: '555',
    email: 'ada@example.test',
    contacts: [],
    addresses: [],
    powerOfAttorneys: [
      {
        id: 'poa-1',
        notaryName: '1. Noter',
        notaryCity: 'Istanbul',
        journalNo: '2026/1',
        dateIssued: '2026-01-01T00:00:00.000Z',
        status: 'ACTIVE',
        isLimited: false,
        fileSize,
        mimeType: fileSize ? 'application/pdf' : null,
        filePath: 'C:/secret/storage/poa.pdf',
      },
    ],
  };
}

describe('ClientProfile POA upload tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getCases.mockResolvedValue({ data: [] });
    apiMock.getClientActionCatalog.mockResolvedValue({ data: [] });
    apiMock.getClientOperatingSnapshot.mockResolvedValue({ data: snapshot });
    apiMock.uploadClientWorkspacePoaFile.mockResolvedValue({
      clientId: 'client-1',
      poaId: 'poa-1',
      hasFile: true,
      fileSize: 2 * 1024 * 1024,
      mimeType: 'application/pdf',
      filePath: 'C:/secret/storage/poa.pdf',
    });
  });

  it('uploads from the POA row through the safe workspace endpoint wrapper and refreshes client state', async () => {
    apiMock.getClient
      .mockResolvedValueOnce({ data: clientWithPoa(null) })
      .mockResolvedValueOnce({ data: clientWithPoa(2 * 1024 * 1024) });

    render(<ClientProfile clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Ada Client')).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: /Vekalet/ }));

    expect(screen.getByText('Dosya kayıtlı değil')).toBeTruthy();
    const file = new File(['poa'], 'poa.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Vekalet dosyası yükle'), { target: { files: [file] } });

    await waitFor(() => expect(apiMock.uploadClientWorkspacePoaFile).toHaveBeenCalledWith('client-1', 'poa-1', file));
    await waitFor(() => expect(screen.getByText(/Dosya yüklendi/)).toBeTruthy());
    expect(apiMock.getClient.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/application\/pdf/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/secret/)).toBeNull();
    expect(screen.queryByText(/filePath/)).toBeNull();
  });

  it('shows a safe failure message without leaking internal paths', async () => {
    apiMock.getClient.mockResolvedValue({ data: clientWithPoa(null) });
    apiMock.uploadClientWorkspacePoaFile.mockRejectedValue(new Error('C:/secret/storage failed'));

    render(<ClientProfile clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Ada Client')).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: /Vekalet/ }));
    const file = new File(['bad'], 'bad.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByLabelText('Vekalet dosyası yükle'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Dosya yüklenemedi/)).toBeTruthy());
    expect(screen.queryByText(/secret/)).toBeNull();
    expect(screen.queryByText(/storage/)).toBeNull();
  });
});