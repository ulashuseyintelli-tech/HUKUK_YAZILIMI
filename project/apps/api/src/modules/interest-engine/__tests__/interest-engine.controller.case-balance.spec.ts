/**
 * G4c-2 thin controller test — GET /interest-engine/case/:caseId/balance.
 * Delegasyon + asOfDate default + tenantId auth-context'ten (client'tan değil).
 */

import { InterestEngineController } from '../interest-engine.controller';
import type { CaseBalanceService, CaseBalanceResult } from '../orchestration/case-balance.service';

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
  diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
};

describe('InterestEngineController.getCaseBalance (G4c-2)', () => {
  it('delegasyon: (tenantId, caseId, asOfDate) → computeCaseBalance; sonuç aynen döner', async () => {
    const compute = jest.fn().mockResolvedValue(fakeResult);
    const controller = makeController(compute);

    const res = await controller.getCaseBalance('tenant-1', 'case-9', '2025-06-01');

    expect(compute).toHaveBeenCalledWith('tenant-1', 'case-9', '2025-06-01');
    expect(res).toBe(fakeResult);
  });

  it('asOfDate yoksa → bugün (YYYY-MM-DD) ile çağrılır', async () => {
    const compute = jest.fn().mockResolvedValue(fakeResult);
    const controller = makeController(compute);
    const today = new Date().toISOString().slice(0, 10);

    await controller.getCaseBalance('tenant-1', 'case-9', undefined);

    expect(compute).toHaveBeenCalledWith('tenant-1', 'case-9', today);
    // ISO gün formatı (YYYY-MM-DD)
    expect(compute.mock.calls[0][2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('tenantId auth-context argümanından forward edilir (client/body/param değil)', async () => {
    const compute = jest.fn().mockResolvedValue(fakeResult);
    const controller = makeController(compute);

    await controller.getCaseBalance('tenant-AUTH', 'case-9', '2025-06-01');

    // computeCaseBalance'a giden tenantId = decorator'dan gelen argüman
    expect(compute.mock.calls[0][0]).toBe('tenant-AUTH');
  });
});
