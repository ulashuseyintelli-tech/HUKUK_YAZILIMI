/**
 * DEBTOR-OF01-HISTORY-P04-C-I01 — ServiceOccurrenceRecordedConsumerService typed application
 * error. `ServiceOccurrenceRecordedEventNotFoundError` emsali: düz `Error` alt sınıfı, HTTP
 * semantiğine bağlanmaz (bu consumer'ın public controller'ı yok, outbox handler'ından çağrılır).
 */

export class ObjectionPeriodDaysUnresolvedError extends Error {
  constructor(reason: string) {
    super(`objectionPeriodDays canonical kaynaktan çözülemedi: ${reason}`);
    this.name = "ObjectionPeriodDaysUnresolvedError";
  }
  readonly code = "OBJECTION_PERIOD_DAYS_UNRESOLVED" as const;
}
