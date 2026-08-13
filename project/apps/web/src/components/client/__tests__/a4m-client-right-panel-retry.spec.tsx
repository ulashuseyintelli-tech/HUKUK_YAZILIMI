import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ClientRightPanel } from '../client-right-panel';
import { api } from '@/lib/api';

/**
 * WSMR-A4m — MÜVEKKİL SAĞ OPERASYON PANELİ, YÜKLEME HATASI RETRY.
 *
 * `client-actions-tab.tsx` ile aynı ikiz desen: hata durumu zaten AYRI
 * tutuluyordu, eksik olan salt-okuma tekrar deneme yoluydu.
 *
 * Erişilebilirlik: `clients/[clientId]/page.tsx:59` → `<ClientProfile>` →
 * `client-profile.tsx:556` → `<ClientRightPanel>`.
 */

vi.mock('@/lib/api', () => ({
  api: { getClientOperatingSnapshot: vi.fn(), getClientActionCatalog: vi.fn() },
}));

const mocked = api as unknown as {
  getClientOperatingSnapshot: ReturnType<typeof vi.fn>;
  getClientActionCatalog: ReturnType<typeof vi.fn>;
};

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
const CATALOG = { data: [] as unknown[] };

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

const noop = () => {};

describe('ClientRightPanel — yükleme hatası', () => {
  it('hata: gorunur band + "Tekrar dene" gosterilir', async () => {
    mocked.getClientOperatingSnapshot.mockRejectedValue(new Error('network down'));
    mocked.getClientActionCatalog.mockRejectedValue(new Error('network down'));
    render(<ClientRightPanel clientId="c1" onNavigateActions={noop} />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('retry BASARILI: band kalkar', async () => {
    mocked.getClientOperatingSnapshot
      .mockRejectedValueOnce(new Error('geçici'))
      .mockResolvedValue(SNAPSHOT);
    mocked.getClientActionCatalog
      .mockRejectedValueOnce(new Error('geçici'))
      .mockResolvedValue(CATALOG);
    render(<ClientRightPanel clientId="c1" onNavigateActions={noop} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mocked.getClientOperatingSnapshot).toHaveBeenCalledTimes(2);
  });

  it('basarili yukleme: hata YOK', async () => {
    mocked.getClientOperatingSnapshot.mockResolvedValue(SNAPSHOT);
    mocked.getClientActionCatalog.mockResolvedValue(CATALOG);
    render(<ClientRightPanel clientId="c1" onNavigateActions={noop} />);

    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
