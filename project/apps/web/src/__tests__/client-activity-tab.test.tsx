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

const timelineResponse = (items: Array<Record<string, unknown>> = []) => ({
  data: {
    data: items,
    pageInfo: {
      nextCursor: null,
      hasNextPage: false,
      limit: 25,
    },
  },
});

const notificationItem = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  source: 'client_notification',
  eventType: 'NOTIFICATION_SENT',
  title: 'Dosya bilgilendirmesi',
  summary: 'Email notification: sent',
  status: 'SENT',
  occurredAt: '2026-06-21T09:00:00.000Z',
  caseId: null,
  metadataSafe: {
    channel: 'EMAIL',
    notificationType: 'GENEL_BILGILENDIRME',
  },
  body: 'Bu alan UI tarafında gösterilmemeli',
  ...over,
});

const intakeItem = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  source: 'intake_submission',
  eventType: 'INTAKE_SUBMITTED',
  title: 'Intake submission received',
  summary: 'Client submitted the canonical intake form.',
  status: 'CLIENT_SUBMITTED',
  occurredAt: '2026-06-22T10:30:00.000Z',
  caseId: 'case-1',
  ...over,
});

describe('ClientActivityTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue(timelineResponse());
  });

  it('renders loading state while fetching', () => {
    apiMock.get.mockReturnValue(new Promise(() => {}));

    render(<ClientActivityTab clientId="client-1" />);

    expect(screen.getByText('Aktivite yükleniyor...')).toBeTruthy();
  });

  it('renders empty state and calls client timeline endpoint', async () => {
    render(<ClientActivityTab clientId="client-1" />);

    await waitFor(() => {
      expect(screen.getByText('Bu müvekkil için kayıtlı bildirim aktivitesi yok.')).toBeTruthy();
    });
    expect(apiMock.get).toHaveBeenCalledWith(
      '/clients/client-1/timeline?limit=25&sources=client_notification,intake_submission',
    );
  });

  it('renders error state when client timeline request fails', async () => {
    apiMock.get.mockRejectedValue(new Error('timeline failed'));

    render(<ClientActivityTab clientId="client-1" />);

    await waitFor(() => {
      expect(screen.getByText('Bildirim aktivitesi yüklenemedi.')).toBeTruthy();
    });
  });

  it('renders notification timeline rows without full body', async () => {
    apiMock.get.mockResolvedValue(timelineResponse([notificationItem()]));

    render(<ClientActivityTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Dosya bilgilendirmesi')).toBeTruthy());
    expect(screen.getByText('Email notification: sent')).toBeTruthy();
    expect(screen.getByText('Bilgilendirme')).toBeTruthy();
    expect(screen.getByText('E-posta')).toBeTruthy();
    expect(screen.getByText('Gönderildi')).toBeTruthy();
    expect(screen.queryByText('Bu alan UI tarafında gösterilmemeli')).toBeNull();
  });

  it('renders intake submission items in the same activity list', async () => {
    apiMock.get.mockResolvedValue(timelineResponse([notificationItem(), intakeItem()]));

    render(<ClientActivityTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Intake submission received')).toBeTruthy());
    expect(screen.getByText('Client submitted the canonical intake form.')).toBeTruthy();
    expect(screen.getByText('Intake')).toBeTruthy();
    expect(screen.getByText('Yeni gönderim')).toBeTruthy();
    expect(screen.getByText('Dosya bilgilendirmesi')).toBeTruthy();
  });

  it('renders failed notification safely from timeline summary without errorMessage', async () => {
    apiMock.get.mockResolvedValue(
      timelineResponse([
        notificationItem({
          id: 'n-failed',
          eventType: 'NOTIFICATION_FAILED',
          title: 'Gönderim hatası',
          summary: 'SMS notification: failed',
          status: 'FAILED',
          metadataSafe: {
            channel: 'SMS',
            notificationType: 'HATIRLATMA',
          },
        }),
      ]),
    );

    render(<ClientActivityTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Gönderim hatası')).toBeTruthy());
    expect(screen.getByText('SMS notification: failed')).toBeTruthy();
    expect(screen.getByText('Hatırlatma')).toBeTruthy();
    expect(screen.getByText('SMS')).toBeTruthy();
    expect(screen.getByText('Başarısız')).toBeTruthy();
    expect(screen.queryByText('SMTP bağlantısı reddedildi')).toBeNull();
  });

  it('does not introduce mutation controls', async () => {
    apiMock.get.mockResolvedValue(timelineResponse([notificationItem()]));

    render(<ClientActivityTab clientId="client-1" />);

    await waitFor(() => expect(screen.getByText('Dosya bilgilendirmesi')).toBeTruthy());
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
