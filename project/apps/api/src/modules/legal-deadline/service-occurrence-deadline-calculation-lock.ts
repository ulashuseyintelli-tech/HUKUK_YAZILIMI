/**
 * DEBTOR-OF01-HISTORY-P04-B — advisory-lock key üretimi.
 * `service-occurrence-lock.ts` (P02) emsali: saf, side-effect'siz string üretici; her çağrıda
 * birebir aynı string üretilmeli ki `pg_advisory_xact_lock(hashtext(...))` gerçekten aynı
 * kaynağa karşı serialize etsin.
 *
 * Lock scope KASITLI olarak sourceTebligatId üzerindendir (serviceOccurrenceId ÜZERİNDEN DEĞİL):
 * invariant "aynı Tebligat için iki eşzamanlı calculation iki ACTIVE canonical snapshot
 * üretemez" — bir Tebligat'ın zaman içinde birden fazla ServiceOccurrence'ı olabilir (owner
 * brief §10), ama en fazla bir ACTIVE LegalDeadlineSnapshot'ı olmalıdır (LegalDeadlineService.
 * calculateDeadline'ın kendi sourceTebligatId-scoped existingActive sorgusuyla aynı ilke).
 */
export function serviceOccurrenceDeadlineCalculationLockKey(
  tenantId: string,
  sourceTebligatId: string,
): string {
  return `service-occurrence-deadline-calculation:${tenantId}:${sourceTebligatId}`;
}
