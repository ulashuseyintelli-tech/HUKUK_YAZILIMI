/**
 * CLIENT-ARC-07-OFFICIAL-CONSUMER-ADAPTER-I07 — template-engine alacaklı adresi retarget'ı.
 *
 * `getCaseData()`'nın `creditors[]` projeksiyonu artık ORTAK `resolveClientAddress()` kullanır.
 * Borçlu (debtor) adres yolu (`selectedAddress`/`debtorAddresses`) DOKUNULMADI — kapsam dışı.
 */
import { TemplateEngineService } from '../template-engine.service';

describe('ARC-07 I07 — TemplateEngineService.getCaseData creditors[] adres retarget', () => {
  function buildService(caseClients: any[]) {
    const prisma: any = {
      case: {
        findFirst: jest.fn(async () => ({
          fileNumber: '2026/1',
          startDate: new Date('2026-01-01'),
          type: 'GENERAL_EXECUTION',
          subCategory: 'GENEL',
          executionPath: 'HACIZ',
          hasCollateral: false,
          currency: 'TRY',
          principalAmount: 0,
          executionOffice: null,
          caseClients,
          lawyers: [],
          debtors: [
            {
              role: 'ASIL_BORCLU',
              selectedAddress: null,
              debtor: { type: 'INDIVIDUAL', name: 'Aktif Borclu', debtorAddresses: [] },
            },
          ],
          dues: [],
          claimItems: [],
        })),
      },
    };
    const feeEngine: any = { getInterestRate: () => 0 };
    return new TemplateEngineService(prisma, feeEngine);
  }

  it('[1] yapısal BİRİNCİL ClientAddress VARSA creditors[].address ONDAN üretilir', async () => {
    const svc = buildService([
      {
        client: {
          type: 'INDIVIDUAL',
          displayName: 'Ada Müvekkil',
          tckn: '12345678901',
          vkn: null,
          address: 'Legacy Cadde',
          city: 'LegacyŞehir',
          district: 'LegacyİlçE',
          addresses: [{ street: 'Yapısal Cadde', city: 'İstanbul', district: 'Kadıköy', isPrimary: true }],
        },
      },
    ]);
    const data: any = await (svc as any).getCaseData('case-1', 'tenant-1');
    expect(data.creditors[0]).toMatchObject({
      address: 'Yapısal Cadde, Kadıköy/İstanbul',
      city: 'İstanbul',
      district: 'Kadıköy',
    });
  });

  it('[2] yapısal satır YOKSA legacy flat kolona AÇIKÇA düşer (davranış korunur)', async () => {
    const svc = buildService([
      {
        client: {
          type: 'INDIVIDUAL',
          displayName: 'Ada Müvekkil',
          tckn: '12345678901',
          vkn: null,
          address: 'Legacy Cadde',
          city: 'İstanbul',
          district: 'Kadıköy',
          addresses: [],
        },
      },
    ]);
    const data: any = await (svc as any).getCaseData('case-1', 'tenant-1');
    expect(data.creditors[0]).toMatchObject({ address: 'Legacy Cadde, Kadıköy/İstanbul', city: 'İstanbul', district: 'Kadıköy' });
  });

  it('[3] `addresses` HİÇ verilmemişse (I01 öncesi çağıran şekli) legacy\'e düşer', async () => {
    const svc = buildService([
      { client: { type: 'INDIVIDUAL', displayName: 'Ada', address: 'Cadde', city: 'İstanbul', district: null } },
    ]);
    const data: any = await (svc as any).getCaseData('case-1', 'tenant-1');
    expect(data.creditors[0].address).toBe('Cadde, İstanbul');
  });

  it('[4] hiçbir kaynak yoksa address/city/district undefined döner (çökme YOK)', async () => {
    const svc = buildService([
      { client: { type: 'INDIVIDUAL', displayName: 'Ada', address: null, city: null, district: null, addresses: [] } },
    ]);
    const data: any = await (svc as any).getCaseData('case-1', 'tenant-1');
    expect(data.creditors[0].address).toBeUndefined();
    expect(data.creditors[0].city).toBeUndefined();
    expect(data.creditors[0].district).toBeUndefined();
  });

  it('[5] çok alacaklı — HER biri KENDİ resolver sonucunu alır (çapraz sızma yok)', async () => {
    const svc = buildService([
      {
        client: {
          type: 'INDIVIDUAL',
          displayName: 'Ada',
          address: 'A Cadde',
          city: 'Ankara',
          addresses: [],
        },
      },
      {
        client: {
          type: 'INDIVIDUAL',
          displayName: 'Beste',
          address: 'Legacy B',
          city: 'LegacyB',
          addresses: [{ street: 'B Cadde', city: 'İzmir', isPrimary: true }],
        },
      },
    ]);
    const data: any = await (svc as any).getCaseData('case-1', 'tenant-1');
    expect(data.creditors[0].address).toBe('A Cadde, Ankara');
    expect(data.creditors[1].address).toBe('B Cadde, İzmir');
  });

  it('[6] borçlu adres yolu (selectedAddress/debtorAddresses) DEĞİŞMEDİ — kapsam dışı regresyon yok', async () => {
    const prisma: any = {
      case: {
        findFirst: jest.fn(async () => ({
          fileNumber: '2026/1',
          startDate: new Date('2026-01-01'),
          type: 'GENERAL_EXECUTION',
          subCategory: 'GENEL',
          executionPath: 'HACIZ',
          hasCollateral: false,
          currency: 'TRY',
          principalAmount: 0,
          executionOffice: null,
          caseClients: [],
          lawyers: [],
          debtors: [
            {
              role: 'ASIL_BORCLU',
              selectedAddress: { street: 'Seçili Sokak', city: 'Bursa', district: 'Osmangazi' },
              debtor: { type: 'INDIVIDUAL', name: 'Borçlu', debtorAddresses: [] },
            },
          ],
          dues: [],
          claimItems: [],
        })),
      },
    };
    const svc = new TemplateEngineService(prisma, { getInterestRate: () => 0 } as any);
    const data: any = await (svc as any).getCaseData('case-1', 'tenant-1');
    expect(data.debtors[0].address).toBe('Seçili Sokak');
  });
});
