/**
 * ADR-014 PR-9 — Wave 0 ScenarioDefinition tabanli 12 canonical golden vaka.
 *
 * Yeni DSL/JSON fixture/registry yoktur. Bu dosya yalniz mevcut builder ve
 * ScenarioExpected kontratinin duz typed listesidir; runtime authority degildir.
 */
import { AncillaryType, InterestTypeCode } from '../types/domain.types';
import { defineScenario, scenarioClaimBucket, scenarioPayment } from './scenario-builder';
import type { ScenarioDefinition } from './scenario-definition';

const fixedClaim = (id: string, overrides: Parameters<typeof scenarioClaimBucket>[0] = {}) =>
  scenarioClaimBucket({
    id,
    amount: 1_000,
    currency: 'TRY',
    startDate: '2026-06-01',
    interestType: InterestTypeCode.CONTRACTUAL,
    fixedRate: 0.365,
    ...overrides,
  });

const shadowExpected = (perCurrencyStatus: Record<string, 'OK' | 'SKIPPED'>) => ({
  perCurrencyStatus,
  blockerCodes: [],
  authority: 'SHADOW_ONLY' as const,
  snapshotStatus: 'UNSAFE' as const,
});

export const ADR014_PR9_GOLDEN_FIXTURE_MATRIX: readonly ScenarioDefinition[] = [
  defineScenario({
    id: 'pr9-01-valid-full-reversal',
    title: 'Valid payment plus linked full reversal remains net-zero',
    domainInput: {
      claimBuckets: [fixedClaim('pr9-01-claim')],
      payments: [scenarioPayment({ id: 'pr9-01-payment', date: '2026-06-11', amount: 100, currency: 'TRY' })],
      asOfDate: '2026-06-21',
    },
    expected: {
      ...shadowExpected({ TRY: 'OK' }),
      golden: { allocations: [] },
    },
    persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
  }),
  defineScenario({
    id: 'pr9-02-malformed-reversal',
    title: 'Malformed linked reversal is fail-closed',
    domainInput: {
      claimBuckets: [fixedClaim('pr9-02-claim')],
      payments: [scenarioPayment({ id: 'pr9-02-payment', date: '2026-06-11', amount: 100, currency: 'TRY' })],
      asOfDate: '2026-06-21',
    },
    expected: {
      perCurrencyStatus: {},
      blockerCodes: ['REVERSAL_INTEGRITY_INVALID'],
      authority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      snapshotStatus: 'BLOCKED',
      golden: { readinessBlockerCodes: ['REVERSAL_INTEGRITY'], allocations: [] },
    },
    persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
  }),
  defineScenario({
    id: 'pr9-03-no-buckets',
    title: 'Payment without a calculable claim bucket is fail-closed',
    domainInput: {
      claimBuckets: [],
      payments: [scenarioPayment({ id: 'pr9-03-payment', date: '2026-06-11', amount: 25, currency: 'TRY' })],
      asOfDate: '2026-06-21',
    },
    expected: {
      perCurrencyStatus: { TRY: 'SKIPPED' },
      blockerCodes: ['CURRENCY_MISMATCH', 'NO_BUCKETS'],
      authority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      snapshotStatus: 'BLOCKED',
      golden: { readinessBlockerCodes: ['NO_BUCKETS', 'CURRENCY_INTEGRITY'] },
    },
    persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
  }),
  defineScenario({
    id: 'pr9-04-tbk100-cent',
    title: 'TBK100 interest-before-principal allocation is cent normalized',
    domainInput: {
      claimBuckets: [fixedClaim('pr9-04-claim', { amount: 1_000.01 })],
      payments: [scenarioPayment({ id: 'pr9-04-payment', date: '2026-06-11', amount: 20.01, currency: 'TRY' })],
      asOfDate: '2026-06-21',
    },
    expected: shadowExpected({ TRY: 'OK' }),
    persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
  }),
  defineScenario({
    id: 'pr9-05-partial-interest-base',
    title: 'Principal allocation mutates only the future interest base',
    domainInput: {
      claimBuckets: [fixedClaim('pr9-05-claim')],
      payments: [scenarioPayment({ id: 'pr9-05-payment', date: '2026-06-11', amount: 20, currency: 'TRY' })],
      asOfDate: '2026-06-21',
    },
    expected: shadowExpected({ TRY: 'OK' }),
    persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
  }),
  defineScenario({
    id: 'pr9-06-pre-post',
    title: 'Enforcement date splits PRE/POST interest and reconciles cents',
    domainInput: {
      claimBuckets: [fixedClaim('pr9-06-claim')],
      payments: [scenarioPayment({ id: 'pr9-06-payment', date: '2026-06-11', amount: 20, currency: 'TRY' })],
      asOfDate: '2026-06-21',
      enforcementDate: '2026-06-15',
    },
    expected: shadowExpected({ TRY: 'OK' }),
    persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
  }),
  defineScenario({
    id: 'pr9-07-multi-currency-isolation',
    title: 'TRY and USD remain separate fixed-rate result groups',
    domainInput: {
      claimBuckets: [
        fixedClaim('pr9-07-claim-try'),
        fixedClaim('pr9-07-claim-usd', { amount: 500, currency: 'USD' }),
      ],
      payments: [
        scenarioPayment({ id: 'pr9-07-payment-try', date: '2026-06-11', amount: 20, currency: 'TRY' }),
        scenarioPayment({ id: 'pr9-07-payment-usd', date: '2026-06-12', amount: 10, currency: 'USD' }),
      ],
      asOfDate: '2026-06-21',
      enforcementDate: '2026-06-15',
    },
    expected: {
      perCurrencyStatus: { TRY: 'OK', USD: 'OK' },
      blockerCodes: [],
      authority: 'SHADOW_ONLY',
      snapshotStatus: 'UNSAFE',
      golden: { readinessBlockerCodes: [] },
    },
    persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
  }),
  defineScenario({
    id: 'pr9-08-currency-mismatch',
    title: 'Cross-currency payment is not attached to another claim group',
    domainInput: {
      claimBuckets: [fixedClaim('pr9-08-claim')],
      payments: [scenarioPayment({ id: 'pr9-08-payment-usd', date: '2026-06-11', amount: 20, currency: 'USD' })],
      asOfDate: '2026-06-21',
    },
    expected: {
      perCurrencyStatus: { TRY: 'OK', USD: 'SKIPPED' },
      blockerCodes: ['CURRENCY_MISMATCH', 'NO_BUCKETS'],
      authority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      snapshotStatus: 'BLOCKED',
      golden: { readinessBlockerCodes: ['NO_BUCKETS', 'CURRENCY_INTEGRITY'] },
    },
    persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
  }),
  defineScenario({
    id: 'pr9-09-fee-available',
    title: 'Persisted fee projection is carried without authority promotion',
    domainInput: {
      claimBuckets: [fixedClaim('pr9-09-claim', { costs: { [AncillaryType.HARC]: 12.34 } })],
      payments: [],
      asOfDate: '2026-06-21',
    },
    expected: {
      ...shadowExpected({ TRY: 'OK' }),
      golden: {
        feeProjection: {
          status: 'AVAILABLE',
          authority: 'SOURCE_PROJECTION_ONLY',
          currency: 'TRY',
          totalProjectedCents: 1234,
          groups: [{ currency: 'TRY', status: 'AVAILABLE', totalProjectedCents: 1234, lineCents: [1234] }],
          diagnosticCodes: ['FEE_POLICY_OWNER_GATED'],
        },
      },
    },
    persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
  }),
  defineScenario({
    id: 'pr9-10-negative-payment',
    title: 'Negative payment is dropped and TBK100 readiness fails closed',
    domainInput: {
      claimBuckets: [fixedClaim('pr9-10-claim')],
      payments: [scenarioPayment({ id: 'pr9-10-payment', date: '2026-06-11', amount: -1, currency: 'TRY' })],
      asOfDate: '2026-06-21',
    },
    expected: {
      perCurrencyStatus: { TRY: 'OK' },
      blockerCodes: ['ZERO_OR_NEGATIVE_PAYMENT'],
      authority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      snapshotStatus: 'BLOCKED',
      golden: {
        readinessBlockerCodes: ['TBK100_ALLOCATION'],
        feeProjection: {
          status: 'NOT_CALCULATED',
          authority: 'UNAVAILABLE',
          currency: null,
          totalProjectedCents: null,
          groups: [],
          diagnosticCodes: ['FEE_POLICY_OWNER_GATED', 'FEE_PROJECTION_NOT_CALCULATED'],
        },
      },
    },
    persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
  }),
  defineScenario({
    id: 'pr9-11-interest-base-blocked-fee-unavailable',
    title: 'Missing historical rate blocks interest base and source projection',
    domainInput: {
      claimBuckets: [scenarioClaimBucket({
        id: 'pr9-11-claim',
        amount: 1_000,
        currency: 'TRY',
        startDate: '2026-06-01',
        interestType: InterestTypeCode.LEGAL_3095,
        costs: { [AncillaryType.HARC]: 5 },
      })],
      payments: [],
      asOfDate: '2026-05-31',
    },
    expected: {
      perCurrencyStatus: { TRY: 'SKIPPED' },
      blockerCodes: ['ENGINE_ERROR'],
      authority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      snapshotStatus: 'BLOCKED',
      golden: { readinessBlockerCodes: ['INTEREST_BASE'] },
    },
    persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
  }),
  defineScenario({
    id: 'pr9-12-trace-snapshot-tenant-order',
    title: 'Same-day date+id ordering, trace, non-official snapshot and tenant isolation',
    domainInput: {
      claimBuckets: [fixedClaim('pr9-12-claim')],
      payments: [
        scenarioPayment({ id: 'pr9-12-payment-b', date: '2026-06-11', amount: 5, currency: 'TRY' }),
        scenarioPayment({ id: 'pr9-12-payment-a', date: '2026-06-11', amount: 20, currency: 'TRY' }),
      ],
      asOfDate: '2026-06-21',
    },
    expected: {
      ...shadowExpected({ TRY: 'OK' }),
      golden: {
        trace: {
          kind: 'NON_AUTHORITATIVE_EXPLAINABILITY_TRACE',
          authority: 'NONE',
          persisted: false,
          orderPolicy: 'CURRENCY_ASC_THEN_CANONICAL_RESULT_ORDER',
        },
        nonOfficialSnapshot: {
          kind: 'NON_OFFICIAL_CASE_BALANCE_SNAPSHOT',
          official: false,
          persisted: false,
          authority: 'NONE',
          blockerCodes: [],
        },
      },
    },
    persistenceIntent: { tenantSetup: 'TWO_TENANT_ISOLATION', currency: 'TRY' },
  }),
] as const;
