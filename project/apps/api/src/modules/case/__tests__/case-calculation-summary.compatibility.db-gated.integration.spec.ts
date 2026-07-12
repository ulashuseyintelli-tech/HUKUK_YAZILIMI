import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import {
  buildCaseCalculationSummaryCompatibilityAdapter,
  LEGACY_CALCULATION_SUMMARY_NUMERIC_FIELDS,
  type CaseCalculationSummaryCompatibilityAdapter,
  type LegacyCalculationSummaryCompatibilityInput,
} from '../case-calculation-summary.compatibility';
import { ADR014_PR9_GOLDEN_FIXTURE_MATRIX } from '../../interest-engine/scenario-support/golden-fixture-matrix';
import { runGoldenScenarioUnit } from '../../interest-engine/scenario-diagnostic/golden-fixture-unit-runner';
import {
  runSyntheticScenarioDiagnostic,
  type SyntheticDiagnosticOptions,
} from '../../interest-engine/scenario-diagnostic/scenario-diagnostic-runner';
import { normalizeScenarioDisplay } from '../../interest-engine/scenario-diagnostic/golden-fixture-normalizer';
import {
  cleanupMaterializedScenario,
  type MaterializedScenarioRefs,
} from '../../interest-engine/scenario-materializer/scenario-materializer';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env as Record<string, string | undefined>);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('ADR-014 PR-10 DB acceptance blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

function optionsFor(id: string): SyntheticDiagnosticOptions {
  if (id === 'pr9-01-valid-full-reversal') return { reversals: [{ ofPaymentId: 'pr9-01-payment' }] };
  if (id === 'pr9-02-malformed-reversal') {
    return { reversals: [{ ofPaymentId: 'pr9-02-payment', amount: -99.99 }] };
  }
  return {};
}

function fixedLegacyContract(id: string): LegacyCalculationSummaryCompatibilityInput {
  return {
    caseId: id,
    hesapTarihi: '2026-07-12',
    ...Object.fromEntries(LEGACY_CALCULATION_SUMMARY_NUMERIC_FIELDS.map((field) => [field, 0])),
  } as LegacyCalculationSummaryCompatibilityInput;
}

function normalizeAdapter(
  adapter: CaseCalculationSummaryCompatibilityAdapter,
  enforcementDateSpecified: boolean,
) {
  const normalizeMappedField = (field: string, mapped: CaseCalculationSummaryCompatibilityAdapter['mappedFields'][keyof CaseCalculationSummaryCompatibilityAdapter['mappedFields']]) =>
    !enforcementDateSpecified && (field === 'takipOncesiFaiz' || field === 'takipSonrasiFaiz')
      ? {
        status: 'NOT_CALCULATED',
        amount: null,
        currency: null,
        source: 'WAVE0_ENFORCEMENT_UNSPECIFIED',
        diagnosticCodes: ['ENFORCEMENT_DATE_UNSPECIFIED'],
      }
      : {
        status: mapped.status,
        amount: mapped.amount,
        currency: mapped.currency,
        source: mapped.source,
        diagnosticCodes: mapped.diagnosticCodes,
      };
  const normalizedDiagnostics = adapter.diagnostics.map((diagnostic) => {
    if (enforcementDateSpecified || diagnostic.code !== 'LEGACY_CANONICAL_CONFLICT') return diagnostic;
    const fields = Array.isArray(diagnostic.details?.fields)
      ? diagnostic.details.fields.filter((field) => field !== 'takipOncesiFaiz' && field !== 'takipSonrasiFaiz')
      : [];
    return { ...diagnostic, details: { ...diagnostic.details, fields } };
  });
  return {
    contractVersion: adapter.contractVersion,
    mode: adapter.mode,
    status: adapter.status,
    consumerSwitchAuthorized: adapter.consumerSwitchAuthorized,
    primaryAuthorityPromoted: adapter.primaryAuthorityPromoted,
    primaryDisplayEligible: adapter.primaryDisplayEligible,
    mappedFields: Object.fromEntries(Object.entries(adapter.mappedFields).map(([field, mapped]) => [
      field,
      normalizeMappedField(field, mapped),
    ])),
    parity: {
      status: adapter.parity.status,
      entries: adapter.parity.entries.map((entry) =>
        !enforcementDateSpecified
          && (entry.field === 'takipOncesiFaiz' || entry.field === 'takipSonrasiFaiz')
          ? { field: entry.field, canonicalAmount: null, status: 'NOT_COMPARABLE', deltaCents: null }
          : {
            field: entry.field,
            canonicalAmount: entry.canonicalAmount,
            status: entry.status,
            deltaCents: entry.deltaCents,
          }),
    },
    canonical: adapter.canonical == null ? null : {
      source: adapter.canonical.source,
      displayStatus: adapter.canonical.displayStatus,
      displayAuthority: adapter.canonical.displayAuthority,
      currency: adapter.canonical.currency,
      currencyResults: adapter.canonical.currencyResults.map((result) =>
        enforcementDateSpecified
          ? result
          : {
            ...result,
            preEnforcementInterest: null,
            postEnforcementInterest: null,
            interestReconciled: null,
          }),
      costs: adapter.canonical.costs,
      ancillaries: adapter.canonical.ancillaries,
      totals: adapter.canonical.totals,
      feeProjection: {
        status: adapter.canonical.feeProjection.status,
        authority: adapter.canonical.feeProjection.authority,
        policyStatus: adapter.canonical.feeProjection.policyStatus,
        aggregation: adapter.canonical.feeProjection.aggregation,
        currency: adapter.canonical.feeProjection.currency,
        totalProjectedAmount: adapter.canonical.feeProjection.totalProjectedAmount,
        groups: adapter.canonical.feeProjection.groups.map((group) => ({
          currency: group.currency,
          status: group.status,
          totalProjectedAmount: group.totalProjectedAmount,
          diagnosticCodes: group.diagnosticCodes ?? [],
          lines: group.lines.map((line) => ({
            itemType: line.itemType,
            category: line.category,
            code: line.code,
            amount: line.amount,
            currency: line.currency,
            status: line.status,
            diagnosticCodes: line.diagnosticCodes ?? [],
          })),
        })),
        diagnosticCodes: adapter.canonical.feeProjection.diagnostics.map((diagnostic) => diagnostic.code),
      },
      readiness: adapter.canonical.readiness,
      blockerCodes: adapter.canonical.blockers.map((blocker) => blocker.code),
      trace: {
        kind: adapter.canonical.trace.kind,
        authority: adapter.canonical.trace.authority,
        persisted: adapter.canonical.trace.persisted,
        orderPolicy: adapter.canonical.trace.orderPolicy,
        blockerCodes: adapter.canonical.trace.blockerCodes,
      },
      nonOfficialSnapshot: {
        kind: adapter.canonical.nonOfficialSnapshot.kind,
        official: adapter.canonical.nonOfficialSnapshot.official,
        persisted: adapter.canonical.nonOfficialSnapshot.persisted,
        authority: adapter.canonical.nonOfficialSnapshot.authority,
        displayStatus: adapter.canonical.nonOfficialSnapshot.displayStatus,
        displayAuthority: adapter.canonical.nonOfficialSnapshot.displayAuthority,
        blockerCodes: adapter.canonical.nonOfficialSnapshot.blockerCodes,
      },
    },
    diagnostics: normalizedDiagnostics,
  };
}

describeWithDisposableDb('ADR-014 PR-10 compatibility adapter — disposable PostgreSQL acceptance', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const liveRefs: MaterializedScenarioRefs[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL! } } });
    await prisma.$connect();
  });

  afterEach(async () => {
    while (liveRefs.length > 0) await cleanupMaterializedScenario(prisma, liveRefs.pop()!);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(ADR014_PR9_GOLDEN_FIXTURE_MATRIX.map((scenario) => [scenario.id, scenario] as const))(
    '%s unit/DB canonical display ve compatibility mapping ayni Wave 0 contractta kalir',
    async (_id, scenario) => {
      const options = optionsFor(scenario.id);
      const unit = runGoldenScenarioUnit(scenario, options);
      const db = await runSyntheticScenarioDiagnostic(prisma, scenario, options);
      liveRefs.push(db.refs);

      expect(normalizeScenarioDisplay(db.display, scenario)).toEqual(
        normalizeScenarioDisplay(unit.display, scenario),
      );
      const legacy = fixedLegacyContract(scenario.id);
      const unitAdapter = buildCaseCalculationSummaryCompatibilityAdapter({ legacy, display: unit.display });
      const dbAdapter = buildCaseCalculationSummaryCompatibilityAdapter({ legacy, display: db.display });
      const enforcementDateSpecified = scenario.domainInput.enforcementDate != null;
      expect(normalizeAdapter(dbAdapter, enforcementDateSpecified)).toEqual(
        normalizeAdapter(unitAdapter, enforcementDateSpecified),
      );
      expect(dbAdapter.consumerSwitchAuthorized).toBe(false);
      expect(dbAdapter.primaryAuthorityPromoted).toBe(false);
      expect(dbAdapter.canonical?.trace.authority).toBe('NONE');
      expect(dbAdapter.canonical?.nonOfficialSnapshot.authority).toBe('NONE');
      if (scenario.persistenceIntent.tenantSetup === 'TWO_TENANT_ISOLATION') {
        expect(db.evidence.observedTenantIsolation).toBe(true);
      }
    },
  );
});
