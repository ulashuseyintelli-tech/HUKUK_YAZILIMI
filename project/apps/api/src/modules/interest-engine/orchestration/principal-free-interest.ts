import { requiresFixedRate, percentToRate } from '@shared/types';
import { classifyCurrency } from '../calc-prep/currency-grouper';
import type { ClaimBucket, InterestTypeCode } from '../types/domain.types';

/**
 * Anaparasız dosyada (yalnız masraf / fer'i; örn. ilam vekâlet ücreti + yargılama gideri) faizi AÇIKÇA belirlenmiş
 * kalemin faizini mevcut motorla hesaplamak için uygunluk kararı (owner GO-COMPLETE 13.11.2026, D1). SAF.
 *
 * İlke:
 * - Faiz durumu (ACCRUES), kalemin KENDİ kanonik faiz türü, başlangıç tarihi ve başlangıç dayanağı açıkça kayıtlı olmalı.
 *   Dosya düzeyindeki faiz türüne / başlangıcına yedek olarak DÜŞÜLMEZ; açıklamadan çıkarım yapılmaz.
 * - UNKNOWN / boş durum "belirlenemedi" kalır; sıfır SAYILMAZ. NO_INTEREST kayıtlı faizsizdir.
 * - Sahte anapara YOK: kurulan kova yalnız bellekte faiz matrahıdır; anapara alanlarına, kovalarına ya da toplamlarına
 *   girmez. Kalem başına ayrı motor çağrısı yapılır (ödeme verilmez) — ödemeli dosya bu yola hiç girmez.
 * - Desteklenmeyen girdi (bitiş tarihi, eksik sabit oran, başlangıç hesap tarihinden sonra…) hesaplanmaz; neden kodu taşır.
 */
export type PrincipalFreeInterestStatus = 'COMPUTED' | 'NOT_COMPUTED' | 'UNKNOWN' | 'NO_INTEREST';

export type PrincipalFreeInterestReason =
  | 'ACCRUAL_STATUS_UNKNOWN'
  | 'INTEREST_POLICY_HOLD'
  | 'INTEREST_TYPE_CODE_MISSING'
  | 'START_DATE_PROVENANCE_MISSING'
  | 'START_DATE_MISSING'
  | 'ENFORCEMENT_DATE_MISSING'
  | 'START_DATE_AFTER_AS_OF'
  | 'INTEREST_END_DATE_UNSUPPORTED'
  | 'FIXED_RATE_REQUIRED'
  | 'CURRENCY_UNSUPPORTED'
  | 'RATE_COVERAGE_MISSING'
  | 'ENGINE_ERROR';

export interface PrincipalFreeInterestResult {
  status: PrincipalFreeInterestStatus;
  reasonCode: PrincipalFreeInterestReason | null;
  /** Yalnız COMPUTED'da dolu; motorun kendi yuvarlanmış değerleri. Takip tarihi yoksa öncesi / sonrası null kalır. */
  preEnforcementInterest: number | null;
  postEnforcementInterest: number | null;
  totalInterest: number | null;
  /** Hesapta kullanılan başlangıç (COMPUTED / hesaplanamadı satırında bilgi). */
  startDate: string | null;
  interestTypeCode: string | null;
  startDateProvenance: string | null;
}

export interface PrincipalFreeInterestItem {
  id: string;
  amount: number;
  currency: string;
  interestAccrualStatus: string | null;
  interestTypeCode: InterestTypeCode | string | null;
  interestRate: number | null;
  interestStartDate: string | null;
  interestEndDate: string | null;
  interestStartDateProvenance: string | null;
  interestPolicyHold?: boolean;
}

const notComputed = (
  reasonCode: PrincipalFreeInterestReason,
  item: PrincipalFreeInterestItem,
  startDate: string | null = item.interestStartDate,
): PrincipalFreeInterestResult => ({
  status: 'NOT_COMPUTED',
  reasonCode,
  preEnforcementInterest: null,
  postEnforcementInterest: null,
  totalInterest: null,
  startDate,
  interestTypeCode: item.interestTypeCode ?? null,
  startDateProvenance: item.interestStartDateProvenance ?? null,
});

/**
 * Kalem → (faiz matrahı kovası) ya da (hesaplanmayan sonuç). Kova kalem kimliğini taşır; tutar kayıtlı kalem tutarıdır.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseBalanceService.computeCaseBalance() principal-free dalı → GET /interest-engine/case/:id/balance/display,
 * ///    GET /cases/:id/calculation-summary (anaparasizKalemDokumu)
 * /// </remarks>
 */
export function resolvePrincipalFreeInterestBucket(
  item: PrincipalFreeInterestItem,
  ctx: { enforcementProceedingDate: string | null; asOfDate: string },
): { bucket: ClaimBucket } | { result: PrincipalFreeInterestResult } {
  // Faiz işlemeyen / durumu bilinmeyen kalemde kayıtlı tür ve tarih (örn. doğrulanmamış aktarım değeri) sonuca TAŞINMAZ.
  const empty = {
    preEnforcementInterest: null,
    postEnforcementInterest: null,
    totalInterest: null,
    startDate: null,
    interestTypeCode: null,
    startDateProvenance: null,
  };
  if (item.interestAccrualStatus === 'NO_INTEREST') return { result: { status: 'NO_INTEREST', reasonCode: null, ...empty } };
  if (item.interestAccrualStatus !== 'ACCRUES') return { result: { status: 'UNKNOWN', reasonCode: 'ACCRUAL_STATUS_UNKNOWN', ...empty } };
  if (item.interestPolicyHold) return { result: notComputed('INTEREST_POLICY_HOLD', item) };
  if (item.interestTypeCode == null) return { result: notComputed('INTEREST_TYPE_CODE_MISSING', item) };
  if (item.interestStartDateProvenance == null) return { result: notComputed('START_DATE_PROVENANCE_MISSING', item) };

  // Başlangıç: kalemin kayıtlı tarihi; YALNIZ dayanak açıkça ENFORCEMENT_PROCEEDING_DATE ise takip tarihinden (assembler ile aynı).
  let startDate = item.interestStartDate;
  if (!startDate && item.interestStartDateProvenance === 'ENFORCEMENT_PROCEEDING_DATE') {
    startDate = ctx.enforcementProceedingDate;
    if (!startDate) return { result: notComputed('ENFORCEMENT_DATE_MISSING', item, null) };
  }
  if (!startDate) return { result: notComputed('START_DATE_MISSING', item, null) };
  if (startDate > ctx.asOfDate) return { result: notComputed('START_DATE_AFTER_AS_OF', item, startDate) };
  // Motor kovası bitiş tarihi taşımaz; kayıtlı bitiş tarihi sessizce yok sayılmaz.
  if (item.interestEndDate) return { result: notComputed('INTEREST_END_DATE_UNSUPPORTED', item, startDate) };

  const classified = classifyCurrency(item.currency);
  if (classified.blockedReason) return { result: notComputed('CURRENCY_UNSUPPORTED', item, startDate) };

  const code = item.interestTypeCode as InterestTypeCode;
  const bucket: ClaimBucket = {
    id: item.id,
    amount: item.amount,
    currency: classified.currency as ClaimBucket['currency'],
    startDate,
    interestType: code,
    dayCountBasis: 365,
  };
  if (requiresFixedRate(code)) {
    if (typeof item.interestRate === 'number' && Number.isFinite(item.interestRate) && item.interestRate > 0) {
      bucket.fixedRate = percentToRate(item.interestRate);
    } else {
      return { result: notComputed('FIXED_RATE_REQUIRED', item, startDate) };
    }
  }
  return { bucket };
}

export function computedPrincipalFreeInterest(
  item: PrincipalFreeInterestItem,
  bucket: ClaimBucket,
  engine: { totalInterest: number; preEnforcementInterest?: number; postEnforcementInterest?: number },
): PrincipalFreeInterestResult {
  return {
    status: 'COMPUTED',
    reasonCode: null,
    preEnforcementInterest: engine.preEnforcementInterest ?? null,
    postEnforcementInterest: engine.postEnforcementInterest ?? null,
    totalInterest: engine.totalInterest,
    startDate: bucket.startDate,
    interestTypeCode: bucket.interestType,
    startDateProvenance: item.interestStartDateProvenance ?? null,
  };
}

export function failedPrincipalFreeInterest(
  item: PrincipalFreeInterestItem,
  bucket: ClaimBucket,
  reasonCode: 'RATE_COVERAGE_MISSING' | 'ENGINE_ERROR',
): PrincipalFreeInterestResult {
  return notComputed(reasonCode, item, bucket.startDate);
}
