import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientInfoRequestsTab } from '@/components/client/client-info-requests-tab';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      getClientInfoRequestsForCase: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  getClientInfoRequestsForCase: ReturnType<typeof vi.fn>;
};

const CASES = [
  { id: 'case-1', fileNumber: '2026/1', caseStatus: 'DERDEST' },
  { id: 'case-2', fileNumber: '2026/2', caseStatus: 'ISLEMDE' },
];

const infoRequest = (over: Record<string, unknown> = {}) => ({
  id: 'ir-1',
  caseId: 'case-1',
  clientId: 'client-1',
  emailTo: 'muvekkil@example.com',
  emailSubject: 'Adres bilgisi talebi',
  emailBody: 'Lütfen güncel adresinizi iletiniz.',
  status: 'SENT',
  sentAt: '2026-06-20T00:00:00.000Z',
  reminderCount: 0,
  ...over,
});

function mockInfoRequests() {
  apiMock.getClientInfoRequestsForCase.mockImplementation(async (caseId: string) => {
    if (caseId === 'case-1') return [infoRequest()];
    if (caseId === 'case-2') {
      return [infoRequest({ id: 'ir-2', caseId: 'case-2', status: 'RESPONDED', respondedAt: '2026-06-25T00:00:00.000Z' })];
    }
    return [];
  });
}

describe('ClientInfoRequestsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInfoRequests();
  });

  it('no cases empty state and does not fetch', () => {
    render(<ClientInfoRequestsTab cases={[]} />);

    expect(screen.getByText('Bu müvekkile bağlı dosya yok.')).toBeTruthy();
    expect(apiMock.getClientInfoRequestsForCase).not.toHaveBeenCalled();
  });

  it('one case auto-selects and renders read-only info-request data', async () => {
    render(<ClientInfoRequestsTab cases={[CASES[0]]} />);

    await waitFor(() => expect(screen.getByText('Gönderildi')).toBeTruthy());

    expect(screen.getByText('Dosya: 2026/1 · DERDEST')).toBeTruthy();
    expect(screen.getByText('muvekkil@example.com')).toBeTruthy();
    expect(screen.getByText('Adres bilgisi talebi')).toBeTruthy();
    expect(apiMock.getClientInfoRequestsForCase).toHaveBeenCalledWith('case-1');
  });

  it('multiple cases renders selector using file number and status', async () => {
    render(<ClientInfoRequestsTab cases={CASES} />);

    await waitFor(() => expect(screen.getByText('Gönderildi')).toBeTruthy());

    expect(screen.getByLabelText('Dosya')).toBeTruthy();
    expect(screen.getByText('2026/1 · DERDEST')).toBeTruthy();
    expect(screen.getByText('2026/2 · ISLEMDE')).toBeTruthy();
  });

  it('changing case reloads selected case info-requests', async () => {
    render(<ClientInfoRequestsTab cases={CASES} />);
    await waitFor(() => expect(screen.getByText('Gönderildi')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Dosya'), { target: { value: 'case-2' } });

    await waitFor(() => expect(screen.getByText('Yanıtlandı')).toBeTruthy());
    expect(apiMock.getClientInfoRequestsForCase).toHaveBeenLastCalledWith('case-2');
    expect(screen.queryByText('Gönderildi')).toBeNull();
  });

  it('renders empty state when case has no info requests', async () => {
    apiMock.getClientInfoRequestsForCase.mockResolvedValueOnce([]);
    render(<ClientInfoRequestsTab cases={[CASES[0]]} />);

    await waitFor(() => expect(screen.getByText('Bu dosya için bilgi talebi yok.')).toBeTruthy());
  });

  it('renders error state when fetch fails', async () => {
    apiMock.getClientInfoRequestsForCase.mockRejectedValueOnce(new Error('network'));
    render(<ClientInfoRequestsTab cases={[CASES[0]]} />);

    await waitFor(() => expect(screen.getByText('Bilgi talepleri yüklenemedi.')).toBeTruthy());
  });

  it('is read-only: introduces no mutation buttons', async () => {
    render(<ClientInfoRequestsTab cases={[CASES[0]]} />);

    await waitFor(() => expect(screen.getByText('Gönderildi')).toBeTruthy());
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
