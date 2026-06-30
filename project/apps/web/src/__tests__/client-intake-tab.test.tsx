import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientIntakeTab } from '@/components/client/client-intake-tab';
import { api, type IntakeSubmissionStatus } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      listIntakeLinks: vi.fn(),
      listIntakeSubmissions: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  listIntakeLinks: ReturnType<typeof vi.fn>;
  listIntakeSubmissions: ReturnType<typeof vi.fn>;
};

const CASES = [
  { id: 'case-1', fileNumber: '2026/1', caseStatus: 'DERDEST' },
  { id: 'case-2', fileNumber: '2026/2', caseStatus: 'ISLEMDE' },
];

const SUBMISSION_STATUSES: IntakeSubmissionStatus[] = [
  'CLIENT_SUBMITTED',
  'IN_REVIEW',
  'PARTIALLY_PROMOTED',
  'COMPLETED',
  'REJECTED',
];

const link = (over: Record<string, unknown> = {}) => ({
  id: 'link-1',
  tenantId: 't',
  caseId: 'case-1',
  clientId: 'client-1',
  status: 'ACTIVE',
  scope: ['INCOME_SOURCE', 'ADDRESS'],
  expiresAt: null,
  maxUses: 1,
  useCount: 0,
  createdById: 'u1',
  createdAt: '2026-06-20T00:00:00.000Z',
  ...over,
});

const submission = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  tenantId: 't',
  intakeLinkId: 'link-1',
  caseId: 'case-1',
  clientId: 'client-1',
  status: 'CLIENT_SUBMITTED',
  submittedAt: '2026-06-21T00:00:00.000Z',
  claimedById: null,
  claimedAt: null,
  reviewedById: null,
  reviewedAt: null,
  createdAt: '2026-06-21T00:00:00.000Z',
  ...over,
});

function mockIntakeData() {
  apiMock.listIntakeLinks.mockImplementation(async (caseId: string) => [link({ caseId })]);
  apiMock.listIntakeSubmissions.mockImplementation(async ({ caseId, status }) => {
    if (caseId === 'case-1' && status === 'CLIENT_SUBMITTED') return [submission()];
    if (caseId === 'case-2' && status === 'COMPLETED') {
      return [submission({ id: 'sub-2', caseId: 'case-2', status: 'COMPLETED' })];
    }
    return [];
  });
}

describe('ClientIntakeTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIntakeData();
  });

  it('no cases empty state and does not fetch intake data', () => {
    render(<ClientIntakeTab cases={[]} />);

    expect(screen.getByText('Bu müvekkile bağlı dosya yok.')).toBeTruthy();
    expect(apiMock.listIntakeLinks).not.toHaveBeenCalled();
    expect(apiMock.listIntakeSubmissions).not.toHaveBeenCalled();
  });

  it('one case auto-selects and renders read-only intake data', async () => {
    render(<ClientIntakeTab cases={[CASES[0]]} />);

    await waitFor(() => expect(screen.getByText('Yeni gönderim')).toBeTruthy());

    expect(screen.getByText('Dosya: 2026/1 · DERDEST')).toBeTruthy();
    expect(screen.getByText('Aktif')).toBeTruthy();
    expect(screen.getByText('Gelir Kaynağı, Adres')).toBeTruthy();
    expect(apiMock.listIntakeLinks).toHaveBeenCalledWith('case-1');
    for (const status of SUBMISSION_STATUSES) {
      expect(apiMock.listIntakeSubmissions).toHaveBeenCalledWith({ caseId: 'case-1', status });
    }
  });

  it('multiple cases renders selector using file number and status', async () => {
    render(<ClientIntakeTab cases={CASES} />);

    await waitFor(() => expect(screen.getByText('Yeni gönderim')).toBeTruthy());

    expect(screen.getByLabelText('Dosya')).toBeTruthy();
    expect(screen.getByText('2026/1 · DERDEST')).toBeTruthy();
    expect(screen.getByText('2026/2 · ISLEMDE')).toBeTruthy();
  });

  it('changing case reloads selected case intake submissions', async () => {
    render(<ClientIntakeTab cases={CASES} />);
    await waitFor(() => expect(screen.getByText('Yeni gönderim')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Dosya'), { target: { value: 'case-2' } });

    await waitFor(() => expect(screen.getByText('Tamamlandı')).toBeTruthy());
    expect(apiMock.listIntakeLinks).toHaveBeenLastCalledWith('case-2');
    expect(screen.queryByText('Yeni gönderim')).toBeNull();
  });

  it('links to existing intake workflow and introduces no mutation buttons', async () => {
    render(<ClientIntakeTab cases={[CASES[0]]} />);

    await waitFor(() => expect(screen.getByText('Detaylı incelemeye git')).toBeTruthy());

    expect(screen.getByText('Detaylı incelemeye git').closest('a')?.getAttribute('href')).toBe('/client-intake/sub-1');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});