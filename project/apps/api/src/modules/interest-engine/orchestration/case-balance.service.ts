/**
 * G4c-1: CaseBalanceService — compute-on-demand bakiye orkestrasyonu (ADDITIVE, READ-ONLY).
 *
 * Zincir: prisma OKU → assembleClaimBuckets(G4a) → mapPayments+groupByCurrency(G4b-1) →
 *         her currency grubu: deriveRateRequirements→RateProvider + sentetik fixed-rate → computeBalance.
 *
 * Kilitli kararlar (ledger, ulas 2026-06-14):
 *  - Q1 mode=PREVIEW (audit'siz, SAF computeBalance) · Q2 gapPolicy=WARN_ONLY_FOR_PREVIEW (gap bloklamaz,
 *    diagnostic'lenir) · Q3 fixed-rate bucket'lara sentetik CONTRACT RateEntry (coverage için) ·
 *    Q4 0-bucket grup → computeBalance ATLA + fail-closed NO_BUCKETS blocker · Q5 per-currency CalculationResult[]
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
import { findActiveCollectionAllocationHolds } from '../../collection/collection-allocation-hold';
import { readPolicyHoldClaimItemIds } from './claim-formation-policy-hold.reader';
import { hasFatalPaymentMapDiagnostic, mapPayments, PaymentSource } from '../calc-prep/payment-mapper';
import type { LedgerPaymentRow, CollectionRow, PaymentMapDiagnostic } from '../calc-prep/payment-mapper';
import { classifyCurrency, groupByCurrency } from '../calc-prep/currency-grouper';
import type { CurrencyGroupDiagnostic } from '../calc-prep/currency-grouper';
import { deriveRateRequirements } from '../calc-prep/rate-requirements';
import { findUncoveredRateBuckets } from '../calc-prep/rate-coverage';
import type { UncoveredRateBucket } from '../calc-prep/rate-coverage';
import { ClaimBucket, AncillaryType } from '../types/domain.types';
import { mapPersistedInterestTypeCode } from '../mapping/interest-type-bridge';
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
import { readCaseInterestTypeSource } from '../../../common/case-interest-type-source';
import {
  buildCaseBalanceFeeProjection,
  type CaseBalanceFeeProjection,
} from './case-balance-fee-projection';

/** Q2: compute-on-demand default options. gapPolicy=WARN_ONLY_FOR_PREVIEW → PREVIEW'de gap bloklamaz. */
const DEFAULT_OPTIONS: CalculationOptions = {
  dayCountBasis: 365,
  sameDayPaymentRule: SameDayPaymentRule.START_OF_DAY,
  roundingMode: RoundingMode.HALF_UP,
  roundingScope: RoundingScope.PER_SEGMENT,
  gapPolicy: GapPolicy.WARN_ONLY_FOR_PREVIEW,
  claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
};

export type CaseBalanceSkipReason =
  | 'NO_BUCKETS'
  | 'INVALID_CURRENCY'
  | 'ENGINE_ERROR'
  /**
   * K3-L D2-b1: bu para biriminde faiz ayarı çözülemeyen anapara var → motor çalıştırılmadı, kısmi bakiye yok.
   * K3-L TK-2: faiz dönemi kendi türündeki oran verisiyle kapsanmayan anapara da bu nedene düşer
   * (reasonCode RATE_COVERAGE_MISSING).
   */
  | 'INTEREST_UNRESOLVED'
  /** K3-L D2-b1: bu para biriminde açık faizsiz (NO_INTEREST) anapara var; kanonik motor henüz simüle etmiyor. */
  | 'NON_ACCRUING_NOT_SIMULATED';

export interface CaseBalanceCurrencyResult {
  currency: string;
  result: CalculationResult | null;
  skippedReason?: CaseBalanceSkipReason;
  /**
   * ALC-AUTH-3B (2026-07-04): bu currency grubundaki PRINCIPAL bucket'ların GROSS
   * (allocation-öncesi, ödemeden bağımsız) toplam tutarı — `assembleClaimBuckets()`'ın
   * ürettiği `ClaimBucket.amount` (Q3: demandedAmount ?? amount) değerlerinin toplamı.
   * ClaimItem verisine dayalıdır: masraf/vekalet ClaimItem'ı olmayan case'lerde bu alan
   * yalnız PRINCIPAL bucket'ları kapsar (COST/ANCILLARY zaten `projections`'ta ayrı taşınır).
   * `finalDebtStates.principal` (KALAN/net anapara) ile KARIŞTIRILMAMALI.
   */
  grossPrincipal: number;
  /**
   * K3-L D2-b1: bu para biriminde motora GİRMEYEN (simüle edilmeyen) anapara toplamı — açık faizsiz ya da faiz
   * ayarı çözülemeyen kalemler. Yalnız > 0 iken yazılır; `grossPrincipal`'a EKLENMEZ (o alan kova toplamıdır).
   */
  unsimulatedPrincipal?: number;
}

/**
 * K3-L D2-b1: kovası üretilemeyen anapara kalemi. `accruedInterest: null` = faiz BİLİNMİYOR / hesaplanmadı —
 * sıfır faiz SAYILMAZ (açık faizsizlik beyanında da motor bu PR'da simüle etmez).
 */
export interface CaseBalanceUnsimulatedPrincipal {
  claimItemId: string;
  currency: string;
  amount: number;
  kind: 'NON_ACCRUING' | 'UNRESOLVED';
  reasonCode: string;
  accruedInterest: null;
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

/**
 * K3-L TK-3: hesap tarihinden SONRA tarihli (ters kayıt netleşmesinden sonraki) ödeme — bu tarihin bakiyesine GİRMEDİ.
 * Kayıt değişmez; yalnız bu hesaptan çıkarılır ve bilgi olarak raporlanır.
 */
export interface CaseBalancePaymentAfterAsOf {
  id: string;
  date: string;
  amount: number;
  currency: string;
  source?: string;
}

/**
 * K3-L KP-7: hesap tarihine kadar (tarihi ≤ asOf), ters kayıt netleşmesinden (ADR-014 MUST-6) sonraki ödeme — motora
 * giren ödeme kümesinin kendisi. "Toplam tahsilat"ın ödeme kısmıdır; yüz değer.
 */
export type CaseBalancePaymentInScope = CaseBalancePaymentAfterAsOf;

/**
 * K3-L KP-3: talep edilmiş işlemiş faiz kalemi (INTEREST / PRE_INTEREST / POST_INTEREST). Kanonik hesaba DAHİL
 * EDİLMEDİ (assembler Q6) — toplama eklenmez (aynı faiz iki kez sayılmaz); yalnız varlığı ve tutarı görünür kılınır.
 */
export interface CaseBalanceClaimedInterestItem {
  claimItemId: string;
  itemType: string;
  /** demandedAmount ?? amount */
  amount: number;
  currency: string;
  includedInCanonical: false;
  reasonCode: 'CLAIMED_INTEREST_EXCLUDED_FROM_CANONICAL';
}

/** K3-L — mahsubu bekletilen tahsilat (defter kaydı yok; fazla ödeme DEĞİL; ödeme sayılmaz). */
export interface CaseBalanceAllocationHold {
  id: string;
  collectionId: string;
  amount: number;
  currency: string;
  holdReason: string;
  /** K3-L KP-7: bekletilen tahsilatın tarihi (Collection.date, ISO gün) — hesap tarihi kapsamı için; bilinmiyorsa null. */
  collectionDate?: string | null;
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
  /** ADR-014 PR-7: formula-free, currency-aware persisted source projection DTO. */
  feeProjection: CaseBalanceFeeProjection;
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
  /** K3-L: aktif bekletmeler — Collection fallback'inden DIŞLANDI; bilgi amaçlı. */
  allocationHolds?: CaseBalanceAllocationHold[];
  /** K3-L D2-b1: motora girmeyen anapara kalemleri (yalnız dolu iken yazılır). */
  unsimulatedPrincipals?: CaseBalanceUnsimulatedPrincipal[];
  /** K3-L TK-3: hesap tarihinden sonra tarihli ödemeler — bu bakiyeye girmedi (yalnız dolu iken yazılır). */
  paymentsAfterAsOf?: CaseBalancePaymentAfterAsOf[];
  /**
   * K3-L KP-7: hesap tarihine kadar net ödemeler — motora giren küme. Ana hesap yolunda HER ZAMAN yazılır (boş dahil);
   * yokluğu "ödeme kümesi bilinmiyor" demektir (görünüm tahsilat bloğunu üretmez, fail-closed).
   */
  paymentsInScope?: CaseBalancePaymentInScope[];
  /** K3-L KP-3: talep edilmiş işlemiş faiz kalemleri — kanonik hesaba dahil DEĞİL (yalnız dolu iken yazılır). */
  claimedInterestItems?: CaseBalanceClaimedInterestItem[];
}

/** K3-L KP-3: assembler'ın dışladığı talep edilmiş işlemiş faiz kalemleri → sonuç kaydı (kararlı sıra). */
function toClaimedInterestItems(
  items: ReadonlyArray<{ claimItemId: string; itemType: string; amount: number; currency: string }>,
): CaseBalanceClaimedInterestItem[] {
  return items
    .map((item) => ({
      claimItemId: item.claimItemId,
      itemType: item.itemType,
      amount: item.amount,
      currency: classifyCurrency(item.currency).currency,
      includedInCanonical: false as const,
      reasonCode: 'CLAIMED_INTEREST_EXCLUDED_FROM_CANONICAL' as const,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency) || a.claimItemId.localeCompare(b.claimItemId));
}

/** K3-L D2-b1: taşınan anapara → sonuç kaydı (kararlı sıra; faiz bilinmiyor = null, sıfır DEĞİL). */
function toUnsimulatedPrincipals(
  carry: ReadonlyArray<{ claimItemId: string; amount: number; currency: string; kind: 'NON_ACCRUING' | 'UNRESOLVED'; reasonCode: string }>,
): CaseBalanceUnsimulatedPrincipal[] {
  return carry
    .map((item) => ({
      claimItemId: item.claimItemId,
      currency: classifyCurrency(item.currency).currency,
      amount: item.amount,
      kind: item.kind,
      reasonCode: item.reasonCode,
      accruedInterest: null,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency) || a.claimItemId.localeCompare(b.claimItemId));
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
   * - CaseService.getCalculationSummary() → GET /cases/:id/calculation-summary (canonicalShadow + additive compatibility adapter)
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
      feeProjection: buildCaseBalanceFeeProjection({ sourceItems: [], currencyResults: [] }),
      diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
      overpayments: { held: [], blocked: [] },
    };

    // 1. Case (tenant-scoped) — faiz fallback kaynağı + varlık kontrolü
    // TBK100 Interest Accrual Contract v1: caseDate (takip tarihi) YALNIZ item'ın kendi
    // interestStartDateProvenance='ENFORCEMENT_PROCEEDING_DATE' ise kullanılır (assembler'da gate'li).
    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      // K3-L KP-2: dosya faiz türünün kaynağı (metadata.interestTypeSource) — dosya düzeyine düşen kalemde uyarı için
      select: { interestType: true, interestStartDate: true, caseDate: true, metadata: true },
    });
    if (!caseRow) {
      empty.diagnostics.fatal.push({ code: 'CASE_NOT_FOUND', caseId });
      empty.feeProjection = buildCaseBalanceFeeProjection({
        sourceItems: [],
        currencyResults: [],
        globalBlockerCodes: ['CASE_NOT_FOUND'],
      });
      return empty;
    }

    // 2. READ-ONLY okumalar (tenant-scoped)
    const [
      claimItems,
      ledgerRows,
      allCollections,
      heldOverpayments,
      blockedOverpayments,
      activeAllocationHolds,
      policyHoldClaimItemIds,
    ] = await Promise.all([
      this.prisma.claimItem.findMany({
        where: { caseId, tenantId, status: { not: ClaimItemStatus.CANCELLED } },
      }),
      this.prisma.ledgerEntry.findMany({
        where: { caseId, tenantId, entryType: { in: ['PAYMENT', 'REVERSAL'] }, status: 'CONFIRMED' },
        select: {
          id: true,
          tenantId: true,
          caseId: true,
          entryType: true,
          status: true,
          amount: true,
          currency: true,
          entryDate: true,
          effectiveDate: true,
          sourceType: true,
          reversesLedgerEntryId: true,
        },
      }),
      this.prisma.collection.findMany({ where: { caseId, tenantId } }),
      this.readHeldOverpayments(tenantId, caseId),
      this.readBlockedOverpaymentDiagnostics(tenantId, caseId),
      this.readActiveAllocationHolds(tenantId, caseId),
      // K3-L TK-10: güncel oluşum kaydı politika bekletmeli kalemler (23.7.8) — salt okuma
      readPolicyHoldClaimItemIds(this.prisma, tenantId, caseId),
    ]);
    // K3-L: mahsubu BEKLETİLEN tahsilat (defter kaydı yok) Collection fallback'ine girmez — girseydi ödeme sayılır,
    // sonra tamamlanınca defterden bir kez daha düşerdi (çift sayım). Bekletme ayrı diagnostic olarak raporlanır.
    const heldCollectionIds = new Set(activeAllocationHolds.map((hold) => hold.collectionId));
    const collections = allCollections.filter((c) => !heldCollectionIds.has(c.id));
    // K3-L KP-7: bekletilen tahsilatın tarihi zaten okunmuş tahsilat satırından bağlanır (ek sorgu yok) — hesap tarihi
    // kapsamı ("Toplam tahsilat" ≤ asOf) için.
    const collectionDates = new Map(allCollections.map((c) => [c.id, toISO(c.date)] as [string, string | null]));
    const allocationHolds: CaseBalanceAllocationHold[] = activeAllocationHolds.map((hold) => ({
      ...hold,
      collectionDate: collectionDates.get(hold.collectionId) ?? null,
    }));

    // 3. Assemble (G4a)
    const itemInputs: ClaimItemInput[] = claimItems.map((ci) => ({
      id: ci.id,
      itemType: ci.itemType,
      demandedAmount: toNum(ci.demandedAmount),
      amount: toNum(ci.amount) ?? 0,
      currency: ci.currency,
      interestType: ci.interestType ?? null,
      interestTypeCode:
        ci.interestTypeCode == null ? null : mapPersistedInterestTypeCode(ci.interestTypeCode),
      interestRate: toNum(ci.interestRate),
      interestStartDate: toISO(ci.interestStartDate),
      interestAccrualStatus: ci.interestAccrualStatus ?? null,
      interestStartDateProvenance: ci.interestStartDateProvenance ?? null,
      // K3-L TK-9: faizsizlik beyanı denetim alanları (PR-A0 A2) — satır zaten okunuyor, ek sorgu yok
      noInterestReason: ci.noInterestReason ?? null,
      noInterestConfirmedById: ci.noInterestConfirmedById ?? null,
      noInterestConfirmedAt: ci.noInterestConfirmedAt ? new Date(ci.noInterestConfirmedAt).toISOString() : null,
      // K3-L TK-10
      interestPolicyHold: policyHoldClaimItemIds.has(ci.id),
      status: ci.status,
      metadata: (ci.metadata as Record<string, unknown> | null) ?? null,
    }));
    const asm = assembleClaimBuckets(itemInputs, {
      interestType: caseRow.interestType ?? null,
      interestStartDate: toISO(caseRow.interestStartDate),
      enforcementProceedingDate: toISO(caseRow.caseDate),
      // K3-L KP-2
      interestTypeSource: readCaseInterestTypeSource((caseRow as { metadata?: unknown }).metadata),
    });

    // 4. Payments (G4b-1)
    const pay = mapPayments(
      ledgerRows.map(
        (e): LedgerPaymentRow => ({
          id: e.id,
          tenantId: e.tenantId,
          caseId: e.caseId,
          entryType: e.entryType,
          status: e.status,
          amount: e.amount as unknown as string,
          currency: e.currency,
          entryDate: e.entryDate,
          effectiveDate: e.effectiveDate ?? null,
          sourceType: e.sourceType ?? null,
          reversesLedgerEntryId: e.reversesLedgerEntryId ?? null,
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

    if (hasFatalPaymentMapDiagnostic(pay.diagnostics)) {
      const fatalCode = 'REVERSAL_INTEGRITY_INVALID';
      return {
        asOfDate,
        source: pay.source,
        currencyResults: [],
        projections: { costs: asm.costs, ancillaries: asm.ancillaries },
        feeProjection: buildCaseBalanceFeeProjection({
          sourceItems: asm.projectionItems,
          currencyResults: [],
          globalBlockerCodes: [fatalCode],
        }),
        diagnostics: {
          // K3-L D2-b1: ters kayıt engelinde de taşınan anaparanın engeli eksiksiz raporlanır (readiness INTEREST_BASE)
          fatal: [
            { code: fatalCode, caseId },
            ...(asm.principalCarry.some((item) => item.kind === 'UNRESOLVED') ? [{ code: 'INTEREST_UNRESOLVED', caseId }] : []),
            ...(asm.principalCarry.some((item) => item.kind === 'NON_ACCRUING') ? [{ code: 'NON_ACCRUING_NOT_SIMULATED', caseId }] : []),
          ],
          assembler: asm.diagnostics,
          payments: pay.diagnostics,
          currency: [],
          perCurrency: [],
        },
        overpayments: { held: heldOverpayments, blocked: blockedOverpayments },
        ...(asm.principalCarry.length > 0 ? { unsimulatedPrincipals: toUnsimulatedPrincipals(asm.principalCarry) } : {}),
      };
    }

    // K3-L TK-3: hesap tarihinden SONRAKİ ödeme bu tarihin bakiyesine girmez. Önceden motor faizi hesap tarihinde
    // keserken sonraki ödemeyi yine anaparadan düşüyordu (bakiye hiçbir tarihteki gerçek duruma karşılık gelmiyordu).
    // Filtre, ters kayıt netleşmesinden (mapPayments; ADR-014 MUST-6) SONRAKİ net ödeme listesine uygulanır; kayıt
    // değişmez, çıkarılan ödemeler ayrı bilgi olarak raporlanır.
    const paymentsInScope = pay.payments.filter((payment) => payment.date <= asOfDate);
    // K3-L KP-7: motora giren net ödeme kümesi açıkça taşınır ("Toplam tahsilat"ın ödeme kısmı; yüz değer)
    const paymentsInScopeOut: CaseBalancePaymentInScope[] = paymentsInScope
      .map((payment) => ({
        id: payment.id,
        date: payment.date,
        amount: payment.amount,
        currency: payment.currency,
        ...(payment.source != null ? { source: payment.source } : {}),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const paymentsAfterAsOf: CaseBalancePaymentAfterAsOf[] = pay.payments
      .filter((payment) => payment.date > asOfDate)
      .map((payment) => ({
        id: payment.id,
        date: payment.date,
        amount: payment.amount,
        currency: payment.currency,
        ...(payment.source != null ? { source: payment.source } : {}),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

    // 5. Currency gruplama (G4b-1)
    const grouped = groupByCurrency(asm.buckets, paymentsInScope);

    // K3-L D2-b1: kovası üretilemeyen anapara (açık faizsiz / faizi çözülemeyen) para birimi bazında taşınır. O para
    // biriminde motor ÇALIŞTIRILMAZ (kısmi totalDue ya da "sıfır faiz" varsayımı yok); satır + fatal + tanı üretilir.
    const carryByCurrency = new Map<string, { blockedReason?: string; items: typeof asm.principalCarry }>();
    const carryCurrencyDiagnostics: CurrencyGroupDiagnostic[] = [];
    for (const carry of asm.principalCarry) {
      const classified = classifyCurrency(carry.currency);
      const entry = carryByCurrency.get(classified.currency) ?? {
        ...(classified.blockedReason ? { blockedReason: classified.blockedReason } : {}),
        items: [],
      };
      entry.items.push(carry);
      carryByCurrency.set(classified.currency, entry);
      if (classified.blockedReason) {
        carryCurrencyDiagnostics.push({
          code: classified.blockedReason,
          currency: classified.currency,
          source: 'CLAIM_BUCKET',
          sourceId: carry.claimItemId,
          detail: `claimItemId=${carry.claimItemId};principalNotSimulated`,
        });
      }
    }
    const carrySkipReason = (items: typeof asm.principalCarry): CaseBalanceSkipReason =>
      items.some((item) => item.kind === 'UNRESOLVED') ? 'INTEREST_UNRESOLVED' : 'NON_ACCRUING_NOT_SIMULATED';
    const carryTotal = (items: typeof asm.principalCarry): number => items.reduce((sum, item) => sum + item.amount, 0);
    // Taşınan anaparası olan para biriminde "ödeme var, kova yok" bir para birimi uyuşmazlığı DEĞİLDİR (ödeme o para
    // biriminin simüle edilmeyen anaparasına aittir); gerçek neden yukarıdaki açık engeldir.
    const currencyDiagnostics = [
      ...grouped.diagnostics.filter(
        (diagnostic) => !(diagnostic.code === 'CURRENCY_MISMATCH' && carryByCurrency.has(diagnostic.currency)),
      ),
      ...carryCurrencyDiagnostics,
    ];

    const hasNoBuckets = grouped.groups.some(
      (group) => group.blockedReason == null && group.buckets.length === 0 && !carryByCurrency.has(group.currency),
    );
    const invalidCurrencyFatalCodes = [...new Set(
      currencyDiagnostics
        .map((diagnostic) => diagnostic.code)
        .filter((code) => code === 'CURRENCY_MISSING' || code === 'CURRENCY_UNSUPPORTED'),
    )].sort();

    // 6. Her currency grubu için computeBalance
    const now = new Date().toISOString();
    const currencyResults: CaseBalanceCurrencyResult[] = [];
    const perCurrency: CaseBalancePerCurrencyDiagnostic[] = [];
    // K3-L TK-2: faiz dönemi kendi türündeki oranlarla kapsanmayan kovalar (faiz bilinmiyor; sıfır sayılmaz)
    const rateUncovered: UncoveredRateBucket[] = [];

    for (const group of grouped.groups) {
      // ALC-AUTH-3B: gross (allocation-öncesi) PRINCIPAL toplamı — computeBalance sonucundan bağımsız,
      // bucket'lar zaten mevcutsa her zaman hesaplanabilir.
      const grossPrincipal = group.buckets.reduce((sum, b) => sum + b.amount, 0);

      // ADR-014 PR-6: eksik veya domain-dışı currency hiçbir hesaplama hattına girmez.
      // Raw currency kanıtı grup + diagnostic üzerinde korunur; normalizasyon/conversion yapılmaz.
      const carried = carryByCurrency.get(group.currency)?.items ?? [];
      if (group.blockedReason) {
        currencyResults.push({
          currency: group.currency,
          result: null,
          skippedReason: 'INVALID_CURRENCY',
          grossPrincipal,
          ...(carried.length > 0 ? { unsimulatedPrincipal: carryTotal(carried) } : {}),
        });
        continue;
      }

      // K3-L D2-b1: bu para biriminde simüle edilemeyen anapara var → motor çalıştırılmaz (kısmi bakiye yok)
      if (carried.length > 0) {
        currencyResults.push({
          currency: group.currency,
          result: null,
          skippedReason: carrySkipReason(carried),
          grossPrincipal,
          unsimulatedPrincipal: carryTotal(carried),
        });
        continue;
      }

      // Q4 / ADR-014 PR-2: bucket'sız grup (yalnız payment) hesaplanabilir bakiye
      // değildir. Currency kanıtı korunur; case-level fatal blocker aşağıda tekil taşınır.
      if (group.buckets.length === 0) {
        currencyResults.push({ currency: group.currency, result: null, skippedReason: 'NO_BUCKETS', grossPrincipal: 0 });
        continue;
      }

      try {
        const rates = await this.gatherRates(tenantId, group.buckets, asOfDate);
        // K3-L TK-2: oran verisi faiz dönemini gün gün kapsamıyorsa motor ÇALIŞTIRILMAZ — komşu/gelecek oran ya da
        // sıfır faizle "kesin" toplam üretilmez. Bilinen anapara korunur (kapsanan kovalar grossPrincipal'da, kapsanmayanlar
        // simüle edilmeyen anapara olarak); eksik dönem tanıda gösterilir. D2-b1 ile aynı sözleşme (ADR-014 RD01).
        const uncovered = findUncoveredRateBuckets(group.buckets, rates, asOfDate);
        if (uncovered.length > 0) {
          const uncoveredIds = new Set(uncovered.map((bucket) => bucket.claimItemId));
          rateUncovered.push(...uncovered);
          for (const bucket of uncovered) {
            perCurrency.push({
              currency: group.currency,
              code: 'RATE_COVERAGE_MISSING',
              message:
                `Oran verisi eksik: kalem ${bucket.claimItemId} (${bucket.interestType}) için ` +
                bucket.gaps.map((gap) => (gap.from === gap.to ? gap.from : `${gap.from}–${gap.to}`)).join(', ') +
                ' döneminde oran yok; faiz hesaplanmadı.',
            });
          }
          currencyResults.push({
            currency: group.currency,
            result: null,
            skippedReason: 'INTEREST_UNRESOLVED',
            grossPrincipal: group.buckets
              .filter((bucket) => !uncoveredIds.has(bucket.id))
              .reduce((sum, bucket) => sum + bucket.amount, 0),
            unsimulatedPrincipal: uncovered.reduce((sum, bucket) => sum + bucket.amount, 0),
          });
          continue;
        }
        const request: CalculationRequest = {
          caseId,
          claimBuckets: group.buckets,
          payments: group.payments,
          asOfDate,
          enforcementDate: toISO(caseRow.caseDate) ?? undefined,
          mode: CalculationMode.PREVIEW,
          options: DEFAULT_OPTIONS,
        };
        const result = this.engine.computeBalance(request, rates, now, DEFAULT_INTERPRETATION_PROFILE_ID);
        currencyResults.push({ currency: group.currency, result, grossPrincipal });
      } catch (e) {
        if (e instanceof InterestEngineError) {
          perCurrency.push({ currency: group.currency, code: e.code, message: e.message });
          currencyResults.push({ currency: group.currency, result: null, skippedReason: 'ENGINE_ERROR', grossPrincipal });
        } else {
          throw e;
        }
      }
    }

    // K3-L D2-b1: kovası ve ödemesi olmayan (grubu hiç oluşmayan) para birimindeki taşınan anapara da satır olarak görünür
    const groupedCurrencies = new Set(grouped.groups.map((group) => group.currency));
    for (const [currency, entry] of [...carryByCurrency.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (groupedCurrencies.has(currency)) continue;
      currencyResults.push({
        currency,
        result: null,
        skippedReason: entry.blockedReason ? 'INVALID_CURRENCY' : carrySkipReason(entry.items),
        grossPrincipal: 0,
        unsimulatedPrincipal: carryTotal(entry.items),
      });
    }

    // K3-L TK-2: oran kapsaması eksik kovalar da faizi çözülemeyen anapara olarak taşınır (tek liste, kararlı sıra)
    const unsimulated = [
      ...asm.principalCarry,
      ...rateUncovered.map((bucket) => ({
        claimItemId: bucket.claimItemId,
        amount: bucket.amount,
        currency: bucket.currency,
        kind: 'UNRESOLVED' as const,
        reasonCode: 'RATE_COVERAGE_MISSING',
      })),
    ];
    const fatalCodes = [
      ...invalidCurrencyFatalCodes,
      ...(hasNoBuckets ? ['NO_BUCKETS'] : []),
      ...(unsimulated.some((item) => item.kind === 'UNRESOLVED') ? ['INTEREST_UNRESOLVED'] : []),
      ...(unsimulated.some((item) => item.kind === 'NON_ACCRUING') ? ['NON_ACCRUING_NOT_SIMULATED'] : []),
    ];

    return {
      asOfDate,
      source: pay.source,
      currencyResults,
      projections: { costs: asm.costs, ancillaries: asm.ancillaries },
      feeProjection: buildCaseBalanceFeeProjection({
        sourceItems: asm.projectionItems,
        currencyResults: currencyResults.map((row) => ({
          currency: row.currency,
          resultAvailable: row.result != null,
          ...(row.skippedReason ? { skippedReason: row.skippedReason } : {}),
        })),
        globalBlockerCodes: fatalCodes,
      }),
      diagnostics: {
        fatal: fatalCodes.map((code) => ({ code, caseId })),
        assembler: asm.diagnostics,
        payments: pay.diagnostics,
        currency: currencyDiagnostics,
        perCurrency,
      },
      overpayments: { held: heldOverpayments, blocked: blockedOverpayments },
      allocationHolds,
      ...(unsimulated.length > 0 ? { unsimulatedPrincipals: toUnsimulatedPrincipals(unsimulated) } : {}),
      ...(paymentsAfterAsOf.length > 0 ? { paymentsAfterAsOf } : {}),
      paymentsInScope: paymentsInScopeOut,
      ...(asm.excluded.interestItems.length > 0
        ? { claimedInterestItems: toClaimedInterestItems(asm.excluded.interestItems) }
        : {}),
    };
  }

  /**
   * K3-L — aktif (HELD) bekletmeler; salt okuma. Test/mocks'ta model yoksa boş döner.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - CaseBalanceService.computeCaseBalance() → Collection fallback dışlaması + rapor
   * /// </remarks>
   */
  private async readActiveAllocationHolds(
    tenantId: string,
    caseId: string,
  ): Promise<CaseBalanceAllocationHold[]> {
    if (!this.prisma.collectionAllocationHold?.findMany) return [];
    const rows = await findActiveCollectionAllocationHolds(this.prisma, tenantId, caseId);
    return rows.map((row) => ({
      id: String(row.id),
      collectionId: String(row.collectionId),
      amount: toNum(row.amount) ?? 0,
      currency: String(row.currency || 'TRY'),
      holdReason: String(row.holdReason),
    }));
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
