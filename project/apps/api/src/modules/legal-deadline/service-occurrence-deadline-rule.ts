/**
 * DEBTOR-OF01-HISTORY-P04-B-R2-I03 — occurrence-driven legal service date adapter.
 *
 * Artık kendi rejim tablosunu TUTMAZ — hesap `LegalServiceDateRuleCore`'a delege edilir
 * (bkz. legal-service-date-rule-core.ts, I01). Bu dosya yalnız:
 * (a) ServiceOccurrence'ın native alanlarını (serviceRegimeCode/serviceCompletionMode/
 *     substituteRecipientBasis) çekirdeğin ortak facts şekline eşler,
 * (b) tamlık gate'ini (addressTypeAtOccurrence/serviceRegimeCode eksikse fail-closed) korur,
 * (c) çekirdeğin typed hatalarını bu modülün var olan `DeadlineInputIncompleteError`
 *     sözleşmesine sarar — `ServiceOccurrenceDeadlineCalculationService.mapWriteError()`
 *     hiç değişmeden bunu tanımaya devam eder.
 *
 * DEBTOR-OF01-HISTORY-P04-B'nin kendi STOP-02 bulgusu (serviceDateRole=MUHTAR_DELIVERY'nin
 * TK_21_1/TK_21_2/TK_20'yi tek değerde eritmesi, TK_20'nin +15 gün kuralını KAYBETMESİ)
 * burada çözülüyor: serviceRegimeCode + serviceCompletionMode artık serviceDateRole'ün
 * yerini alıyor — MUHTAR_DELIVERY adından veya fiziksel teslim rolünden ARTIK hiçbir
 * hukukî sonuç çıkarılmıyor (owner brief P04-B-R2-I03 PROHIBITED).
 */
import {
  ServiceOccurrenceRegimeCode,
  ServiceCompletionMode,
  SubstituteRecipientBasis,
} from "@prisma/client";
import { DeadlineInputIncompleteError } from "./service-occurrence-deadline-calculation.errors";
import {
  resolveLegalServiceDate,
  IncompatibleCompletionModeError,
  UnsupportedServiceRegimeCodeError,
} from "./legal-service-date-rule-core";

export interface OccurrenceLegalServiceDateResult {
  legalServiceDate: Date;
  calculationRule: string;
  deadlineReasonCode: string;
}

export interface OccurrenceDeadlineFacts {
  serviceRegimeCode: ServiceOccurrenceRegimeCode | null;
  serviceCompletionMode: ServiceCompletionMode | null;
  substituteRecipientBasis: SubstituteRecipientBasis | null;
  addressTypeAtOccurrence: string | null;
  occurredOn: Date;
}

/**
 * Fails closed (`DeadlineInputIncompleteError`) rather than guessing when:
 * - `addressTypeAtOccurrence` is missing (owner brief §17 TEST-05 — genel tamlık gate'i,
 *   rejim seçimini etkilemez, yalnız context fact olarak zorunlu, değişmedi).
 * - `serviceRegimeCode` is null (failed/redirect PTT outcome — hesaplanacak hiçbir şey yok).
 * - çekirdek `IncompatibleCompletionModeError`/`UnsupportedServiceRegimeCodeError` fırlatırsa
 *   (eksik/uyumsuz completion mode, deprecated/tanınmayan regime kodu).
 */
export function determineOccurrenceLegalServiceDate(
  facts: OccurrenceDeadlineFacts,
): OccurrenceLegalServiceDateResult {
  if (!facts.addressTypeAtOccurrence) {
    throw new DeadlineInputIncompleteError("addressTypeAtOccurrence is missing");
  }
  if (!facts.serviceRegimeCode) {
    throw new DeadlineInputIncompleteError(
      "serviceRegimeCode is null (no delivery/deposit mechanism occurred for this occurrence)",
    );
  }

  try {
    return resolveLegalServiceDate({
      serviceRegimeCode: facts.serviceRegimeCode,
      serviceCompletionMode: facts.serviceCompletionMode,
      substituteRecipientBasis: facts.substituteRecipientBasis,
      baseDate: facts.occurredOn,
    });
  } catch (error) {
    if (
      error instanceof IncompatibleCompletionModeError ||
      error instanceof UnsupportedServiceRegimeCodeError
    ) {
      throw new DeadlineInputIncompleteError(error.message);
    }
    throw error;
  }
}
