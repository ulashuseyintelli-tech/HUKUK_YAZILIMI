/**
 * G1 GUARD — TemplateEngineService.getCaseData() ClaimItem itemType okuma testi (T3).
 *
 * G1 sonrası dosyada claimItems oluşur → template-engine kaynağı claimItems'a kayar.
 * ClaimItem alanı `itemType` (Due'da `type`). Guard (`item.type || item.itemType`)
 * olmadan tüm kalemler PRINCIPAL'a yığılır (faiz/masraf 0 → hukuken yanlış belge).
 */

import { TemplateEngineService } from '../template-engine.service';

describe('TemplateEngineService.getCaseData — ClaimItem itemType guard (G1)', () => {
  function buildService(opts: { dues?: any[]; claimItems?: any[]; principalAmount?: number }) {
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
          principalAmount: opts.principalAmount ?? 0,
          executionOffice: null,
          caseClients: [],
          lawyers: [],
          debtors: [
            {
              role: 'ASIL_BORCLU',
              selectedAddress: null,
              debtor: {
                type: 'INDIVIDUAL',
                name: 'Aktif Borclu',
                debtorAddresses: [],
              },
            },
          ],
          dues: opts.dues ?? [],
          claimItems: opts.claimItems ?? [],
        })),
      },
    };
    const feeEngine: any = { getInterestRate: () => 0 };
    return new TemplateEngineService(prisma, feeEngine);
  }

  it('ClaimItem (itemType) → principal/interest/fees doğru ayrışır (yığılmaz)', async () => {
    const svc = buildService({
      claimItems: [
        { itemType: 'PRINCIPAL', amount: 1000 },
        { itemType: 'INTEREST', amount: 200 },
        { itemType: 'EXPENSE', amount: 50 },
      ],
    });

    const data: any = await (svc as any).getCaseData('case-1');

    expect(data.totals.principal).toBe(1000);
    expect(data.totals.interest).toBe(200);
    expect(data.totals.fees).toBe(50);
    expect(data.totals.total).toBe(1250);
  });

  it('regresyon: eski Due yolu (type) hâlâ doğru çalışır', async () => {
    const svc = buildService({
      dues: [
        { type: 'PRINCIPAL', amount: 800 },
        { type: 'INTEREST', amount: 120 },
      ],
    });

    const data: any = await (svc as any).getCaseData('case-1');

    expect(data.totals.principal).toBe(800);
    expect(data.totals.interest).toBe(120);
  });
});
