import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ClientActionsTab } from '../client-actions-tab';
import { api } from '@/lib/api';

/**
 * WSMR-A4m — MÜVEKKİL İŞLEMLER SEKMESİ, YÜKLEME HATASI RETRY.
 *
 * Bileşen zaten "yüklendi ama boş" ile "yüklenemedi" durumlarını AYRI
 * tutuyordu (`state: 'loading' | 'ready' | 'error'`, `role="alert"` bandı).
 * Eksik olan: kullanıcının görebileceği bir salt-okuma tekrar deneme yolu —
 * hata sonrası sayfayı YENİLEMEDEN kurtulma imkânı yoktu.
 *
 * Erişilebilirlik: `app/(dashboard)/clients/[clientId]/page.tsx:59` →
 * `<ClientProfile>` → `client-profile.tsx:549` → `<ClientActionsTab>`.
 */

vi.mock('@/lib/api', () => ({
  api: { getClientActionCatalog: vi.fn(), getClientOperatingSnapshot: vi.fn() },
}));

const mocked = api as unknown as {
  getClientActionCatalog: ReturnType<typeof vi.fn>;
  getClientOperatingSnapshot: ReturnType<typeof vi.fn>;
};

const CATALOG = { data: [] as unknown[] };
const SNAPSHOT = {
  data: {
    clientId: 'c1',
    health: 'healthy',
    riskLevel: 'low',
    contact: { status: 'complete', missingFields: [], followUpStatus: null, openTaskCount: 0, overdueTaskCount: 0, nextFollowUpAt: null, escalationLevel: null },
    poa: { status: 'active', activeCount: 1, nearestValidUntil: null },
    intake: { status: 'none', latestSubmission: null, latestLink: null },
    notification: { status: 'none', latest: null },
    signals: [],
  },
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('ClientActionsTab — yükleme hatası', () => {
  it('hata: gorunur band + "Tekrar dene" gosterilir', async () => {
    mocked.getClientActionCatalog.mockRejectedValue(new Error('network down'));
    mocked.getClientOperatingSnapshot.mockRejectedValue(new Error('network down'));
    render(<ClientActionsTab clientId="c1" />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('retry BASARILI: band kalkar, ekip verisi gorunur', async () => {
    mocked.getClientActionCatalog
      .mockRejectedValueOnce(new Error('geçici'))
      .mockResolvedValue(CATALOG);
    mocked.getClientOperatingSnapshot
      .mockRejectedValueOnce(new Error('geçici'))
      .mockResolvedValue(SNAPSHOT);
    render(<ClientActionsTab clientId="c1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mocked.getClientActionCatalog).toHaveBeenCalledTimes(2);
  });

  it('basarili yukleme: hata YOK', async () => {
    mocked.getClientActionCatalog.mockResolvedValue(CATALOG);
    mocked.getClientOperatingSnapshot.mockResolvedValue(SNAPSHOT);
    render(<ClientActionsTab clientId="c1" />);

    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
