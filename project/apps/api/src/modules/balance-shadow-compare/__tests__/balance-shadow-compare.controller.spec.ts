/**
 * G4c-3 shadow-compare controller testleri — delegasyon + asOfDate default + tenant auth-context.
 */

import { BalanceShadowCompareController } from '../balance-shadow-compare.controller';
import type { BalanceShadowCompareService, BalanceShadowCompareResult } from '../balance-shadow-compare.service';

const fakeResult: BalanceShadowCompareResult = {
  caseId: 'c1',
  asOfDate: '2025-06-01',
  summaryCurrency: 'TRY',
  summaryError: null,
  engineSource: 'NONE',
  comparisons: [],
  engineDiagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
};

function makeController(compare: jest.Mock): BalanceShadowCompareController {
  return new BalanceShadowCompareController({ compare } as unknown as BalanceShadowCompareService);
}

describe('BalanceShadowCompareController (G4c-3)', () => {
  it('delegasyon: (tenantId, caseId, asOfDate) → compare; sonuç aynen döner', async () => {
    const compare = jest.fn().mockResolvedValue(fakeResult);
    const controller = makeController(compare);
    const res = await controller.getShadowCompare('t1', 'c1', '2025-06-01');
    expect(compare).toHaveBeenCalledWith('t1', 'c1', '2025-06-01');
    expect(res).toBe(fakeResult);
  });

  it('asOfDate yoksa → bugün (YYYY-MM-DD)', async () => {
    const compare = jest.fn().mockResolvedValue(fakeResult);
    const controller = makeController(compare);
    const today = new Date().toISOString().slice(0, 10);
    await controller.getShadowCompare('t1', 'c1', undefined);
    expect(compare.mock.calls[0][2]).toBe(today);
    expect(compare.mock.calls[0][2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('tenantId auth-context argümanından forward edilir', async () => {
    const compare = jest.fn().mockResolvedValue(fakeResult);
    const controller = makeController(compare);
    await controller.getShadowCompare('tenant-AUTH', 'c1', '2025-06-01');
    expect(compare.mock.calls[0][0]).toBe('tenant-AUTH');
  });
});
