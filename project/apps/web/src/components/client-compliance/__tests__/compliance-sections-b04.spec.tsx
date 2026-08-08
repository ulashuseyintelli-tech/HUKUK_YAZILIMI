import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SpecialCategorySection } from '@/components/client-compliance/SpecialCategorySection';
import { EffectiveCapabilitySection } from '@/components/client-compliance/EffectiveCapabilitySection';

/**
 * CAD C2-B04 kabul kanıtları:
 *  [1] özel nitelikli veri VARSAYILAN GİZLİ — liste içerik göstermez, yalnız üst-veri;
 *      açma AYRI istektir
 *  [2] içerik açma reddi (K7.3 anahtar-yok) GEREKÇESİYLE görünür (role=alert)
 *  [3] efektif capability backend'ten PROJEKTE — allowed/reasonCode/basisPoaIds gösterilir,
 *      UI yeniden hesaplamaz
 *  [4] fail-closed hiçbir yerde sessiz değil; çağrılar yalnız clientId/recordId taşır
 */

const listRecords = vi.fn();
const readRecord = vi.fn();
const effectiveCapabilities = vi.fn();
const actionCatalog = vi.fn();

vi.mock('@/lib/api/client-compliance', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/api/client-compliance')>();
  return {
    ...orig,
    clientComplianceSpecialCategoryApi: {
      listRecords: (...a: unknown[]) => listRecords(...a),
      readRecord: (...a: unknown[]) => readRecord(...a),
    },
    clientComplianceCapabilityApi: {
      effectiveCapabilities: (...a: unknown[]) => effectiveCapabilities(...a),
      actionCatalog: (...a: unknown[]) => actionCatalog(...a),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  listRecords.mockReset(); readRecord.mockReset();
  effectiveCapabilities.mockReset(); actionCatalog.mockReset();
});

describe('SpecialCategorySection (B04)', () => {
  it('[1] liste yalnız kategori+üstveri gösterir, içerik YOK; "İçeriği aç" ayrı aksiyon', async () => {
    listRecords.mockResolvedValue([
      { id: 's1', category: 'HEALTH', createdByUserId: 'u9', createdAt: '2026-08-05T08:00:00Z' },
    ]);
    wrap(<SpecialCategorySection clientId="c1" />);

    expect(await screen.findByText('HEALTH')).toBeTruthy();
    expect(screen.getByRole('button', { name: /İçeriği aç/ })).toBeTruthy();
    // içerik listede render edilmedi (readRecord çağrılmadan içerik yok)
    expect(readRecord).not.toHaveBeenCalled();
    expect(listRecords).toHaveBeenCalledWith('c1');
  });

  it('[2] içerik açma K7.3 anahtar-yok reddi gerekçesiyle alert', async () => {
    listRecords.mockResolvedValue([
      { id: 's1', category: 'HEALTH', createdByUserId: 'u9', createdAt: '2026-08-05T08:00:00Z' },
    ]);
    readRecord.mockRejectedValue({
      response: { status: 400, data: { message: 'Özel nitelikli veri anahtarı yapılandırılmamış — işlem fail-closed reddedildi (K7.3)' } },
    });
    wrap(<SpecialCategorySection clientId="c1" />);
    (await screen.findByRole('button', { name: /İçeriği aç/ })).click();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('K7.3');
  });

  it('[4] liste hatası gerekçesiyle alert (sessiz değil)', async () => {
    listRecords.mockRejectedValue({ response: { status: 403, data: { message: 'Elevated yetki gerekli' } } });
    wrap(<SpecialCategorySection clientId="c1" />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Elevated yetki gerekli');
  });
});

describe('EffectiveCapabilitySection (B04)', () => {
  it('[3] capability backend kararını projekte eder: durum + gerekçe + dayanak POA', async () => {
    effectiveCapabilities.mockResolvedValue({
      canCollect: { capability: 'canCollect', allowed: true, reasonCode: 'ALLOWED', basisPoaIds: ['poa-1'] },
      canWaive: { capability: 'canWaive', allowed: false, reasonCode: 'NO_VALID_POA', basisPoaIds: [] },
      canSettle: { capability: 'canSettle', allowed: false, reasonCode: 'POA_SCOPE_NOT_COVERED', basisPoaIds: [] },
      canRelease: { capability: 'canRelease', allowed: false, reasonCode: 'FLAT_FLAG_RESTRICTION', basisPoaIds: [] },
    });
    actionCatalog.mockResolvedValue([
      { key: 'poa.reminder.send', label: 'POA hatırlatma gönder', category: 'poa', enabled: false, disabledReason: 'Geçerli POA yok', visibility: 'visible', dangerLevel: 'low' },
    ]);
    wrap(<EffectiveCapabilitySection clientId="c1" />);

    expect(await screen.findByText('Tahsil')).toBeTruthy();
    expect(screen.getByText('Geçerli POA kapsıyor')).toBeTruthy();
    expect(screen.getByText('poa-1')).toBeTruthy();
    expect(screen.getByText('Geçerli POA yok')).toBeTruthy();
    // action catalog projeksiyonu
    expect(screen.getByText('POA hatırlatma gönder')).toBeTruthy();
    expect(effectiveCapabilities).toHaveBeenCalledWith('c1');
  });

  it('[4] capability hatası gerekçesiyle alert', async () => {
    effectiveCapabilities.mockRejectedValue({ response: { status: 500, data: { message: 'Sunucu hatası' } } });
    actionCatalog.mockResolvedValue([]);
    wrap(<EffectiveCapabilitySection clientId="c1" />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Efektif yetki alınamadı');
  });
});
