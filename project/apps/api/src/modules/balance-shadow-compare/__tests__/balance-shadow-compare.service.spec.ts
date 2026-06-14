/**
 * G4c-3 shadow-compare service testleri — summary-engine vs computeBalance gözlem (mock'lu).
 */

import { BalanceShadowCompareService } from '../balance-shadow-compare.service';
import type { SummaryEngineService } from '../../summary-engine/summary-engine.service';
import type { CaseBalanceService } from '../../interest-engine/orchestration/case-balance.service';

function makeSummary(totals?: { sonBorc: number; takipSonrasiFaiz: number } | 'throw', currency = 'TRY') {
  return {
    calculateSummary: jest.fn().mockImplementation(async () => {
      if (totals === 'throw') throw new Error('Dosya bulunamadı');
      return { currency, totals: { sonBorc: totals?.sonBorc ?? 0, takipSonrasiFaiz: totals?.takipSonrasiFaiz ?? 0 } };
    }),
  } as unknown as SummaryEngineService;
}

function engineResult(currencyResults: Array<{ currency: string; totalDue: number | null; totalInterest?: number }>) {
  return {
    source: 'COLLECTION',
    currencyResults: currencyResults.map((c) => ({
      currency: c.currency,
      result: c.totalDue == null ? null : { totalDue: c.totalDue, totalInterest: c.totalInterest ?? 0 },
    })),
    projections: { costs: {}, ancillaries: {} },
    diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
  };
}

function makeEngine(result: ReturnType<typeof engineResult>) {
  return { computeCaseBalance: jest.fn().mockResolvedValue(result) } as unknown as CaseBalanceService;
}

describe('BalanceShadowCompareService (G4c-3)', () => {
  it('MATCH: aynı sonBorc/totalDue → MATCH, delta 0', async () => {
    const svc = new BalanceShadowCompareService(
      makeSummary({ sonBorc: 1000, takipSonrasiFaiz: 100 }),
      makeEngine(engineResult([{ currency: 'TRY', totalDue: 1000, totalInterest: 100 }])),
    );
    const res = await svc.compare('t1', 'c1', '2025-06-01');
    const tl = res.comparisons[0];
    expect(tl.matchStatus).toBe('MATCH');
    expect(tl.delta).toBe(0);
    expect(tl.interestDelta).toBe(0);
  });

  it('DIVERGENT: 1000 vs 1200 → DIVERGENT, delta 200, deltaPercent 20', async () => {
    const svc = new BalanceShadowCompareService(
      makeSummary({ sonBorc: 1000, takipSonrasiFaiz: 100 }),
      makeEngine(engineResult([{ currency: 'TRY', totalDue: 1200, totalInterest: 150 }])),
    );
    const res = await svc.compare('t1', 'c1', '2025-06-01');
    const tl = res.comparisons[0];
    expect(tl.matchStatus).toBe('DIVERGENT');
    expect(tl.delta).toBe(200);
    expect(tl.deltaPercent).toBe(20);
    expect(tl.interestDelta).toBe(50); // 150 − 100 (stored vs recomputed)
  });

  it('multi-currency: engine TRY+USD, summary TRY → TRY karşılaştırılır, USD ENGINE_ONLY', async () => {
    const svc = new BalanceShadowCompareService(
      makeSummary({ sonBorc: 1000, takipSonrasiFaiz: 0 }, 'TRY'),
      makeEngine(engineResult([
        { currency: 'TRY', totalDue: 1000, totalInterest: 0 },
        { currency: 'USD', totalDue: 500, totalInterest: 0 },
      ])),
    );
    const res = await svc.compare('t1', 'c1', '2025-06-01');
    const usd = res.comparisons.find((c) => c.currency === 'USD')!;
    expect(usd.matchStatus).toBe('ENGINE_ONLY');
    expect(usd.summarySonBorc).toBeNull();
    expect(usd.engineTotalDue).toBe(500);
  });

  it('summary throw → summaryError set, engine sonucu yine döner (ENGINE_ONLY)', async () => {
    const svc = new BalanceShadowCompareService(
      makeSummary('throw'),
      makeEngine(engineResult([{ currency: 'TRY', totalDue: 800, totalInterest: 0 }])),
    );
    const res = await svc.compare('t1', 'missing', '2025-06-01');
    expect(res.summaryError).toBe('Dosya bulunamadı');
    expect(res.summaryCurrency).toBeNull();
    expect(res.comparisons[0].matchStatus).toBe('ENGINE_ONLY');
    expect(res.comparisons[0].engineTotalDue).toBe(800);
  });

  it('SUMMARY_ONLY: summary bakiye var, engine o currency için result null', async () => {
    const svc = new BalanceShadowCompareService(
      makeSummary({ sonBorc: 1000, takipSonrasiFaiz: 0 }, 'TRY'),
      makeEngine(engineResult([{ currency: 'TRY', totalDue: null }])), // NO_BUCKETS gibi
    );
    const res = await svc.compare('t1', 'c1', '2025-06-01');
    expect(res.comparisons[0].matchStatus).toBe('SUMMARY_ONLY');
  });

  it('deltaPercent guard: summarySonBorc=0 → deltaPercent null', async () => {
    const svc = new BalanceShadowCompareService(
      makeSummary({ sonBorc: 0, takipSonrasiFaiz: 0 }),
      makeEngine(engineResult([{ currency: 'TRY', totalDue: 50, totalInterest: 0 }])),
    );
    const res = await svc.compare('t1', 'c1', '2025-06-01');
    expect(res.comparisons[0].delta).toBe(50);
    expect(res.comparisons[0].deltaPercent).toBeNull();
    expect(res.comparisons[0].matchStatus).toBe('DIVERGENT');
  });

  it('engineDiagnostics passthrough + her iki motor (tenantId,caseId,date) ile çağrılır', async () => {
    const summary = makeSummary({ sonBorc: 1, takipSonrasiFaiz: 0 });
    const engine = makeEngine(engineResult([{ currency: 'TRY', totalDue: 1, totalInterest: 0 }]));
    const svc = new BalanceShadowCompareService(summary, engine);
    const res = await svc.compare('tenantX', 'caseY', '2025-06-01');
    expect(res.engineDiagnostics).toBeDefined();
    expect((summary.calculateSummary as jest.Mock).mock.calls[0][0]).toBe('tenantX');
    expect((engine.computeCaseBalance as jest.Mock)).toHaveBeenCalledWith('tenantX', 'caseY', '2025-06-01');
  });
});
