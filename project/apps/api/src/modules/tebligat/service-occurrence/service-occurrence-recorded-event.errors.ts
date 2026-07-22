/**
 * DEBTOR-OF01-HISTORY-P04-A2 — canonical SERVICE_OCCURRENCE_RECORDED event payload access
 * typed application error. `ServiceOccurrenceValidationError` emsali: düz `Error` alt sınıfı,
 * HTTP semantiğine bağlanmaz (bu accessor'ın public controller'ı yok).
 */

export class ServiceOccurrenceRecordedEventNotFoundError extends Error {
  constructor(reason: string) {
    super(`Canonical SERVICE_OCCURRENCE_RECORDED event payload not accessible: ${reason}`);
    this.name = "ServiceOccurrenceRecordedEventNotFoundError";
  }
  readonly code = "SERVICE_OCCURRENCE_RECORDED_EVENT_NOT_FOUND" as const;
}
