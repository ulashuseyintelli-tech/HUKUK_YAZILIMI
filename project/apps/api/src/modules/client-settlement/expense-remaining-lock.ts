/**
 * ROLL-001 — computeExpenseRemaining üzerinde eşzamanlı APPLY yarışını önleyen advisory-lock key'i.
 *
 * ClientOffsetService (APPLY/REVERSAL) ve DispositionPostingService (reimbursement APPLY) AYNI kaynağı
 * (bir ExpenseRequest'in "remaining" değeri) okuyup yazıyor. Postgres pg_advisory_xact_lock(hashtext(key))
 * yalnız AYNI key string'i kullanan çağrılar arasında serialize eder — bu yüzden iki servis de BİREBİR aynı
 * string'i üretmeli (yeni/farklı bir namespace, ClientOffsetService'e de dokunulmadan cross-service race'i
 * ÇÖZMEZ). client-payout.service.ts'in kendi `payout:...` namespace'i KASITLI olarak AYRI (computeOutstanding/
 * CLIENT_PAYABLE farklı bir kaynak) — bununla KARIŞTIRILMAZ.
 *
 * Kapsam: client-scope (expenseRequestId-scope DEĞİL) — o client'ın tüm offset+reimbursement işlemleri
 * serialize olur. ClientOffsetService zaten bu ödünü veriyor (APPLY/REVERSAL çifti için); düşük-frekanslı
 * manuel finans operasyonu için kabul edilebilir.
 */
export function clientOffsetLockKey(tenantId: string, clientId: string, currency: string): string {
  return `client-offset:${tenantId}:${clientId}:${currency}`;
}
