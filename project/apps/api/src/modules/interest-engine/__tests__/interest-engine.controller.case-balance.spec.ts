/**
 * G4c-2 thin controller test — GET /interest-engine/case/:caseId/balance.
 * Delegasyon + asOfDate default + tenantId auth-context'ten (client'tan değil).
 */

import { InterestEngineController } from '../interest-engine.controller';
import type { CaseBalanceService, CaseBalanceResult } from '../orchestration/case-balance.service';
import { buildCaseBalanceFeeProjection } from '../orchestration/case-balance-fee-projection';

function makeController(computeCaseBalance: jest.Mock): InterestEngineController {
  const caseBalance = { computeCaseBalance } as unknown as CaseBalanceService;
  // Diğer 4 bağımlılık getCaseBalance tarafından KULLANILMAZ → boş mock.
  return new InterestEngineController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    caseBalance,
  );
}

const fakeResult: CaseBalanceResult = {
  asOfDate: '2025-06-01',
  source: 'NONE',
  currencyResults: [],
  projections: { costs: {}, ancillaries: {} },
  feeProjection: buildCaseBalanceFeeProjection({ sourceItems: [], currencyResults: [] }),
  diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
  overpayments: { held: [], blocked: [] },
};

describe('InterestEngineController.getCaseBalance (G4c-2)', () => {
  it('delegasyon: (tenantId, caseId, asOfDate) → computeCaseBalance; sonuç aynen döner', async () => {
    const compute = jest.fn().mockResolvedValue(fakeResult);
    const controller = makeController(compute);

    const res = await controller.getCaseBalance('tenant-1', 'case-9', '2025-06-01');

    expect(compute).toHaveBeenCalledWith('tenant-1', 'case-9', '2025-06-01');
    expect(res).toBe(fakeResult);
  });

  it('asOfDate yoksa → Türkiye takvimine göre bugün (K3-L KP-11; TSİ 02:30 anında UTC günü değil)', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-30T23:30:00.000Z') });
    try {
      const compute = jest.fn().mockResolvedValue(fakeResult);
      const controller = makeController(compute);

      await controller.getCaseBalance('tenant-1', 'case-9', undefined);
      await controller.getCaseBalanceDisplay('tenant-1', 'case-9', undefined);

      // UTC günü 2026-09-30 olurdu; Türkiye takvimine göre 2026-10-01
      expect(compute).toHaveBeenNthCalledWith(1, 'tenant-1', 'case-9', '2026-10-01');
      expect(compute).toHaveBeenNthCalledWith(2, 'tenant-1', 'case-9', '2026-10-01');
    } finally {
      jest.useRealTimers();
    }
  });

  it('tenantId auth-context argümanından forward edilir (client/body/param değil)', async () => {
    const compute = jest.fn().mockResolvedValue(fakeResult);
    const controller = makeController(compute);

    await controller.getCaseBalance('tenant-AUTH', 'case-9', '2025-06-01');

    // computeCaseBalance'a giden tenantId = decorator'dan gelen argüman
    expect(compute.mock.calls[0][0]).toBe('tenant-AUTH');
  });

  it('display contract tenantId auth-context argümanını taşır', async () => {
    const compute = jest.fn().mockResolvedValue({
      ...fakeResult,
      asOfDate: '2025-06-01',
      currencyResults: [
        {
          currency: 'TRY',
          result: {
            totalInterest: 0,
            totalDue: 0,
            allocations: [],
            engineVersion: 'engine-v1',
            segments: [],
          },
        },
      ],
    });
    const controller = makeController(compute);

    const res = await controller.getCaseBalanceDisplay('tenant-AUTH', 'case-9', '2025-06-01');

    expect(compute).toHaveBeenCalledWith('tenant-AUTH', 'case-9', '2025-06-01');
    expect(res.tenantId).toBe('tenant-AUTH');
    expect(res.caseId).toBe('case-9');
    expect(res.authority).toBe('SHADOW_ONLY');
    expect(res.provenance.legacyCalculationSummaryUsed).toBe(false);
  });
});
