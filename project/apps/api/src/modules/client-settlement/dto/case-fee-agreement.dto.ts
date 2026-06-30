import { FeeAgreementType, FeeAgreementBase, Prisma } from '@prisma/client';

/**
 * S8-B FAZ-2 — CaseFeeAgreement service girdi/çıktı sözleşmeleri (interface DTO).
 *
 * Faithful-decimal: para (flatAmount) STRING olarak gelir; servis boundary'de doğrular
 * (ham number/float YASAK — resolveFee deseni). Oran percentageBps = basis-points (int; float YOK).
 * v1: yalnız GROSS taban + FLAT_AMOUNT | PERCENTAGE_OF_COLLECTION. NET_OF_EXPENSE servis tarafından
 * REDDEDİLİR (FAZ-1b expense auto-apply canlı olana dek). ValidationPipe ENFORCE etmez → service validate eder.
 */
export interface CreateCaseFeeAgreementInput {
  /** Sözleşmenin bağlı olduğu CaseClient (scope = caseClient). */
  caseClientId: string;
  feeType: FeeAgreementType;
  /** FLAT_AMOUNT'ta ZORUNLU — faithful decimal-string (>0, ≤2 ondalık). PERCENTAGE'da olmamalı. */
  flatAmount?: string;
  /** PERCENTAGE_OF_COLLECTION'da ZORUNLU — basis-points int (1..10000). FLAT'ta olmamalı. */
  percentageBps?: number;
  /** v1: yalnız GROSS. Omit → GROSS. NET_OF_EXPENSE REDDEDİLİR. */
  feeBase?: FeeAgreementBase;
  /** ISO tarih; omit → now(). */
  effectiveFrom?: string;
  note?: string;
}

/**
 * Edit = yeni versiyon (eski SUPERSEDED + yeni ACTIVE). caseClientId DEĞİŞTİRİLEMEZ
 * (mevcut sözleşmeden devralınır); bu yüzden update girdisinde yer almaz.
 */
export interface UpdateCaseFeeAgreementInput {
  feeType: FeeAgreementType;
  flatAmount?: string;
  percentageBps?: number;
  feeBase?: FeeAgreementBase;
  effectiveFrom?: string;
  note?: string;
}

/** validateFeeShape çıktısı (normalize edilmiş, persist-hazır alanlar). */
export interface NormalizedFeeShape {
  flatAmount: Prisma.Decimal | null;
  percentageBps: number | null;
  feeBase: FeeAgreementBase;
  effectiveFrom: Date;
}
