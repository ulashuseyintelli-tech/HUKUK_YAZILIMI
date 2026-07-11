/**
 * ADR-014 PR-9 in-memory twin runner.
 *
 * ScenarioDefinition'i DB olmadan ayni saf assembler/payment/currency/engine/
 * display bilesenlerinden gecirir. Production wiring veya authority degildir;
 * disposable-Postgres kosumu ile birebir normalize edilerek materializer/runtime
 * farklarini gorunur kilan test-support yuzeyidir.
 */
import type { ScenarioDefinition } from '../scenario-support/scenario-definition';
import type { SyntheticDiagnosticOptions } from './scenario-diagnostic-runner';
import { mapPayments, hasFatalPaymentMapDiagnostic } from '../calc-prep/payment-mapper';
import type { CollectionRow, LedgerPaymentRow } from '../calc-prep/payment-mapper';
import { groupByCurrency } from '../calc-prep/currency-grouper';
import { buildCaseBalanceFeeProjection } from '../orchestration/case-balance-fee-projection';
import { toCaseBalanceDisplay } from '../orchestration/case-balance-display';
import type { CaseBalanceResult } from '../orchestration/case-balance.service';
import type { ClaimItemProjectionSource } from '../assembler/claim-bucket-assembler';
import { InterestEngineService } from '../interest-engine.service';
import { PolicyGateV2Service } from '../policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../segments/segment-builder.service';
import { AllocationEngineService } from '../allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../allocation/tbk100-allocator.service';
import { ClaimPriorityService } from '../allocation/claim-priority.service';
import { VersionPinningService } from '../version/version-pinning.service';
import { InterestEngineError } from '../errors/interest-engine-errors';
import { RateSourceType } from '../rates/rate-entry.entity';
import type { RateEntry } from '../rates/rate-entry.entity';
import {
  CalculationMode,
  RoundingMode,
  RoundingScope,
  SameDayPaymentRule,
} from '../types/common.types';
import {
  ClaimPriorityRule,
  DEFAULT_INTERPRETATION_PROFILE_ID,
  GapPolicy,
} from '../types/calculation.types';
import type { ClaimBucket } from '../types/domain.types';

const TENANT_ID = 'golden-unit-tenant';

function buildEngine(): InterestEngineService {
  return new InterestEngineService(
    new PolicyGateV2Service(),
    new SegmentBuilderService(),
    new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
    {} as never,
    {} as never,
    new VersionPinningService(),
    undefined,
  );
}

function projectionItemType(code: string, category: 'COST' | 'ANCILLARY'): string {
  if (category === 'COST' && code === 'HARC') return 'FEE';
  if (category === 'COST' && code === 'TEBLIGAT_MASRAFI') return 'EXPENSE';
  if (code === 'VEKALET_UCRETI') return 'ATTORNEY_FEE';
  if (code === 'CEK_TAZMINATI') return 'CHECK_PENALTY';
  if (category === 'ANCILLARY' && code === 'DIGER') return 'OTHER';
  throw new Error(`Golden unit ${category} projection code desteklenmiyor: ${code}`);
}

function projectionEvidence(def: ScenarioDefinition): {
  sources: ClaimItemProjectionSource[];
  projections: CaseBalanceResult['projections'];
} {
  const sources: ClaimItemProjectionSource[] = [];
  const costs: Record<string, number> = {};
  const ancillaries: Record<string, number> = {};

  for (const bucket of def.domainInput.claimBuckets) {
    for (const [code, amount] of Object.entries(bucket.costs ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (amount == null) continue;
      costs[code] = (costs[code] ?? 0) + amount;
      sources.push({
        sourceItemId: `${bucket.id}-cost-${code}`,
        itemType: projectionItemType(code, 'COST'),
        category: 'COST',
        code: code as never,
        amount,
        currency: bucket.currency,
        sourceStatus: amount > 0 && Number.isFinite(amount) ? 'AVAILABLE' : 'INVALID_AMOUNT',
      });
    }
    for (const [code, amount] of Object.entries(bucket.ancillaries ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (amount == null) continue;
      ancillaries[code] = (ancillaries[code] ?? 0) + amount;
      sources.push({
        sourceItemId: `${bucket.id}-ancillary-${code}`,
        itemType: projectionItemType(code, 'ANCILLARY'),
        category: 'ANCILLARY',
        code: code as never,
        amount,
        currency: bucket.currency,
        sourceStatus: amount > 0 && Number.isFinite(amount) ? 'AVAILABLE' : 'INVALID_AMOUNT',
      });
    }
  }
  return { sources, projections: { costs, ancillaries } as CaseBalanceResult['projections'] };
}

function paymentEvidence(
  def: ScenarioDefinition,
  opts: SyntheticDiagnosticOptions,
): { ledger: LedgerPaymentRow[]; collections: CollectionRow[] } {
  const ledger: LedgerPaymentRow[] = def.domainInput.payments.map((payment) => ({
    id: payment.id,
    tenantId: TENANT_ID,
    caseId: def.id,
    entryType: 'PAYMENT',
    status: 'CONFIRMED',
    amount: payment.amount,
    currency: payment.currency,
    entryDate: `${payment.date}T00:00:00.000Z`,
  }));
  for (const [index, reversal] of (opts.reversals ?? []).entries()) {
    const original = def.domainInput.payments.find((payment) => payment.id === reversal.ofPaymentId);
    if (!original) throw new Error(`Golden unit reversal payment bulunamadi: ${reversal.ofPaymentId}`);
    ledger.push({
      id: `${def.id}-reversal-${index}`,
      tenantId: TENANT_ID,
      caseId: def.id,
      entryType: 'REVERSAL',
      status: 'CONFIRMED',
      amount: reversal.amount ?? -original.amount,
      currency: original.currency,
      entryDate: `${original.date}T00:00:00.000Z`,
      reversesLedgerEntryId: original.id,
    });
  }
  return { ledger, collections: [] };
}

function calculationBuckets(def: ScenarioDefinition): ClaimBucket[] {
  return def.domainInput.claimBuckets.map((bucket) => {
    const { costs: _costs, ancillaries: _ancillaries, ...calculationBucket } = bucket;
    return calculationBucket as ClaimBucket;
  });
}

function ratesFor(buckets: ClaimBucket[], annualRate: number, asOfDate: string): RateEntry[] {
  const variableTypes = [...new Set(
    buckets.filter((bucket) => bucket.fixedRate == null).map((bucket) => bucket.interestType),
  )];
  const variable = variableTypes.map((interestType) => ({
    id: `golden-unit-${interestType}`,
    interestType,
    validFrom: '2020-01-01',
    validTo: null,
    annualRate,
    source: RateSourceType.MANUAL,
    versionHash: `golden-unit-${interestType}`,
    createdAt: '2020-01-01T00:00:00.000Z',
  }));
  const fixed = buckets
    .filter((bucket) => bucket.fixedRate != null)
    .map((bucket) => ({
      id: `FIXED_${bucket.id}`,
      interestType: bucket.interestType,
      validFrom: bucket.startDate,
      validTo: asOfDate,
      annualRate: bucket.fixedRate as number,
      source: RateSourceType.CONTRACT,
      versionHash: `fixed-${bucket.id}`,
      createdAt: '2020-01-01T00:00:00.000Z',
    }));
  return [...variable, ...fixed];
}

export interface GoldenUnitRun {
  display: ReturnType<typeof toCaseBalanceDisplay>;
  balance: CaseBalanceResult;
}

/** Aynı ScenarioDefinition icin DB'siz canonical twin gozlemi. */
export function runGoldenScenarioUnit(
  def: ScenarioDefinition,
  opts: SyntheticDiagnosticOptions = {},
): GoldenUnitRun {
  const projection = projectionEvidence(def);
  const paymentRows = paymentEvidence(def, opts);
  const pay = mapPayments(paymentRows.ledger, paymentRows.collections);
  const emptyDiagnostics: CaseBalanceResult['diagnostics'] = {
    fatal: [], assembler: [], payments: pay.diagnostics, currency: [], perCurrency: [],
  };

  let balance: CaseBalanceResult;
  if (hasFatalPaymentMapDiagnostic(pay.diagnostics)) {
    const fatalCode = 'REVERSAL_INTEGRITY_INVALID';
    balance = {
      asOfDate: def.domainInput.asOfDate,
      source: pay.source,
      currencyResults: [],
      projections: projection.projections,
      feeProjection: buildCaseBalanceFeeProjection({
        sourceItems: projection.sources,
        currencyResults: [],
        globalBlockerCodes: [fatalCode],
      }),
      diagnostics: { ...emptyDiagnostics, fatal: [{ code: fatalCode, caseId: def.id }] },
      overpayments: { held: [], blocked: [] },
    };
  } else {
    const grouped = groupByCurrency(calculationBuckets(def), pay.payments);
    const currencyResults: CaseBalanceResult['currencyResults'] = [];
    const perCurrency: CaseBalanceResult['diagnostics']['perCurrency'] = [];
    const hasNoBuckets = grouped.groups.some((group) => group.blockedReason == null && group.buckets.length === 0);
    const invalidCurrencyCodes = [...new Set(
      grouped.diagnostics
        .map((diagnostic) => diagnostic.code)
        .filter((code) => code === 'CURRENCY_MISSING' || code === 'CURRENCY_UNSUPPORTED'),
    )].sort();

    for (const group of grouped.groups) {
      const grossPrincipal = group.buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
      if (group.blockedReason) {
        currencyResults.push({ currency: group.currency, result: null, skippedReason: 'INVALID_CURRENCY', grossPrincipal });
        continue;
      }
      if (group.buckets.length === 0) {
        currencyResults.push({ currency: group.currency, result: null, skippedReason: 'NO_BUCKETS', grossPrincipal: 0 });
        continue;
      }
      try {
        const result = buildEngine().computeBalance(
          {
            caseId: def.id,
            claimBuckets: group.buckets,
            payments: group.payments,
            asOfDate: def.domainInput.asOfDate,
            enforcementDate: def.domainInput.enforcementDate,
            mode: CalculationMode.PREVIEW,
            options: {
              dayCountBasis: 365,
              sameDayPaymentRule: SameDayPaymentRule.START_OF_DAY,
              roundingMode: RoundingMode.HALF_UP,
              roundingScope: RoundingScope.PER_SEGMENT,
              gapPolicy: GapPolicy.WARN_ONLY_FOR_PREVIEW,
              claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
            },
          },
          ratesFor(group.buckets, opts.annualRate ?? 0.24, def.domainInput.asOfDate),
          '2026-07-11T00:00:00.000Z',
          DEFAULT_INTERPRETATION_PROFILE_ID,
        );
        currencyResults.push({ currency: group.currency, result, grossPrincipal });
      } catch (error) {
        if (!(error instanceof InterestEngineError)) throw error;
        perCurrency.push({ currency: group.currency, code: error.code, message: error.message });
        currencyResults.push({ currency: group.currency, result: null, skippedReason: 'ENGINE_ERROR', grossPrincipal });
      }
    }

    const fatalCodes = [...invalidCurrencyCodes, ...(hasNoBuckets ? ['NO_BUCKETS'] : [])];
    balance = {
      asOfDate: def.domainInput.asOfDate,
      source: pay.source,
      currencyResults,
      projections: projection.projections,
      feeProjection: buildCaseBalanceFeeProjection({
        sourceItems: projection.sources,
        currencyResults: currencyResults.map((row) => ({
          currency: row.currency,
          resultAvailable: row.result != null,
          ...(row.skippedReason ? { skippedReason: row.skippedReason } : {}),
        })),
        globalBlockerCodes: fatalCodes,
      }),
      diagnostics: {
        fatal: fatalCodes.map((code) => ({ code, caseId: def.id })),
        assembler: [],
        payments: pay.diagnostics,
        currency: grouped.diagnostics,
        perCurrency,
      },
      overpayments: { held: [], blocked: [] },
    };
  }

  const display = toCaseBalanceDisplay({
    tenantId: TENANT_ID,
    caseId: def.id,
    balance,
    generatedAt: '2026-07-11T00:00:00.000Z',
  });
  return { balance, display };
}
