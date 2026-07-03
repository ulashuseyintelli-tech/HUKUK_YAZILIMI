/**
 * G4a: ClaimItem → ClaimBucket SAF ASSEMBLER ÇEKİRDEĞİ.
 *
 * Kilitli kararlar (ledger, ulas 2026-06-14):
 *  - Q1: her PRINCIPAL ClaimItem = AYRI ClaimBucket (tek-agregat yok).
 *  - Q3: bucket.amount = demandedAmount ?? amount; collectedAmount DÜŞÜLMEZ (tahsilat = G4b Payment).
 *  - Q4: costs/ancillaries AYRI projeksiyon olarak toplanır; bucket'lara DAĞITILMAZ.
 *  - Q6: INTEREST/PRE_INTEREST/POST_INTEREST DIŞLANIR (motor faizi yeniden hesaplar; sabit-tutar=E-G3).
 *  - Q2: faiz konfig çözüm zinciri (principal → tek-belirsiz-değil case INTEREST config → Case-level →
 *        diagnostic). Otomatik tahmin YOK; silent default YOK.
 *  - Gb: startDate çözülemezse diagnostic (issueDate/dueDate fallback YOK).
 *  - Gc: faiz konfig çözülemeyen principal → diagnostic + bucket ÜRETME (faizsiz bucket yok).
 *  - E-G2b: interestRate(%) → percentToRate → fixedRate(0-1), yalnız requiresFixedRate(code) ise.
 *
 * SAF FONKSİYON: DB/prisma yok, tenant okuma yok (çağıran tek-tenant/tek-case ACTIVE kalemleri verir).
 * Şema/migration/backfill yok. computeBalance'a CANLI bağlı değil (G4b/G4c).
 *
 * <remarks>Çağrıldığı yerler: (G4a'da canlı çağıran YOK — saf-additive; ileride G4b/G4c orkestrasyon).</remarks>
 */

import { ClaimBucket, AncillaryType, InterestTypeCode } from '../types/domain.types';
import { mapInterestTypeString, UnsupportedInterestTypeError } from '../mapping/interest-type-bridge';
import { classifyClaimItemType } from '../classification/claim-item-classifier';
import { requiresFixedRate, percentToRate } from '@shared/types';

/** Assembler girdisi — plain shape (prisma değil; Decimal'ler number'a çevrilmiş, tarihler ISO). */
export interface ClaimItemInput {
  id: string;
  itemType: string;
  /** Takipte talep edilen tutar (Q3 baz). Yoksa amount'a düşer. */
  demandedAmount?: number | null;
  amount: number;
  currency: string;
  /** Prisma InterestType (YASAL/SABIT/AVANS/TEMERRUT/YOKSUN/TICARI) veya null. */
  interestType?: string | null;
  /** Faiz oranı YÜZDE (Decimal→number). */
  interestRate?: number | null;
  /** ISO date (YYYY-MM-DD). */
  interestStartDate?: string | null;
  /**
   * TBK100 Interest Accrual Contract v1: ACCRUES/NO_INTEREST/UNKNOWN (Prisma InterestAccrualStatus,
   * string yüzeyi). undefined/null → eski kayıt/backfill-öncesi; UNKNOWN gibi ele alınır (davranış
   * değişmez — bkz. resolveInterestConfig, bu alan bugün resolution zincirini GATE ETMEZ).
   */
  interestAccrualStatus?: string | null;
  /** Yalnız ACCRUES ise anlamlı; ENFORCEMENT_PROCEEDING_DATE ise Case.caseDate mekanik fallback'i tetikler. */
  interestStartDateProvenance?: string | null;
  status: string;
  metadata?: Record<string, unknown> | null;
}

/** Case-level faiz fallback (Q2 adım 3). NOT: Case şemasında interestRate YOK → yalnız tür+başlangıç. */
export interface CaseInterestFallback {
  interestType?: string | null;
  interestStartDate?: string | null;
  /**
   * TBK100 Interest Accrual Contract v1: Case.caseDate (takip tarihi). YALNIZ item'ın kendi
   * interestStartDateProvenance='ENFORCEMENT_PROCEEDING_DATE' ise kullanılır — sessiz dueDate/issueDate
   * fallback'inden AYRI: kaynak zaten açıkça seçilmiş provenance, yorum gerektirmez.
   */
  enforcementProceedingDate?: string | null;
}

export type AssemblerDiagnosticCode =
  | 'MISSING_INTEREST_CONFIG'
  | 'AMBIGUOUS_INTEREST_CONFIG'
  | 'MISSING_START_DATE'
  | 'FIXED_RATE_REQUIRED'
  | 'UNSUPPORTED_INTEREST_TYPE'
  | 'UNMAPPED_ITEM_TYPE'
  | 'TAX_WITHOUT_PARENT'
  | 'TAX_TIER_DEFERRED'
  | 'ZERO_OR_NEGATIVE_AMOUNT'
  /** TBK100 Interest Accrual Contract v1: COST/ANCILLARY/TAX kalemi ACCRUES işaretli ama motor bu
   *  kategori için henüz faiz hesaplayamıyor — kalem yine sabit-tutar projeksiyonuna eklenir (davranış
   *  DEĞİŞMEZ), yalnız bu eksiklik sessiz kalmasın diye diagnostic üretilir. */
  | 'ACCRUAL_ENGINE_UNSUPPORTED'
  /** TBK100 Interest Accrual Contract v1: provenance=ENFORCEMENT_PROCEEDING_DATE ama Case.caseDate de
   *  yok — kaynak değeri hiç mevcut değil (genel MISSING_START_DATE'ten ayrı: burada AÇIK bir kaynak
   *  seçilmiş, yalnız o kaynağın kendisi boş). */
  | 'MISSING_START_DATE_SOURCE_VALUE';

export interface AssemblerDiagnostic {
  code: AssemblerDiagnosticCode;
  claimItemId: string;
  detail?: string;
}

export interface ClaimBucketAssemblyResult {
  buckets: ClaimBucket[];
  costs: Partial<Record<AncillaryType, number>>;
  ancillaries: Partial<Record<AncillaryType, number>>;
  excluded: { interestItemIds: string[] };
  diagnostics: AssemblerDiagnostic[];
}

interface ResolvedInterestConfig {
  interestType: string;
  interestRate?: number | null;
  interestStartDate?: string | null;
}

const ASSEMBLE_EXCLUDED_STATUSES: ReadonlySet<string> = new Set(['CANCELLED', 'WAIVED']);

/** demandedAmount ?? amount (Q3). collectedAmount HİÇ kullanılmaz. */
function baseAmount(item: ClaimItemInput): number {
  return item.demandedAmount ?? item.amount;
}

/** Bir ClaimItem faiz konfig taşıyor mu (type set)? */
function hasOwnInterestType(item: ClaimItemInput): boolean {
  return item.interestType != null && item.interestType !== '';
}

/**
 * ClaimItem[] → ClaimBucket[] + costs/ancillaries projeksiyon + diagnostics.
 * SAF: girdi-dışı yan etki yok.
 */
export function assembleClaimBuckets(
  items: ClaimItemInput[],
  caseInterest?: CaseInterestFallback,
): ClaimBucketAssemblyResult {
  const diagnostics: AssemblerDiagnostic[] = [];
  const costs: Partial<Record<AncillaryType, number>> = {};
  const ancillaries: Partial<Record<AncillaryType, number>> = {};
  const excludedInterestIds: string[] = [];
  const buckets: ClaimBucket[] = [];

  // Status CANCELLED/WAIVED hariç (artık talep edilmeyen alacak); gerisi (ACTIVE/COLLECTED) işlenir.
  const active = items.filter((i) => !ASSEMBLE_EXCLUDED_STATUSES.has(i.status));

  // Q2 adım-2 için: belirsizlik tespiti. principal sayısı + INTEREST-config kalemleri.
  const principals = active.filter((i) => classifyClaimItemType(i.itemType).category === 'PRINCIPAL');
  const interestConfigItems = active.filter(
    (i) => classifyClaimItemType(i.itemType).category === 'INTEREST' && hasOwnInterestType(i),
  );
  const distinctInterestConfigs = dedupeInterestConfigs(interestConfigItems);

  const addAncillaryBucketAmount = (
    target: Partial<Record<AncillaryType, number>>,
    ancType: AncillaryType,
    amount: number,
  ) => {
    target[ancType] = (target[ancType] ?? 0) + amount;
  };

  for (const item of active) {
    const cls = classifyClaimItemType(item.itemType);

    // INTEREST ClaimItem amount canonical balance’da talep edilmiş işlemiş faiz olarak sayılmaz;
    // sadece interest config fallback semantiğinde kullanılır. Talep edilmiş işlemiş faiz tutarının
    // bakiyeye dahil edilmesi ayrı hukukî/mimari karardır.
    if (cls.category === 'INTEREST') {
      excludedInterestIds.push(item.id);
      continue;
    }

    const base = baseAmount(item);
    if (!(base > 0)) {
      diagnostics.push({ code: 'ZERO_OR_NEGATIVE_AMOUNT', claimItemId: item.id, detail: `base=${base}` });
      continue;
    }

    if (cls.category === 'COST' && cls.ancillaryType) {
      warnIfAccrualEngineUnsupported(item, diagnostics);
      addAncillaryBucketAmount(costs, cls.ancillaryType, base);
      continue;
    }
    if (cls.category === 'ANCILLARY' && cls.ancillaryType) {
      warnIfAccrualEngineUnsupported(item, diagnostics);
      addAncillaryBucketAmount(ancillaries, cls.ancillaryType, base);
      continue;
    }

    if (cls.category === 'TAX') {
      warnIfAccrualEngineUnsupported(item, diagnostics);
      handleTax(item, base, costs, ancillaries, diagnostics, addAncillaryBucketAmount);
      continue;
    }

    if (cls.category === 'UNKNOWN') {
      diagnostics.push({ code: 'UNMAPPED_ITEM_TYPE', claimItemId: item.id, detail: item.itemType });
      continue;
    }

    // cls.category === 'PRINCIPAL' → bucket üret.
    const bucket = buildPrincipalBucket(
      item,
      base,
      { principalsCount: principals.length, distinctInterestConfigs, caseInterest },
      diagnostics,
    );
    if (bucket) buckets.push(bucket);
  }

  return { buckets, costs, ancillaries, excluded: { interestItemIds: excludedInterestIds }, diagnostics };
}

/** TBK100 Interest Accrual Contract v1: COST/ANCILLARY/TAX + ACCRUES → motor desteği yok, sessiz kalma. */
function warnIfAccrualEngineUnsupported(item: ClaimItemInput, diagnostics: AssemblerDiagnostic[]): void {
  if (item.interestAccrualStatus === 'ACCRUES') {
    diagnostics.push({ code: 'ACCRUAL_ENGINE_UNSUPPORTED', claimItemId: item.id, detail: item.itemType });
  }
}

function handleTax(
  item: ClaimItemInput,
  base: number,
  costs: Partial<Record<AncillaryType, number>>,
  ancillaries: Partial<Record<AncillaryType, number>>,
  diagnostics: AssemblerDiagnostic[],
  add: (t: Partial<Record<AncillaryType, number>>, a: AncillaryType, n: number) => void,
): void {
  const parent = (item.metadata as { taxParentCategory?: string } | null)?.taxParentCategory;
  if (parent === 'COST') {
    add(costs, AncillaryType.DIGER, base);
  } else if (parent === 'ANCILLARY') {
    add(ancillaries, AncillaryType.DIGER, base);
  } else if (parent === 'PRINCIPAL' || parent === 'INTEREST') {
    // G4a costs/ancillaries dışı tier'i DAĞITMAZ (Q4); G4b/G4c çözer.
    diagnostics.push({ code: 'TAX_TIER_DEFERRED', claimItemId: item.id, detail: `parent=${parent}` });
  } else {
    diagnostics.push({ code: 'TAX_WITHOUT_PARENT', claimItemId: item.id, detail: `parent=${parent ?? 'none'}` });
  }
}

function buildPrincipalBucket(
  item: ClaimItemInput,
  base: number,
  ctx: {
    principalsCount: number;
    distinctInterestConfigs: ResolvedInterestConfig[];
    caseInterest?: CaseInterestFallback;
  },
  diagnostics: AssemblerDiagnostic[],
): ClaimBucket | null {
  // TBK100 Interest Accrual Contract v1: NO_INTEREST = bilinçli faizsiz, HATA DEĞİL — diagnostic
  // üretmeden sessizce bucket üretilmez (MISSING_*'ten kategorik olarak farklı, "eksik veri" değil).
  if (item.interestAccrualStatus === 'NO_INTEREST') return null;

  // Q2 FAİZ ÇÖZÜM ZİNCİRİ
  const resolved = resolveInterestConfig(item, ctx, diagnostics);
  if (!resolved) return null; // diagnostic resolveInterestConfig içinde üretildi

  // interestType (Prisma string) → InterestTypeCode (E-G1 string-yüzeyi; YOKSUN/unknown → throw → diagnostic)
  let code: InterestTypeCode;
  try {
    code = mapInterestTypeString(resolved.interestType);
  } catch (e) {
    if (e instanceof UnsupportedInterestTypeError) {
      diagnostics.push({ code: 'UNSUPPORTED_INTEREST_TYPE', claimItemId: item.id, detail: resolved.interestType });
      return null;
    }
    throw e;
  }

  // startDate (Gb: yoksa diagnostic, tahmin yok — issueDate/dueDate fallback KESİNLİKLE YOK).
  // TBK100 Interest Accrual Contract v1: TEK istisna — provenance açıkça ENFORCEMENT_PROCEEDING_DATE
  // seçilmişse Case.caseDate'ten mekanik çözülür (sessiz tahmin DEĞİL: kaynak zaten açıkça seçilmiş).
  let resolvedStartDate = resolved.interestStartDate;
  if (!resolvedStartDate && item.interestStartDateProvenance === 'ENFORCEMENT_PROCEEDING_DATE') {
    resolvedStartDate = ctx.caseInterest?.enforcementProceedingDate ?? null;
    if (!resolvedStartDate) {
      diagnostics.push({ code: 'MISSING_START_DATE_SOURCE_VALUE', claimItemId: item.id, detail: 'ENFORCEMENT_PROCEEDING_DATE' });
      return null;
    }
  }
  if (!resolvedStartDate) {
    diagnostics.push({ code: 'MISSING_START_DATE', claimItemId: item.id });
    return null;
  }

  const bucket: ClaimBucket = {
    id: item.id,
    amount: base,
    currency: item.currency as ClaimBucket['currency'],
    startDate: resolvedStartDate,
    interestType: code,
    dayCountBasis: 365,
  };

  // E-G2b WIRING: requiresFixedRate ise interestRate(%) → fixedRate(0-1)
  if (requiresFixedRate(code)) {
    if (resolved.interestRate != null) {
      bucket.fixedRate = percentToRate(resolved.interestRate);
    } else {
      // Case-fallback rate veremez (Case'te interestRate yok); fixed türde oran zorunlu.
      diagnostics.push({ code: 'FIXED_RATE_REQUIRED', claimItemId: item.id, detail: code });
      return null;
    }
  }

  return bucket;
}

/**
 * Q2 zinciri: 1) principal kendi konfig → 2) tek-belirsiz-değil case INTEREST config →
 * 3) Case-level (yalnız tür+başlangıç) → 4) MISSING_INTEREST_CONFIG (Gc: bucket üretme).
 */
function resolveInterestConfig(
  item: ClaimItemInput,
  ctx: {
    principalsCount: number;
    distinctInterestConfigs: ResolvedInterestConfig[];
    caseInterest?: CaseInterestFallback;
  },
  diagnostics: AssemblerDiagnostic[],
): ResolvedInterestConfig | null {
  // 1) Principal'ın KENDİ konfigi
  if (hasOwnInterestType(item)) {
    return {
      interestType: item.interestType as string,
      interestRate: item.interestRate ?? null,
      interestStartDate: item.interestStartDate ?? null,
    };
  }

  // 2) Aynı case INTEREST config — yalnız BELİRSİZ DEĞİLSE
  if (ctx.distinctInterestConfigs.length > 0) {
    if (ctx.principalsCount === 1 && ctx.distinctInterestConfigs.length === 1) {
      return ctx.distinctInterestConfigs[0];
    }
    // çok-principal veya çok-distinct-config → eşleme belirsiz, tahmin YOK
    diagnostics.push({
      code: 'AMBIGUOUS_INTEREST_CONFIG',
      claimItemId: item.id,
      detail: `principals=${ctx.principalsCount}, configs=${ctx.distinctInterestConfigs.length}`,
    });
    return null;
  }

  // 3) Case-level fallback (yalnız tür + başlangıç; rate YOK)
  if (ctx.caseInterest?.interestType) {
    return {
      interestType: ctx.caseInterest.interestType,
      interestRate: null,
      interestStartDate: ctx.caseInterest.interestStartDate ?? null,
    };
  }

  // 4) Hiçbiri
  diagnostics.push({ code: 'MISSING_INTEREST_CONFIG', claimItemId: item.id });
  return null;
}

/** INTEREST-config kalemlerini (type+rate+startDate) tekilleştir. */
function dedupeInterestConfigs(interestItems: ClaimItemInput[]): ResolvedInterestConfig[] {
  const seen = new Map<string, ResolvedInterestConfig>();
  for (const i of interestItems) {
    const cfg: ResolvedInterestConfig = {
      interestType: i.interestType as string,
      interestRate: i.interestRate ?? null,
      interestStartDate: i.interestStartDate ?? null,
    };
    const key = `${cfg.interestType}|${cfg.interestRate ?? ''}|${cfg.interestStartDate ?? ''}`;
    if (!seen.has(key)) seen.set(key, cfg);
  }
  return [...seen.values()];
}
