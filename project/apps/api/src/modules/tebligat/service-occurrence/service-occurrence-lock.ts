/**
 * DEBTOR-OF01-HISTORY-P02 — ServiceOccurrence advisory-lock key üretimi.
 * `payout-lock.ts` (client-settlement) emsali: saf, side-effect'siz string üretici; her iki uçta
 * (create/supersede) birebir aynı string üretilmeli ki pg_advisory_xact_lock(hashtext(...)) gerçekten
 * aynı kaynağa karşı serialize etsin.
 */

/** STRONG_SOURCE_HASH create — canonical idempotency scope (owner brief §8): tenantId+sourceTebligatId+sourceSystemCode+sourcePayloadHash. */
export function serviceOccurrenceCreateLockKey(
  tenantId: string,
  sourceTebligatId: string,
  sourceSystemCode: string,
  sourcePayloadHash: string,
): string {
  return `service-occurrence:create:${tenantId}:${sourceTebligatId}:${sourceSystemCode}:${sourcePayloadHash}`;
}

/** Supersede — previousOccurrenceId scope'unda en fazla bir supersede'nin başarılı olmasını garanti eder. */
export function serviceOccurrenceSupersedeLockKey(tenantId: string, previousOccurrenceId: string): string {
  return `service-occurrence:supersede:${tenantId}:${previousOccurrenceId}`;
}
