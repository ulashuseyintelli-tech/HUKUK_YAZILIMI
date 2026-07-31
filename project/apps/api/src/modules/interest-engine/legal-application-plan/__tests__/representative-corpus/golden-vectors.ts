import type { GoldenScenarioVector } from './contracts';

export const REPRESENTATIVE_CORPUS_GOLDEN_VECTORS: readonly GoldenScenarioVector[] =
  Object.freeze([
    {
      scenarioId: '01-single-principal',
      outcome: 'PLAN',
      appliedAmountMinor: '10000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'PRINCIPAL', appliedAmountMinor: '10000', bucketAfterMinor: '5000' },
      ],
    },
    {
      scenarioId: '02-principal-and-interest',
      outcome: 'PLAN',
      appliedAmountMinor: '8000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'ACCRUED_INTEREST', appliedAmountMinor: '2500', bucketAfterMinor: '0' },
        { componentType: 'PRINCIPAL', appliedAmountMinor: '5500', bucketAfterMinor: '4500' },
      ],
    },
    {
      scenarioId: '03-principal-and-cost',
      outcome: 'PLAN',
      appliedAmountMinor: '5000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'COST', appliedAmountMinor: '1500', bucketAfterMinor: '0' },
        { componentType: 'PRINCIPAL', appliedAmountMinor: '3500', bucketAfterMinor: '6500' },
      ],
    },
    {
      scenarioId: '04-all-components',
      outcome: 'PLAN',
      appliedAmountMinor: '6000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'COST', appliedAmountMinor: '1000', bucketAfterMinor: '0' },
        { componentType: 'ANCILLARY', appliedAmountMinor: '500', bucketAfterMinor: '0' },
        { componentType: 'ACCRUED_INTEREST', appliedAmountMinor: '2000', bucketAfterMinor: '0' },
        { componentType: 'PRINCIPAL', appliedAmountMinor: '2500', bucketAfterMinor: '7500' },
      ],
    },
    {
      scenarioId: '05-partial-application',
      outcome: 'PLAN',
      appliedAmountMinor: '3000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'PRINCIPAL', appliedAmountMinor: '3000', bucketAfterMinor: '7000' },
      ],
    },
    {
      scenarioId: '06-exact-application',
      outcome: 'PLAN',
      appliedAmountMinor: '10000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'COST', appliedAmountMinor: '1000', bucketAfterMinor: '0' },
        { componentType: 'ACCRUED_INTEREST', appliedAmountMinor: '2000', bucketAfterMinor: '0' },
        { componentType: 'PRINCIPAL', appliedAmountMinor: '7000', bucketAfterMinor: '0' },
      ],
    },
    {
      scenarioId: '07-overpayment-held',
      outcome: 'PLAN',
      appliedAmountMinor: '5000',
      heldRemainderMinor: '3000',
      heldReason: 'EXCESS_OVER_ELIGIBLE_OUTSTANDING',
      applications: [
        { componentType: 'COST', appliedAmountMinor: '1000', bucketAfterMinor: '0' },
        { componentType: 'PRINCIPAL', appliedAmountMinor: '4000', bucketAfterMinor: '0' },
      ],
    },
    {
      scenarioId: '08-full-held',
      outcome: 'PLAN',
      appliedAmountMinor: '0',
      heldRemainderMinor: '2500',
      heldReason: 'NO_ELIGIBLE_OUTSTANDING',
      applications: [],
    },
    {
      scenarioId: '09-multiple-receipts-history',
      outcome: 'PLAN',
      appliedAmountMinor: '3000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'COST', appliedAmountMinor: '500', bucketAfterMinor: '0' },
        { componentType: 'PRINCIPAL', appliedAmountMinor: '2500', bucketAfterMinor: '7000' },
      ],
    },
    {
      scenarioId: '10-same-day-history',
      outcome: 'PLAN',
      appliedAmountMinor: '2000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'ACCRUED_INTEREST', appliedAmountMinor: '1200', bucketAfterMinor: '0' },
        { componentType: 'PRINCIPAL', appliedAmountMinor: '800', bucketAfterMinor: '8000' },
      ],
    },
    {
      scenarioId: '11-mixed-history',
      outcome: 'PLAN',
      appliedAmountMinor: '2500',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'COST', appliedAmountMinor: '500', bucketAfterMinor: '0' },
        { componentType: 'ANCILLARY', appliedAmountMinor: '300', bucketAfterMinor: '0' },
        { componentType: 'ACCRUED_INTEREST', appliedAmountMinor: '700', bucketAfterMinor: '0' },
        { componentType: 'PRINCIPAL', appliedAmountMinor: '1000', bucketAfterMinor: '7500' },
      ],
    },
    {
      scenarioId: '12-full-reversal-expectation',
      outcome: 'PLAN',
      appliedAmountMinor: '5000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'COST', appliedAmountMinor: '1000', bucketAfterMinor: '0' },
        { componentType: 'PRINCIPAL', appliedAmountMinor: '4000', bucketAfterMinor: '0' },
      ],
    },
    { scenarioId: '13-currency-mismatch', outcome: 'CURRENCY_OR_MINOR_UNIT_INVALID' },
    {
      scenarioId: '14-semantic-replay-expectation',
      outcome: 'PLAN',
      appliedAmountMinor: '1000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'PRINCIPAL', appliedAmountMinor: '1000', bucketAfterMinor: '4000' },
      ],
    },
    {
      scenarioId: '15-semantic-conflict-expectation',
      outcome: 'PLAN',
      appliedAmountMinor: '1000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'PRINCIPAL', appliedAmountMinor: '1000', bucketAfterMinor: '4000' },
      ],
    },
    {
      scenarioId: '16-concurrent-command-expectation',
      outcome: 'PLAN',
      appliedAmountMinor: '1000',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'PRINCIPAL', appliedAmountMinor: '1000', bucketAfterMinor: '4000' },
      ],
    },
    {
      scenarioId: '17-rounding-boundary',
      outcome: 'PLAN',
      appliedAmountMinor: '1',
      heldRemainderMinor: '0',
      applications: [
        { componentType: 'COST', appliedAmountMinor: '1', bucketAfterMinor: '0' },
      ],
    },
    { scenarioId: '18-legacy-evidence-unknown', outcome: 'SNAPSHOT_UNAVAILABLE' },
    { scenarioId: '19-cross-tenant-rejection', outcome: 'TENANT_CONTEXT_MISMATCH' },
  ]);

// Updated only when the ratified corpus semantics intentionally change.
export const REPRESENTATIVE_CORPUS_GOLDEN_CHECKSUM =
  '0e0d5f1db96d7f0b8f204307cb2b9e73d57b89a04194b93dc6c4ffc80a10f05e' as const;
