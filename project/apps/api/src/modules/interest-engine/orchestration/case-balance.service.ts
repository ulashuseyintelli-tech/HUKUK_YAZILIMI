/**
 * G4c-1: CaseBalanceService — compute-on-demand bakiye orkestrasyonu (ADDITIVE, READ-ONLY).
 *
 * Zincir: prisma OKU → assembleClaimBuckets(G4a) → mapPayments+groupByCurrency(G4b-1) →
 *         her currency grubu: deriveRateRequirements→RateProvider + sentetik fixed-rate → computeBalance.
 *
 * Kilitli kararlar (ledger, ulas 2026-06-14):
 *  - Q1 mode=PREVIEW (audit'siz, SAF computeBalance) · Q2 gapPolicy=WARN_ONLY_FOR_PREVIEW (gap bloklamaz,
 *    diagnostic'lenir) · Q3 fixed-rate bucket'lara sentetik CONTRACT RateEntry (coverage için) ·
 *    Q4 0-bucket grup → computeBalance ATLA + skippedReason · Q5 per-currency CalculationResult[]
 *    (cross-currency toplam YOK) + birleşik diagnostics · Q6 endpoint YOK (yalnız servis).
 *  - ADDITIVE: trigger yok · persist yok · case_balance_view yok · summary-engine'e dokunulmaz ·
 *    READ-ONLY (prisma write/transaction yok) · mevcut canlı akış değişmez.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - InterestEngineController.getCaseBalance() → GET /interest-engine/case/:caseId/balance (read-only bakiye endpoint)
 * - BalanceShadowCompareService.compare() → summary-engine vs computeBalance read-only gözlem
 * </remarks>
 */

import { Injectable } from '@nestjs/common';
import { ClaimItemStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RateProviderService } from '../rates/rate-provider.service';
import type { RateEntry as ProviderRateEntry } from '../rates/rate-provider.service';
import { InterestEngineService } from '../interest-engine.service';
import { assembleClaimBuckets, ClaimItemInput } from '../assembler/claim-bucket-assembler';
import type { AssemblerDiagnostic } from '../assembler/claim-bucket-assembler';
import { mapPayments, PaymentSource } from '../calc-prep/payment-mapper';
import type { LedgerPaymentRow, CollectionRow, PaymentMapDiagnostic } from '../calc-prep/payment-mapper';
import { groupByCurrency } from '../calc-prep/currency-grouper';
import type { CurrencyGroupDiagnostic } from '../calc-prep/currency-grouper';
import { deriveRateRequirements } from '../calc-prep/rate-requirements';
import { ClaimBucket, AncillaryType } from '../types/domain.types';
import { RateEntry, RateSourceType } from '../rates/rate-entry.entity';
import {
  CalculationRequest,
  CalculationResult,
  CalculationOptions,
  GapPolicy,
  ClaimPriorityRule,
  DEFAULT_INTERPRETATION_PROFILE_ID,
} from '../types/calculation.types';
import { CalculationMode, RoundingMode, RoundingScope, SameDayPaymentRule } from '../types/common.types';
import { InterestEngineError } from '../errors/interest-engine-errors';

/** Q2: compute-on-demand default options. gapPolicy=WARN_ONLY_FOR_PREVIEW → PREVIEW'de gap bloklamaz. */
const DEFAULT_OPTIONS: CalculationOptions = {
  dayCountBasis: 365,
  sameDayPaymentRule: SameDayPaymentRule.START_OF_DAY,
  roundingMode: RoundingMode.HALF_UP,
  roundingScope: RoundingScope.PER_SEGMENT,
  gapPolicy: GapPolicy.WARN_ONLY_FOR_PREVIEW,
  claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
};

export type CaseBalanceSkipReason = 'NO_BUCKETS' | 'ENGINE_ERROR';

export interface CaseBalanceCurrencyResult {
  currency: string;
  result: CalculationResult | null;
  skippedReason?: CaseBalanceSkipReason;
}

export interface CaseBalancePerCurrencyDiagnostic {
  currency: string;
  code: string;
  message: string;
}

export interface CaseBalanceHeldOverpayment {
  id: string;
  collectionId: string;
  sourceLedgerEntryId: string | null;
  amount: number;
  remainingAmount: number;
  currency: string;
  status: string;
}

export interface CaseBalanceBlockedOverpaymentReason {
  reason: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface CaseBalanceBlockedOverpaymentDiagnostic {
  id: string;
  collectionId?: string;
  sourceLedgerEntryId?: string;
  attemptedOverpaymentAmount: number;
  currency: string;
  blockedReasons: CaseBalanceBlockedOverpaymentReason[];
  createdAt?: string;
}

export interface CaseBalanceResult {
  asOfDate: string;
  source: PaymentSource;
  currencyResults: CaseBalanceCurrencyResult[];
  /** G4a costs/ancillaries projeksiyonu (bilgi amaçlı; dağıtım G4c-3). */
  projections: {
    costs: Partial<Record<AncillaryType, number>>;
    ancillaries: Partial<Record<AncillaryType, number>>;
  };
  diagnostics: {
    fatal: Array<{ code: string; caseId: string }>;
    assembler: AssemblerDiagnostic[];
    payments: PaymentMapDiagnostic[];
    currency: CurrencyGroupDiagnostic[];
    perCurrency: CaseBalancePerCurrencyDiagnostic[];
  };
  overpayments: {
    held: CaseBalanceHeldOverpayment[];
    blocked: CaseBalanceBlockedOverpaymentDiagnostic[];
  };
}

/** Decimal|null → number|null (read boundary; money 15,2). */
function toNum(v: unknown): number | null {
  if (v == null) return null;
  return Number(typeof v === 'object' && v !== null ? (v as { toString(): string }).toString() : v);
}

/** Date|null → ISO gün (YYYY-MM-DD) | null. */
function toISO(d: Date | null | undefined): string | null {
  if (!d) return null;
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeBlockedReasons(value: unknown): CaseBalanceBlockedOverpaymentReason[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const rec = asRecord(item);
      const reason = asString(rec?.reason);
      if (!reason) return null;
      const message = asString(rec?.message);
      const details = asRecord(rec?.details);
      return {
        reason,
        ...(message ? { message } : {}),
        ...(details ? { details } : {}),
      };
    })
    .filter((item): item is CaseBalanceBlockedOverpaymentReason => item != null);
}

/** RateProvider RateEntry → engine entity RateEntry (alan adı/şekil köprüsü). */
function toEntityRate(r: ProviderRateEntry): RateEntry {
  return {
    id: r.id,
    interestType: r.interestType,
    validFrom: r.validFrom,
    validTo: r.validTo,
    annualRate: r.annualRate,
    source: RateSourceType.TCMB, // rate_schedule kaynaklı; RateProvider enum taşımıyor
    sourceReference: r.sourceName,
    publishedDate: r.publishedAt ? r.publishedAt.slice(0, 10) : undefined,
    versionHash: r.id,
    createdAt: r.publishedAt ?? new Date().toISOString(),
  };
}

@Injectable()
export class CaseBalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateProvider: RateProviderService,
    private readonly engine: InterestEngineService,
  ) {}

  /**
   * Bir case için compute-on-demand bakiye hesaplar (per-currency). READ-ONLY, side-effect yok.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - InterestEngineController.getCaseBalance() → GET /interest-engine/case/:caseId/balance (read-only bakiye endpoint)
   * - InterestEngineController.getCaseBalanceDisplay() → GET /interest-engine/case/:caseId/balance/display (backend display contract)
   * - BalanceShadowCompareService.compare() → summary-engine vs computeBalance read-only gözlem
   * - CaseService.getCalculationSummary() → GET /cases/:id/calculation-summary (canonicalShadow diagnostic)
   * </remarks>
   */
  async computeCaseBalance(
    tenantId: string,
    caseId: string,
    asOfDate: string,
  ): Promise<CaseBalanceResult> {
    const empty: CaseBalanceResult = {
      asOfDate,
      source: 'NONE',
      currencyResults: [],
      projections: { costs: {}, ancillaries: {} },
      diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
      overpayments: { held: [], blocked: [] },
    };

    // 1. Case (tenant-scoped) — faiz fallback kaynağı + varlık kontrolü
    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { interestType: true, interestStartDate: true },
    });
    if (!caseRow) {
      empty.diagnostics.fatal.push({ code: 'CASE_NOT_FOUND', caseId });
      return empty;
    }

    // 2. READ-ONLY okumalar (tenant-scoped)
    const [claimItems, ledgerRows, collections, heldOverpayments, blockedOverpayments] = await Promise.all([
      this.prisma.claimItem.findMany({
        where: { caseId, tenantId, status: { not: ClaimItemStatus.CANCELLED } },
      }),
      this.prisma.ledgerEntry.findMany({ where: { caseId, tenantId, entryType: 'PAYMENT' } }),
      this.prisma.collection.findMany({ where: { caseId, tenantId } }),
      this.readHeldOverpayments(tenantId, caseId),
      this.readBlockedOverpaymentDiagnostics(tenantId, caseId),
    ]);

    // 3. Assemble (G4a)
    const itemInputs: ClaimItemInput[] = claimItems.map((ci) => ({
      id: ci.id,
      itemType: ci.itemType,
      demandedAmount: toNum(ci.demandedAmount),
      amount: toNum(ci.amount) ?? 0,
      currency: ci.currency,
      interestType: ci.interestType ?? null,
      interestRate: toNum(ci.interestRate),
      interestStartDate: toISO(ci.interestStartDate),
      status: ci.status,
      metadata: (ci.metadata as Record<string, unknown> | null) ?? null,
    }));
    const asm = assembleClaimBuckets(itemInputs, {
      interestType: caseRow.interestType ?? null,
      interestStartDate: toISO(caseRow.interestStartDate),
    });

    // 4. Payments (G4b-1)
    const pay = mapPayments(
      ledgerRows.map(
        (e): LedgerPaymentRow => ({
          id: e.id,
          entryType: e.entryType,
          status: e.status,
          amount: e.amount as unknown as string,
          currency: e.currency,
          entryDate: e.entryDate,
          effectiveDate: e.effectiveDate ?? null,
          sourceType: e.sourceType ?? null,
        }),
      ),
      collections.map(
        (c): CollectionRow => ({
          id: c.id,
          status: c.status,
          cancelledAt: c.cancelledAt ?? null,
          amount: c.amount as unknown as string,
          currency: c.currency,
          date: c.date,
          sourceType: c.sourceType ?? null,
          channel: c.channel ?? null,
        }),
      ),
    );

    // 5. Currency gruplama (G4b-1)
    const grouped = groupByCurrency(asm.buckets, pay.payments);

    // 6. Her currency grubu için computeBalance
    const now = new Date().toISOString();
    const currencyResults: CaseBalanceCurrencyResult[] = [];
    const perCurrency: CaseBalancePerCurrencyDiagnostic[] = [];

    for (const group of grouped.groups) {
      // Q4: bucket'sız grup (yalnız payment) → computeBalance atla
      if (group.buckets.length === 0) {
        currencyResults.push({ currency: group.currency, result: null, skippedReason: 'NO_BUCKETS' });
        continue;
      }

      try {
        const rates = await this.gatherRates(tenantId, group.buckets, asOfDate);
        const request: CalculationRequest = {
          caseId,
          claimBuckets: group.buckets,
          payments: group.payments,
          asOfDate,
          mode: CalculationMode.PREVIEW,
          options: DEFAULT_OPTIONS,
        };
        const result = this.engine.computeBalance(request, rates, now, DEFAULT_INTERPRETATION_PROFILE_ID);
        currencyResults.push({ currency: group.currency, result });
      } catch (e) {
        if (e instanceof InterestEngineError) {
          perCurrency.push({ currency: group.currency, code: e.code, message: e.message });
          currencyResults.push({ currency: group.currency, result: null, skippedReason: 'ENGINE_ERROR' });
        } else {
          throw e;
        }
      }
    }

    return {
      asOfDate,
      source: pay.source,
      currencyResults,
      projections: { costs: asm.costs, ancillaries: asm.ancillaries },
      diagnostics: {
        fatal: [],
        assembler: asm.diagnostics,
        payments: pay.diagnostics,
        currency: grouped.diagnostics,
        perCurrency,
      },
      overpayments: { held: heldOverpayments, blocked: blockedOverpayments },
    };
  }

  private async readHeldOverpayments(
    tenantId: string,
    caseId: string,
  ): Promise<CaseBalanceHeldOverpayment[]> {
    const client = (this.prisma as any).collectionOverpayment;
    if (!client?.findMany) return [];

    const rows = await client.findMany({
      where: { tenantId, caseId, status: 'HELD' },
      select: {
        id: true,
        collectionId: true,
        sourceLedgerEntryId: true,
        amount: true,
        remainingAmount: true,
        currency: true,
        status: true,
      },
    });

    return rows
      .map((row: any) => ({
        id: String(row.id),
        collectionId: String(row.collectionId),
        sourceLedgerEntryId: row.sourceLedgerEntryId == null ? null : String(row.sourceLedgerEntryId),
        amount: toNum(row.amount) ?? 0,
        remainingAmount: toNum(row.remainingAmount) ?? 0,
        currency: String(row.currency || 'TRY'),
        status: String(row.status || 'HELD'),
      }))
      .filter((row: CaseBalanceHeldOverpayment) => row.remainingAmount > 0);
  }

  private async readBlockedOverpaymentDiagnostics(
    tenantId: string,
    caseId: string,
  ): Promise<CaseBalanceBlockedOverpaymentDiagnostic[]> {
    const client = (this.prisma as any).icrabotTimelineEntry;
    if (!client?.findMany) return [];

    const rows = await client.findMany({
      where: { tenantId, caseId, type: 'OVERPAYMENT_BLOCKED' },
      select: { id: true, body: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return rows
      .map((row: any) => {
        const body = asRecord(row.body);
        const payload = asRecord(body?.payload) ?? {};
        const attemptedOverpaymentAmount = toNum(payload.attemptedOverpaymentAmount) ?? 0;
        return {
          id: String(row.id),
          ...(asString(payload.collectionId) ? { collectionId: asString(payload.collectionId) as string } : {}),
          ...(asString(payload.sourceLedgerEntryId)
            ? { sourceLedgerEntryId: asString(payload.sourceLedgerEntryId) as string }
            : {}),
          attemptedOverpaymentAmount,
          currency: asString(payload.currency) ?? 'UNKNOWN',
          blockedReasons: normalizeBlockedReasons(payload.blockedReasons),
          ...(row.createdAt ? { createdAt: new Date(row.createdAt).toISOString() } : {}),
        };
      })
      .filter((row: CaseBalanceBlockedOverpaymentDiagnostic) => row.attemptedOverpaymentAmount > 0);
  }

  /**
   * Değişken bucket'lar için RateProvider'dan fetch + fixed-rate bucket'lar için SENTETİK CONTRACT
   * RateEntry (Q3: policy-gate coverage; segment-builder yine bucket.fixedRate kullanır).
   */
  private async gatherRates(
    tenantId: string,
    buckets: ClaimBucket[],
    asOfDate: string,
  ): Promise<RateEntry[]> {
    const requirements = deriveRateRequirements(buckets, asOfDate);
    const fetched: RateEntry[] = [];
    for (const r of requirements) {
      const rates = await this.rateProvider.getRatesForPeriod({
        interestType: r.interestType,
        startDate: r.startDate,
        endDate: r.endDate,
        currency: r.currency,
        tenantId,
      });
      // RateProvider RateEntry (sourceId/sourceName/publishedAt) → engine entity RateEntry
      // (source/versionHash/createdAt). Engine yalnız interestType/validFrom/validTo/annualRate'i
      // hesapta kullanır; gerisi metadata (G4c-1 audit'siz). İlk köprü burada.
      fetched.push(...rates.map(toEntityRate));
    }

    const synthetic: RateEntry[] = buckets
      .filter((b) => b.fixedRate !== undefined)
      .map((b) => ({
        id: `FIXED_${b.id}`,
        interestType: b.interestType,
        validFrom: b.startDate,
        validTo: asOfDate,
        annualRate: b.fixedRate as number,
        source: RateSourceType.CONTRACT,
        versionHash: `fixed-${b.id}`,
        createdAt: new Date().toISOString(),
      }));

    return [...fetched, ...synthetic];
  }
}
