import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DsarRequestsSection } from '@/components/client-compliance/DsarRequestsSection';
import { LegalHoldSection } from '@/components/client-compliance/LegalHoldSection';

/**
 * CAD C2-B03 kabul kanıtları:
 *  [1] DSAR durum makinesi BACKEND'ten projekte edilir — aksiyon butonu yalnız
 *      durumun izin verdiği geçişte (RECEIVED→İncelemeye al; RESPONDED'da buton YOK)
 *  [2] Aktif hold: kısıtlanan silme yolu GÖRÜNÜR-kısıtlı açıklamayla; sahte aktif yok
 *  [3] 8-koşullu gate'in karşılanmayan gerekçeleri AÇIK listelenir (unmetConditions)
 *  [4] fail-closed retler role=alert gerekçesiyle; çağrılar yalnız clientId taşır (D-3)
 */

const listRequests = vi.fn();
const listHolds = vi.fn();
const evaluateDeletion = vi.fn();

vi.mock('@/lib/api/client-compliance', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/api/client-compliance')>();
  return {
    ...orig,
    clientComplianceDsarApi: {
      listRequests: (...a: unknown[]) => listRequests(...a),
      createRequest: vi.fn(), startReview: vi.fn(), assign: vi.fn(), respond: vi.fn(),
    },
    clientComplianceLegalHoldApi: {
      listHolds: (...a: unknown[]) => listHolds(...a),
      placeHold: vi.fn(), requestRelease: vi.fn(), approveRelease: vi.fn(),
      evaluateDeletion: (...a: unknown[]) => evaluateDeletion(...a),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => { listRequests.mockReset(); listHolds.mockReset(); evaluateDeletion.mockReset(); });

describe('DsarRequestsSection (B03)', () => {
  it('[1] durum projeksiyonu: RECEIVED satırında "İncelemeye al"; RESPONDED satırında aksiyon YOK', async () => {
    listRequests.mockResolvedValue([
      { id: 'r1', clientId: 'c1', type: 'INFORMATION', channel: 'WRITTEN', status: 'RECEIVED', receivedAt: '2026-08-01T09:00:00Z' },
      { id: 'r2', clientId: 'c1', type: 'ACCESS_CONFIRMATION', channel: 'KEP', status: 'RESPONDED', receivedAt: '2026-08-01T09:00:00Z', respondedAt: '2026-08-02T10:00:00Z' },
    ]);
    wrap(<DsarRequestsSection clientId="c1" />);

    expect(await screen.findByRole('button', { name: 'İncelemeye al' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yanıtla' })).toBeNull();
    expect(screen.getByText('YANITLANDI')).toBeTruthy();
    expect(listRequests).toHaveBeenCalledWith('c1'); // [4] yalnız clientId
  });

  it('[4] liste hatası gerekçesiyle alert', async () => {
    listRequests.mockRejectedValue({ response: { status: 403, data: { message: 'DSAR görüntüleme yetkisi yok.' } } });
    listHolds.mockResolvedValue([]);
    wrap(<DsarRequestsSection clientId="c1" />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('DSAR görüntüleme yetkisi yok.');
  });
});

describe('LegalHoldSection (B03)', () => {
  it('[2] aktif hold: görünür-kısıtlı açıklama var; RELEASED satırında release aksiyonu YOK', async () => {
    listHolds.mockResolvedValue([
      { id: 'h1', clientId: 'c1', scopeType: 'CLIENT', reason: 'Derdest dava', status: 'ACTIVE' },
      { id: 'h2', clientId: 'c1', scopeType: 'CLIENT', reason: 'Eski', status: 'RELEASED' },
    ]);
    wrap(<LegalHoldSection clientId="c1" />);

    expect(await screen.findByTestId('deletion-restricted')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kaldırma talep et' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Kaldırmayı onayla/ })).toBeNull();
    expect(listHolds).toHaveBeenCalledWith('c1');
  });

  it('[1] RELEASE_REQUESTED satırında yalnız 2. adım onayı görünür', async () => {
    listHolds.mockResolvedValue([
      { id: 'h1', clientId: 'c1', scopeType: 'CLIENT', reason: 'X', status: 'RELEASE_REQUESTED' },
    ]);
    wrap(<LegalHoldSection clientId="c1" />);
    expect(await screen.findByRole('button', { name: /Kaldırmayı onayla/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kaldırma talep et' })).toBeNull();
  });

  it('[3] değerlendirme sonucu: karşılanmayan gate gerekçeleri AÇIK listelenir', async () => {
    listHolds.mockResolvedValue([]);
    evaluateDeletion.mockResolvedValue({
      allowed: false,
      unmetConditions: ['NO_ACTIVE_LEGAL_HOLD', 'AUTHORIZED_DELETION_METHOD_SELECTED'],
    });
    wrap(<LegalHoldSection clientId="c1" />);

    (await screen.findByRole('button', { name: 'Değerlendir' })).click();
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('SAĞLANMIYOR');
    expect(status.textContent).toContain('NO_ACTIVE_LEGAL_HOLD');
    expect(status.textContent).toContain('AUTHORIZED_DELETION_METHOD_SELECTED');
  });
});
