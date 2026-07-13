import { ProceedingType, RentalType, BankruptcyType, JudgmentExecutionType, NextActionType } from "@prisma/client";

/**
 * MPB-028(a) PR-3C — Canonical Proceeding-Type and Legal-Period Rule Matrix.
 *
 * Tek merkezli, typed kanonik süre kaynağı (owner Decision, 2026-07-13). Hiçbir tüketici
 * kod içinde +7/+10/+15/+30 gibi sabit sayı YAZMAZ — hepsi bu tablodan okunur.
 *
 * Kapsam dışı bırakılan ProceedingType'lar (owner'ın açık sınırı — "doğrulanmamış süre
 * kuralı ekleme; UNRESOLVED bırak"): PLEDGE, MORTGAGE, bağımsız EVICTION, PUBLIC_RECEIVABLE.
 * Bu tabloda bilinçli olarak YOKTURLAR; resolveLegalPeriodRule bunlar için UNRESOLVED (null)
 * döner — tahmin edilmiş bir sayı ASLA üretilmez.
 *
 * MTS bu tabloda YOKTUR — MTS bir ProceedingType değildir (bkz. PreEnforcementProcessType).
 *
 * Enstrüman (çek/bono/poliçe) ayrımı bilinçli olarak YOKTUR — owner Decision: CAMBIO'nun
 * süre kuralı enstrüman türüne göre farklılaşmaz; kanonik enstrüman kaynağı ayrı, mevcut
 * `CaseInstrument[]` modelidir, bu PR'ın kapsamı dışındadır.
 */

export interface LegalPeriodRule {
  readonly proceedingType: ProceedingType;
  readonly subTypeCode: string | null;
  readonly objectionDays: number | null;
  readonly paymentDays: number | null;
  readonly vacateDays: number | null;
  readonly performanceDays: number | null;
  readonly complaintDays: number | null;
  /**
   * true ise performanceDays kanonik tabloda sabit bir sayı TAŞIMAZ (owner Decision —
   * JUDGMENT_ENFORCEMENT.SPECIFIC_PERFORMANCE, İİK m.30 "bir işin yapılması/yapılmaması"):
   * mahkeme/icra müdürünce belirlenir, çağıran tarafından doğrulanmış bir girdi olarak
   * sağlanmalıdır (PR-2'nin objectionPeriodDays caller-supplied deseniyle aynı ilke) —
   * servis bu durumda TAHMİN ETMEZ, fail-closed davranır.
   */
  readonly requiresCallerSuppliedPerformanceDays: boolean;
  readonly nextActionType: NextActionType;
}

function rule(input: Omit<LegalPeriodRule, "requiresCallerSuppliedPerformanceDays"> & {
  requiresCallerSuppliedPerformanceDays?: boolean;
}): LegalPeriodRule {
  return { requiresCallerSuppliedPerformanceDays: false, ...input };
}

/**
 * Anahtar: `${proceedingType}` (subType'ı olmayan ProceedingType'lar için) veya
 * `${proceedingType}:${subTypeCode}` (RENT/BANKRUPTCY/JUDGMENT_ENFORCEMENT için).
 */
const RULE_MATRIX: ReadonlyMap<string, LegalPeriodRule> = new Map<string, LegalPeriodRule>([
  [
    ProceedingType.GENERAL_EXECUTION,
    rule({
      proceedingType: ProceedingType.GENERAL_EXECUTION,
      subTypeCode: null,
      objectionDays: 7,
      paymentDays: 7,
      vacateDays: null,
      performanceDays: null,
      complaintDays: null,
      nextActionType: NextActionType.HACIZ_REQUEST_ELIGIBLE,
    }),
  ],
  [
    ProceedingType.CAMBIO,
    rule({
      proceedingType: ProceedingType.CAMBIO,
      subTypeCode: null,
      objectionDays: 5,
      paymentDays: 10,
      vacateDays: null,
      performanceDays: null,
      complaintDays: null,
      nextActionType: NextActionType.HACIZ_REQUEST_ELIGIBLE,
    }),
  ],
  [
    `${ProceedingType.RENT}:${RentalType.RESIDENTIAL_COMMERCIAL}`,
    rule({
      proceedingType: ProceedingType.RENT,
      subTypeCode: RentalType.RESIDENTIAL_COMMERCIAL,
      objectionDays: 7,
      paymentDays: null,
      vacateDays: 30,
      performanceDays: null,
      complaintDays: null,
      nextActionType: NextActionType.EVICTION_REQUEST_ELIGIBLE,
    }),
  ],
  [
    `${ProceedingType.RENT}:${RentalType.GENERAL}`,
    rule({
      proceedingType: ProceedingType.RENT,
      subTypeCode: RentalType.GENERAL,
      objectionDays: 7,
      paymentDays: null,
      vacateDays: 10,
      performanceDays: null,
      complaintDays: null,
      nextActionType: NextActionType.EVICTION_REQUEST_ELIGIBLE,
    }),
  ],
  [
    `${ProceedingType.RENT}:${RentalType.CROP}`,
    rule({
      proceedingType: ProceedingType.RENT,
      subTypeCode: RentalType.CROP,
      objectionDays: 7,
      paymentDays: null,
      vacateDays: 60,
      performanceDays: null,
      complaintDays: null,
      nextActionType: NextActionType.EVICTION_REQUEST_ELIGIBLE,
    }),
  ],
  [
    `${ProceedingType.RENT}:${RentalType.EVICTION_COMMITMENT}`,
    rule({
      proceedingType: ProceedingType.RENT,
      subTypeCode: RentalType.EVICTION_COMMITMENT,
      objectionDays: 7,
      paymentDays: null,
      vacateDays: 15,
      performanceDays: null,
      complaintDays: null,
      nextActionType: NextActionType.EVICTION_REQUEST_ELIGIBLE,
    }),
  ],
  [
    `${ProceedingType.BANKRUPTCY}:${BankruptcyType.ORDINARY}`,
    rule({
      proceedingType: ProceedingType.BANKRUPTCY,
      subTypeCode: BankruptcyType.ORDINARY,
      objectionDays: 7,
      paymentDays: 7,
      vacateDays: null,
      performanceDays: null,
      complaintDays: null,
      nextActionType: NextActionType.BANKRUPTCY_REQUEST_ELIGIBLE,
    }),
  ],
  [
    `${ProceedingType.BANKRUPTCY}:${BankruptcyType.CAMBIO}`,
    rule({
      proceedingType: ProceedingType.BANKRUPTCY,
      subTypeCode: BankruptcyType.CAMBIO,
      objectionDays: 5,
      paymentDays: 5,
      vacateDays: null,
      performanceDays: null,
      complaintDays: null,
      nextActionType: NextActionType.BANKRUPTCY_REQUEST_ELIGIBLE,
    }),
  ],
  [
    `${ProceedingType.JUDGMENT_ENFORCEMENT}:${JudgmentExecutionType.MONEY_OR_SECURITY}`,
    rule({
      proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
      subTypeCode: JudgmentExecutionType.MONEY_OR_SECURITY,
      objectionDays: null,
      paymentDays: null,
      vacateDays: null,
      performanceDays: 7,
      complaintDays: null,
      nextActionType: NextActionType.FORCED_PERFORMANCE_ELIGIBLE,
    }),
  ],
  [
    `${ProceedingType.JUDGMENT_ENFORCEMENT}:${JudgmentExecutionType.MOVABLE_DELIVERY}`,
    rule({
      proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
      subTypeCode: JudgmentExecutionType.MOVABLE_DELIVERY,
      objectionDays: null,
      paymentDays: null,
      vacateDays: null,
      performanceDays: 7,
      complaintDays: null,
      nextActionType: NextActionType.FORCED_DELIVERY_ELIGIBLE,
    }),
  ],
  [
    `${ProceedingType.JUDGMENT_ENFORCEMENT}:${JudgmentExecutionType.IMMOVABLE_DELIVERY_OR_EVICTION}`,
    rule({
      proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
      subTypeCode: JudgmentExecutionType.IMMOVABLE_DELIVERY_OR_EVICTION,
      objectionDays: null,
      paymentDays: null,
      vacateDays: 7,
      performanceDays: null,
      complaintDays: null,
      nextActionType: NextActionType.EVICTION_REQUEST_ELIGIBLE,
    }),
  ],
  [
    `${ProceedingType.JUDGMENT_ENFORCEMENT}:${JudgmentExecutionType.SPECIFIC_PERFORMANCE}`,
    rule({
      proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
      subTypeCode: JudgmentExecutionType.SPECIFIC_PERFORMANCE,
      objectionDays: null,
      paymentDays: null,
      vacateDays: null,
      performanceDays: null,
      complaintDays: null,
      requiresCallerSuppliedPerformanceDays: true,
      nextActionType: NextActionType.FORCED_PERFORMANCE_ELIGIBLE,
    }),
  ],
  [
    `${ProceedingType.JUDGMENT_ENFORCEMENT}:${JudgmentExecutionType.MORTGAGE_JUDGMENT}`,
    rule({
      proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
      subTypeCode: JudgmentExecutionType.MORTGAGE_JUDGMENT,
      objectionDays: null,
      paymentDays: null,
      vacateDays: null,
      performanceDays: 30,
      complaintDays: null,
      nextActionType: NextActionType.SALE_REQUEST_ELIGIBLE,
    }),
  ],
]);

/**
 * Kanonik kuralı ProceedingType (+ varsa subTypeCode) üzerinden çözer. Eşleşme yoksa
 * (PLEDGE/MORTGAGE/bağımsız EVICTION/PUBLIC_RECEIVABLE dahil) null döner — tahmin ETMEZ.
 */
export function resolveLegalPeriodRule(
  proceedingType: ProceedingType,
  subTypeCode?: string | null,
): LegalPeriodRule | null {
  const key = subTypeCode ? `${proceedingType}:${subTypeCode}` : proceedingType;
  return RULE_MATRIX.get(key) ?? null;
}
