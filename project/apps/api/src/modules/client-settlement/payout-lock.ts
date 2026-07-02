/**
 * CBND-5 (H2) — computeOutstanding (CLIENT_PAYABLE, per caseClientId) üzerinde eşzamanlı payout+offset
 * yarışını önleyen advisory-lock key'i.
 *
 * ClientPayoutService.create() ve ClientOffsetService.createOffset()/reverseOffset() (yalnız payable
 * leg) AYNI kaynağı (bir caseClientId'nin outstanding payable'ı, computeOutstanding ile hesaplanır)
 * okuyup tüketiyor. Postgres pg_advisory_xact_lock(hashtext(key)) yalnız AYNI key string'ini kullanan
 * çağrılar arasında serialize eder — bu yüzden iki servis de BİREBİR aynı string'i üretmeli.
 *
 * ClientOffsetService'in kendi expense-remaining kilidi (clientOffsetLockKey, client-scope,
 * expense-remaining-lock.ts) AYRI ve KORUNUR — o farklı bir kaynağı (ExpenseRequest.remaining)
 * DispositionPostingService/CollectionReversalService ile paylaşır, bu dosyayla KARIŞTIRILMAZ.
 * Offset transaction'ı İKİ kilidi de alır: ÖNCE clientOffsetLockKey (mevcut sıra, değişmedi), SONRA bu
 * payoutLockKey (yalnız payable leg'e özgü, caseClientId-scope). Sıra SABİTTİR — payout hiçbir zaman
 * clientOffsetLockKey almaz; bu yüzden döngü (deadlock) oluşamaz.
 *
 * Kapsam: caseClientId-scope (client-scope DEĞİL) — ClientPayoutService.create()'in mevcut
 * granularitesiyle birebir aynı; caseId de dahildir (ClientPayoutService'in tarihsel key formatını
 * bozmadan aynen taşır, davranış korunur).
 */
export function payoutLockKey(tenantId: string, caseId: string, caseClientId: string, currency: string): string {
  return `payout:${tenantId}:${caseId}:${caseClientId}:${currency}`;
}
