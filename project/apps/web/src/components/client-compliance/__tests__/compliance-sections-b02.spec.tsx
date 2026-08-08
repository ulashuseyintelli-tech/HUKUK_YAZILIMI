import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConsentRecordsSection } from '@/components/client-compliance/ConsentRecordsSection';
import { DisclosureDeliveriesSection } from '@/components/client-compliance/DisclosureDeliveriesSection';

/**
 * CAD C2-B02 — kabul kanıtları:
 *  [1] salt-görüntü liste + mevcut aksiyon (revoke) render edilir
 *  [2] fail-closed ret GEREKÇESİYLE görünür (role=alert; backend mesajı + reasonCode) —
 *      sessiz boş ekran YASAK
 *  [3] hangi aydınlatma SÜRÜMÜNÜN hangi tarihte teslim edildiği açıkça görünür
 *  [4] tenant izolasyonu ekran seviyesinde: api çağrıları yalnız clientId taşır,
 *      cross-tenant parametre YOK (D-3)
 */

const listConsents = vi.fn();
const listDeliveries = vi.fn();
const listDisclosureTexts = vi.fn();

vi.mock('@/lib/api/client-compliance', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/api/client-compliance')>();
  return {
    ...orig,
    clientComplianceApi: {
      listConsents: (...a: unknown[]) => listConsents(...a),
      grantConsent: vi.fn(),
      revokeConsent: vi.fn(),
      listDeliveries: (...a: unknown[]) => listDeliveries(...a),
      listDisclosureTexts: (...a: unknown[]) => listDisclosureTexts(...a),
      recordDelivery: vi.fn(),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  listConsents.mockReset();
  listDeliveries.mockReset();
  listDisclosureTexts.mockReset();
});

describe('ConsentRecordsSection (B02)', () => {
  it('[1] kayıtları listeler ve aktif kayıtta mevcut aksiyonu (Geri çek) gösterir', async () => {
    listConsents.mockResolvedValue([
      { id: 'c1', activity: 'GREETING', createdAt: '2026-08-01T10:00:00Z', grantedAt: '2026-08-01T10:00:00Z' },
      { id: 'c2', activity: 'MARKETING', createdAt: '2026-08-02T10:00:00Z', revokedAt: '2026-08-03T09:00:00Z' },
    ]);
    wrap(<ConsentRecordsSection clientId="client-1" />);

    expect(await screen.findByText('GREETING')).toBeTruthy();
    expect(screen.getByText('GERİ ÇEKİLDİ')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Geri çek/ })).toBeTruthy();
    // [4] tenant izolasyonu: yalnız clientId — başka parametre yok
    expect(listConsents).toHaveBeenCalledWith('client-1');
  });

  it('[2] fail-closed: backend gerekçesi + reasonCode role=alert içinde görünür', async () => {
    listConsents.mockRejectedValue({
      response: { status: 403, data: { message: 'Rıza görüntüleme yetkisi yok.', reasonCode: 'CLIENT_MUTATION_DENIED_VIEWER' } },
    });
    wrap(<ConsentRecordsSection clientId="client-1" />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Rıza görüntüleme yetkisi yok.');
    expect(alert.textContent).toContain('CLIENT_MUTATION_DENIED_VIEWER');
  });

  it('boş durum sessiz değil — açıklayıcı metin basılır', async () => {
    listConsents.mockResolvedValue([]);
    wrap(<ConsentRecordsSection clientId="client-1" />);
    expect(await screen.findByText(/kayıtlı rıza bulunmuyor/)).toBeTruthy();
  });
});

describe('DisclosureDeliveriesSection (B02)', () => {
  it('[3] teslim satırında SÜRÜM rozeti ve teslim TARİHİ açıkça görünür', async () => {
    listDisclosureTexts.mockResolvedValue([{ id: 't2', version: 2, title: 'KVKK Aydınlatma' }]);
    listDeliveries.mockResolvedValue([
      { id: 'd1', disclosureTextId: 't2', method: 'ELDEN', deliveredAt: '2026-08-05T12:30:00Z' },
    ]);
    wrap(<DisclosureDeliveriesSection clientId="client-1" />);

    expect(await screen.findByText('v2')).toBeTruthy();
    expect(screen.getByText('ELDEN')).toBeTruthy();
    // tarih hücresi boş değil ('—' fallback DEĞİL)
    const rows = screen.getAllByRole('row');
    expect(rows[rows.length - 1].textContent).not.toContain('—');
    expect(listDeliveries).toHaveBeenCalledWith('client-1');
  });

  it('[2] teslim listesi hatası gerekçesiyle alert olarak görünür', async () => {
    listDisclosureTexts.mockResolvedValue([]);
    listDeliveries.mockRejectedValue({ response: { status: 500, data: { message: 'Sunucu hatası' } } });
    wrap(<DisclosureDeliveriesSection clientId="client-1" />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Teslim kayıtları alınamadı');
    expect(alert.textContent).toContain('Sunucu hatası');
  });
});
