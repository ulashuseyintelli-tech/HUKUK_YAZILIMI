import { ADR014_PR9_GOLDEN_FIXTURE_MATRIX } from '../scenario-support/golden-fixture-matrix';
import { runGoldenScenarioUnit } from '../scenario-diagnostic/golden-fixture-unit-runner';
import {
  compareScenarioEvidence,
} from '../scenario-diagnostic/scenario-evidence';
import {
  compareScenarioGoldenExpectation,
  normalizeScenarioDisplay,
} from '../scenario-diagnostic/golden-fixture-normalizer';
import type { SyntheticDiagnosticOptions } from '../scenario-diagnostic/scenario-diagnostic-runner';

function optionsFor(id: string): SyntheticDiagnosticOptions {
  if (id === 'pr9-01-valid-full-reversal') {
    return { reversals: [{ ofPaymentId: 'pr9-01-payment' }] };
  }
  if (id === 'pr9-02-malformed-reversal') {
    return { reversals: [{ ofPaymentId: 'pr9-02-payment', amount: -99.99 }] };
  }
  return {};
}

describe('ADR-014 PR-9 Golden Fixture Matrix — unit', () => {
  it('mevcut Wave 0 contract ile tam 12 tekil canonical senaryo tanimlar', () => {
    expect(ADR014_PR9_GOLDEN_FIXTURE_MATRIX).toHaveLength(12);
    expect(new Set(ADR014_PR9_GOLDEN_FIXTURE_MATRIX.map((scenario) => scenario.id)).size).toBe(12);
    expect(ADR014_PR9_GOLDEN_FIXTURE_MATRIX.every((scenario) => scenario.expected != null)).toBe(true);
  });

  it.each(ADR014_PR9_GOLDEN_FIXTURE_MATRIX.map((scenario) => [scenario.id, scenario] as const))(
    '%s expected contract ile eslesir ve tekrar kosumunda byte-stable normalize olur',
    (_id, scenario) => {
      const first = runGoldenScenarioUnit(scenario, optionsFor(scenario.id));
      const second = runGoldenScenarioUnit(scenario, optionsFor(scenario.id));
      const firstNormalized = normalizeScenarioDisplay(first.display, scenario);
      const secondNormalized = normalizeScenarioDisplay(second.display, scenario);

      expect(compareScenarioEvidence(scenario.expected, first.display)).toEqual({
        match: true,
        mismatches: [],
        notes: [],
      });
      expect(compareScenarioGoldenExpectation(scenario.expected.golden ?? {}, firstNormalized)).toEqual([]);
      expect(secondNormalized).toEqual(firstNormalized);
    },
  );

  it('reversal, NO_BUCKETS, TBK100, interest-base ve currency blocker coverage 5/5 olur', () => {
    const blockerCoverage = new Set(
      ADR014_PR9_GOLDEN_FIXTURE_MATRIX.flatMap((scenario) =>
        normalizeScenarioDisplay(runGoldenScenarioUnit(scenario, optionsFor(scenario.id)).display, scenario)
          .readinessBlockerCodes),
    );
    expect([...blockerCoverage].sort()).toEqual([
      'CURRENCY_INTEGRITY',
      'INTEREST_BASE',
      'NO_BUCKETS',
      'REVERSAL_INTEGRITY',
      'TBK100_ALLOCATION',
    ]);
  });

  it('TBK100 cent allocation, future principal base ve PRE/POST mutabakati sabitlenir', () => {
    const byId = new Map(ADR014_PR9_GOLDEN_FIXTURE_MATRIX.map((scenario) => [scenario.id, scenario]));
    const tbkScenario = byId.get('pr9-04-tbk100-cent')!;
    const tbk = normalizeScenarioDisplay(runGoldenScenarioUnit(tbkScenario).display, tbkScenario);
    expect(tbk.allocations.flatMap((step) => step.categories.map((item) => item.category))).toEqual([
      'INTEREST',
      'PRINCIPAL',
    ]);
    expect(tbk.allocations.flatMap((step) => step.categories).every((item) => Number.isInteger(item.allocatedCents))).toBe(true);

    const partialScenario = byId.get('pr9-05-partial-interest-base')!;
    const partial = normalizeScenarioDisplay(runGoldenScenarioUnit(partialScenario).display, partialScenario);
    expect(partial.interestSegments.map((segment) => segment.principalCents)).toEqual([100_000, 99_000]);

    const prePostScenario = byId.get('pr9-06-pre-post')!;
    const prePost = normalizeScenarioDisplay(runGoldenScenarioUnit(prePostScenario).display, prePostScenario);
    const pre = prePost.interestSegments
      .filter((segment) => segment.phase === 'PRE_ENFORCEMENT')
      .reduce((sum, segment) => sum + segment.interestCents, 0);
    const post = prePost.interestSegments
      .filter((segment) => segment.phase === 'POST_ENFORCEMENT')
      .reduce((sum, segment) => sum + segment.interestCents, 0);
    expect(pre + post).toBe(prePost.currencies[0].interestCents);
  });

  it('currency, fee projection, trace/snapshot ve date+id ordering ayni matrixte kanitlanir', () => {
    const byId = new Map(ADR014_PR9_GOLDEN_FIXTURE_MATRIX.map((scenario) => [scenario.id, scenario]));
    const multiScenario = byId.get('pr9-07-multi-currency-isolation')!;
    const multi = normalizeScenarioDisplay(runGoldenScenarioUnit(multiScenario).display, multiScenario);
    expect(multi.currencies.map((row) => row.currency)).toEqual(['TRY', 'USD']);

    const feeStatuses = [9, 10, 11].map((index) => {
      const scenario = ADR014_PR9_GOLDEN_FIXTURE_MATRIX[index - 1];
      return normalizeScenarioDisplay(runGoldenScenarioUnit(scenario, optionsFor(scenario.id)).display, scenario).feeProjection.status;
    });
    expect(feeStatuses).toEqual(['AVAILABLE', 'NOT_CALCULATED', 'UNAVAILABLE']);

    const traceScenario = byId.get('pr9-12-trace-snapshot-tenant-order')!;
    const trace = normalizeScenarioDisplay(runGoldenScenarioUnit(traceScenario).display, traceScenario);
    expect([...new Set(trace.allocations.map((step) => step.paymentId))]).toEqual([
      'pr9-12-payment-a',
      'pr9-12-payment-b',
    ]);
    expect(trace.trace).toMatchObject({ authority: 'NONE', persisted: false });
    expect(trace.nonOfficialSnapshot).toMatchObject({ official: false, persisted: false, authority: 'NONE' });
  });
});
