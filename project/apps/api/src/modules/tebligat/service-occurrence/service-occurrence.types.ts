import {
  ServiceOccurrence,
  ServiceOccurrenceType,
  ServiceOccurrenceTimePrecision,
  TebligatAddressType,
  ServiceOccurrenceServiceDateRole,
} from "@prisma/client";

/**
 * DEBTOR-OF01-HISTORY-P02 — ServiceOccurrence write-side command/result sözleşmesi.
 * Canonical authority: DEBTOR-DBP-04-LEGAL-STATE-LEGALGUARD-v1.0.md §12.2 (PR #1498 / fee56c1e),
 * schema foundation PR #1503 / 5bf09496.
 */

/** occurrenceType, normal create yolunda LEGACY_BASELINE'ı KABUL ETMEZ (owner brief §11). */
export type NormalServiceOccurrenceType = Exclude<ServiceOccurrenceType, "LEGACY_BASELINE">;

export enum IdempotencyMode {
  /** tenantId + sourceTebligatId + sourceSystemCode + sourcePayloadHash — transaction-safe, advisory-lock korumalı. */
  STRONG_SOURCE_HASH = "STRONG_SOURCE_HASH",
  /** Duplicate önleme YOK — yalnız güçlü dış-kaynak anahtarı olmayan kayıtlar için açık seçim. */
  NONE = "NONE",
}

export interface ServiceOccurrenceActor {
  userId?: string | null;
  systemCode?: string | null;
}

export interface CreateServiceOccurrenceCommand {
  tenantId: string;
  sourceTebligatId: string;
  occurrenceType: NormalServiceOccurrenceType;
  sourceSystemCode: string;
  sourceCode: string;
  occurredOn: Date;
  occurredAt?: Date | null;
  timePrecision: ServiceOccurrenceTimePrecision;
  /**
   * DEBTOR-OF01-HISTORY-P04-A1: deadline-hesabı için gerekli immutable context/raw fact'ler.
   * addressTypeAtOccurrence bu servisin normal create/supersede yolunda HER ZAMAN zorunludur
   * (occurrenceType=LEGACY_BASELINE zaten ayrı guard'la reddedilir — bkz. isLegacyBaselineType).
   * serviceDateRole yalnız gerçek bir teslim/tevdi MEKANİZMASI varsa doldurulur; başarısız/
   * yönlendirme sonuçlarında (hiçbir mekanizma gerçekleşmedi) bilinçli olarak null kalabilir.
   */
  addressTypeAtOccurrence: TebligatAddressType;
  serviceDateRole?: ServiceOccurrenceServiceDateRole | null;
  receivedAt?: Date | null;
  barcodeNo?: string | null;
  sourceNote?: string | null;
  sourcePayloadHash?: string | null;
  evidenceReference?: string | null;
  actor: ServiceOccurrenceActor;
  idempotencyMode: IdempotencyMode;
}

export type CreateServiceOccurrenceResult =
  | { occurrence: ServiceOccurrence; created: true }
  | { occurrence: ServiceOccurrence; created: false; reason: "IDEMPOTENT_REUSE" };

/** Supersede edilecek occurrence'ın yerini alacak yeni occurrence'ın factual alanları — create ile aynı sözleşme. */
export type ServiceOccurrenceReplacementFields = Omit<
  CreateServiceOccurrenceCommand,
  "tenantId" | "sourceTebligatId" | "actor" | "idempotencyMode"
>;

export interface SupersedeServiceOccurrenceCommand {
  tenantId: string;
  previousOccurrenceId: string;
  replacement: ServiceOccurrenceReplacementFields;
  correctionReasonCode: string;
  actor: ServiceOccurrenceActor;
  idempotencyMode: IdempotencyMode;
}

export interface SupersedeServiceOccurrenceResult {
  newOccurrence: ServiceOccurrence;
  previousOccurrence: ServiceOccurrence;
}

/** İdempotency/eşitlik karşılaştırmasına giren factual alanlar (owner brief §8 — tam bu 8 alan). */
export const FACTUAL_PAYLOAD_FIELDS = [
  "occurrenceType",
  "sourceCode",
  "occurredOn",
  "occurredAt",
  "timePrecision",
  "receivedAt",
  "barcodeNo",
  "evidenceReference",
  "addressTypeAtOccurrence", // DEBTOR-OF01-HISTORY-P04-A1
  "serviceDateRole", // DEBTOR-OF01-HISTORY-P04-A1
] as const;
