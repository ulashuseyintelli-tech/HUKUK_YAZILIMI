import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { ADR014_PR9_GOLDEN_FIXTURE_MATRIX } from '../scenario-support/golden-fixture-matrix';
import { runGoldenScenarioUnit } from '../scenario-diagnostic/golden-fixture-unit-runner';
import {
  runSyntheticScenarioDiagnostic,
  type SyntheticDiagnosticOptions,
} from '../scenario-diagnostic/scenario-diagnostic-runner';
import {
  compareScenarioGoldenExpectation,
  normalizeScenarioDisplay,
} from '../scenario-diagnostic/golden-fixture-normalizer';
import {
  cleanupMaterializedScenario,
  type MaterializedScenarioRefs,
} from '../scenario-materializer/scenario-materializer';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env as Record<string, string | undefined>);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('PR-9 DB twin-run blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

function optionsFor(id: string): SyntheticDiagnosticOptions {
  if (id === 'pr9-01-valid-full-reversal') {
    return { reversals: [{ ofPaymentId: 'pr9-01-payment' }] };
  }
  if (id === 'pr9-02-malformed-reversal') {
    return { reversals: [{ ofPaymentId: 'pr9-02-payment', amount: -99.99 }] };
  }
  return {};
}

describeWithDisposableDb('ADR-014 PR-9 Golden Fixture Matrix — disposable PostgreSQL twin-run', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const liveRefs: MaterializedScenarioRefs[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL! } } });
    await prisma.$connect();
  });

  afterEach(async () => {
    while (liveRefs.length > 0) {
      await cleanupMaterializedScenario(prisma, liveRefs.pop()!);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(ADR014_PR9_GOLDEN_FIXTURE_MATRIX.map((scenario) => [scenario.id, scenario] as const))(
    '%s unit ve DB-materialized sonucu ayni expected contractta normalize olarak esittir',
    async (_id, scenario) => {
      const unit = normalizeScenarioDisplay(
        runGoldenScenarioUnit(scenario, optionsFor(scenario.id)).display,
        scenario,
      );
      const first = await runSyntheticScenarioDiagnostic(prisma, scenario, optionsFor(scenario.id));
      liveRefs.push(first.refs);

      expect(first.evidence.comparison).toEqual({ match: true, mismatches: [], notes: [] });
      const dbNormalized = normalizeScenarioDisplay(first.display, scenario);
      expect(compareScenarioGoldenExpectation(scenario.expected.golden ?? {}, dbNormalized)).toEqual([]);
      expect(dbNormalized).toEqual(unit);
      if (scenario.persistenceIntent.tenantSetup === 'TWO_TENANT_ISOLATION') {
        expect(first.evidence.observedTenantIsolation).toBe(true);
      }
    },
  );

  it('matrix ikinci materialization kosumunda da ayni normalize sonucu verir', async () => {
    for (const scenario of ADR014_PR9_GOLDEN_FIXTURE_MATRIX) {
      const first = await runSyntheticScenarioDiagnostic(prisma, scenario, optionsFor(scenario.id));
      const firstNormalized = normalizeScenarioDisplay(first.display, scenario);
      await cleanupMaterializedScenario(prisma, first.refs);

      const repeatScenario = { ...scenario, id: `${scenario.id}-repeat` };
      const repeatOptions = scenario.id === 'pr9-01-valid-full-reversal'
        ? { reversals: [{ ofPaymentId: 'pr9-01-payment' }] }
        : scenario.id === 'pr9-02-malformed-reversal'
          ? { reversals: [{ ofPaymentId: 'pr9-02-payment', amount: -99.99 }] }
          : {};
      const second = await runSyntheticScenarioDiagnostic(prisma, repeatScenario, repeatOptions);
      liveRefs.push(second.refs);
      expect(normalizeScenarioDisplay(second.display, repeatScenario)).toEqual(firstNormalized);
      await cleanupMaterializedScenario(prisma, liveRefs.pop()!);
    }
  });
});
