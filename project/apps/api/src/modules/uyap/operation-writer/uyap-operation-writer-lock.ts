/**
 * UYAP-OPERATION-ATTEMPT-WRITER-P05B — advisory-lock key üretimi.
 * `service-occurrence-lock.ts` emsali: saf, side-effect'siz string üretici. Standalone ve
 * WithinTransaction girişleri AYNI core primitive'i çağırdığı için her iki uçta birebir aynı
 * string üretilir ve `pg_advisory_xact_lock(hashtext(...))` gerçekten aynı kaynağa karşı serialize eder.
 */

/**
 * Create scope — canonical idempotency scope (owner-ratified): tenantId + idempotencyKey.
 * Aynı logical create'in eşzamanlı replay'lerini serileştirir; farklı tenant/key kilitlenmez.
 */
export function uyapOperationCreateLockKey(tenantId: string, idempotencyKey: string): string {
  return `uyap-operation:create:${tenantId}:${idempotencyKey}`;
}

/**
 * Attempt-append scope — operation başına monotonic, gap-free attemptNumber tahsisi.
 * `AggregateVersionAllocator` emsali: aynı operation'a eşzamanlı append'ler bu tx süresince
 * serileştirilir; DB tarafı `@@unique([operationId, attemptNumber])` ile belt+suspenders korur.
 */
export function uyapOperationAttemptLockKey(tenantId: string, operationId: string): string {
  return `uyap-operation:attempt:${tenantId}:${operationId}`;
}
