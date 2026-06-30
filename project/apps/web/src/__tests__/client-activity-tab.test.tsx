import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientActivityTab } from '@/components/client/client-activity-tab';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  get: ReturnType<typeof vi.fn>;
};

const notification = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  tenantId: 't-1',
  clientId: 'client-1',
  caseId: null,
  channel: 'EMAIL',
  type: 'GENEL_BILGILENDIRME',
  subject: 'Dosya bilgilendirmesi',
  body: 'Bu alan UI tarafında gösterilmemeli',
  status: 'SENT',
  sentAt: '2026-06-21T09:00:00.000Z',
  deliveredAt: null,
  errorMessage: null,
  sentById: 'u-1',
  metadata: null,
  dedupeKey: null,
  createdAt: '2026-06-21T08:58:00.000Z',
  updatedAt: '2026-06-21T09:00:00.000Z',
  ...over,
});

describe('ClientActivityTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({ data: [] });
  });

  it('renders loading state while fetching', () => {
    apiMock.get.mockReturnValue(new Promise(() => {}));

    render(<ClientActivityTab clientId="client-1" />);

    expect(screen.getByText('Aktivite yükleniyor...')).toBeTruthy();
  });

  it('renders empty state and calls client notification endpoint', async () => {
    render(<ClientActivityTab clientId="client-1" />);

    await waitFor(() => {
      expect(screen.getByText('Bu müvekkil için kayıtlı bildirim aktivitesi yok.')).toBeTruthy();
    });
    expect(apiMock.get).toHaveBeenCalledWith('/client-notifications/client/client-1');
  });

  it('renders notification summary rows without full body', async () => {
    apiMock.get.mockResolvedValue({
      data: [notification()],
    });

    render(<ClientActivityTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Dosya bilgilendirmesi')).toBeTruthy());
    expect(screen.getByText('Bilgilendirme')).toBeTruthy();
    expect(screen.getByText('E-posta')).toBeTruthy();
    expect(screen.getByText('Gönderildi')).toBeTruthy();
    expect(screen.queryByText('Bu alan UI tarafında gösterilmemeli')).toBeNull();
  });

  it('renders failed notification error summary safely', async () => {
    apiMock.get.mockResolvedValue({
      data: [
        notification({
          id: 'n-failed',
          channel: 'SMS',
          type: 'HATIRLATMA',
          subject: 'Gönderim hatası',
          status: 'FAILED',
          sentAt: null,
          errorMessage: 'SMTP bağlantısı reddedildi',
        }),
      ],
    });

    render(<ClientActivityTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Gönderim hatası')).toBeTruthy());
    expect(screen.getByText('Hatırlatma')).toBeTruthy();
    expect(screen.getByText('SMS')).toBeTruthy();
    expect(screen.getByText('Başarısız')).toBeTruthy();
    expect(screen.getByText('SMTP bağlantısı reddedildi')).toBeTruthy();
  });

  it('does not introduce mutation controls', async () => {
    apiMock.get.mockResolvedValue({
      data: [notification()],
    });

    render(<ClientActivityTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Dosya bilgilendirmesi')).toBeTruthy());
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});