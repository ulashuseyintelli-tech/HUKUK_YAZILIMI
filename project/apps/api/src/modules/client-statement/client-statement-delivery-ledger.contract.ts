/**
 * CAD C3-B05 — KALICI TESLİM DEFTERİ (OUTBOX) SÖZLEŞMESİ.
 *
 * NEDEN PORT: kalıcı defter yeni bir tablo ister (dedupeKey üzerinde UNIQUE +
 * attempts/reservedAt/nextRetryAt/sentAt/lastError). Şema yazma yetkisi bu hatta
 * DEĞİLDİR (MIGRATION OWNER = X3), bu yüzden B05 defterin DAVRANIŞINI sözleşme +
 * saf karar fonksiyonları olarak sabitler; kalıcı adaptör şema açıldığında bağlanır.
 * Sözleşme in-memory bir defteri "kalıcı" saymaz: port bağlı değilse koşu bunu
 * `persistentDeliveryLedger: false` ile açıkça raporlar.
 *
 * SEÇİM KANITI: repoda hazır ve sertifikalı emsal `PoaExpiryNotificationDelivery`
 * + `PoaExpiryDeliveryService` (dedupeKey @unique üzerinden rezervasyon, stale-lock
 * devralma, sınırlı deneme, gecikmeli retry). Aynı durum makinesi ve aynı sınırlar
 * burada YENİDEN TÜRETİLMEZ, doğrudan devralınır — yeni bir retry/eşik politikası
 * İCAT EDİLMEZ. Genel amaçlı `IcrabotOutboxAction` kuyruğu ise v28 engine'in
 * action-handler sözleşmesine bağlıdır (aksiyon tipi + handler kaydı); ekstre
 * teslimi onun handler modeline ait değildir, bu yüzden domain defteri seçilmiştir.
 */

/** Emsal: POA_DELIVERY_MAX_ATTEMPTS (poa-expiry-delivery.service.ts). */
export const CLIENT_STATEMENT_DELIVERY_MAX_ATTEMPTS = 3;
/** Emsal: POA_DELIVERY_RETRY_MINUTES. */
export const CLIENT_STATEMENT_DELIVERY_RETRY_MINUTES = 60;
/** Emsal: POA_DELIVERY_LOCK_TIMEOUT_MINUTES (asılı kalan PENDING rezervasyonun devralınması). */
export const CLIENT_STATEMENT_DELIVERY_LOCK_TIMEOUT_MINUTES = 15;

export type ClientStatementDeliveryLedgerStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface ClientStatementDeliveryLedgerRecord {
  dedupeKey: string;
  status: ClientStatementDeliveryLedgerStatus;
  attempts: number;
  reservedAt: Date | null;
  nextRetryAt: Date | null;
  sentAt: Date | null;
  lastError: string | null;
}

export type ClientStatementDeliveryClaimSkipReason =
  | 'already-sent'
  | 'max-attempts'
  | 'fresh-pending'
  | 'retry-not-due'
  | 'unknown-status';

export type ClientStatementDeliveryClaimDecision =
  | { action: 'CLAIM'; kind: 'NEW' | 'TAKEOVER_STALE_PENDING' | 'RETRY_FAILED' }
  | { action: 'SKIP'; reason: ClientStatementDeliveryClaimSkipReason };

/**
 * Bir teslim denemesinin YAPILIP yapılmayacağına karar veren SAF çekirdek
 * (PoaExpiryDeliveryService.claimExistingReservation mantığının test edilebilir hâli).
 *
 * "Tekrar gönder" düğmesi DEĞİLDİR: retry yalnız aynı dedupeKey üzerinde, deneme
 * sınırı ve gecikme kuralına uyarak yapılır; SENT bir kayıt asla yeniden gönderilmez.
 */
export function decideDeliveryClaim(
  existing: ClientStatementDeliveryLedgerRecord | null,
  now: Date,
): ClientStatementDeliveryClaimDecision {
  if (!existing) return { action: 'CLAIM', kind: 'NEW' };
  if (existing.status === 'SENT') return { action: 'SKIP', reason: 'already-sent' };
  if (existing.attempts >= CLIENT_STATEMENT_DELIVERY_MAX_ATTEMPTS) {
    return { action: 'SKIP', reason: 'max-attempts' };
  }

  if (existing.status === 'PENDING') {
    const staleCutoff = new Date(now.getTime() - CLIENT_STATEMENT_DELIVERY_LOCK_TIMEOUT_MINUTES * 60 * 1000);
    if (existing.reservedAt && existing.reservedAt >= staleCutoff) {
      return { action: 'SKIP', reason: 'fresh-pending' };
    }
    return { action: 'CLAIM', kind: 'TAKEOVER_STALE_PENDING' };
  }

  if (existing.status === 'FAILED') {
    if (existing.nextRetryAt && existing.nextRetryAt > now) {
      return { action: 'SKIP', reason: 'retry-not-due' };
    }
    return { action: 'CLAIM', kind: 'RETRY_FAILED' };
  }

  return { action: 'SKIP', reason: 'unknown-status' };
}

/** Deneme sınırına ulaşıldıysa retry planlanmaz (terminal başarısızlık). */
export function isTerminalAttempt(attempts: number): boolean {
  return attempts >= CLIENT_STATEMENT_DELIVERY_MAX_ATTEMPTS;
}

/** Terminal olmayan başarısızlıkta bir sonraki denemenin en erken zamanı. */
export function computeNextRetryAt(attempts: number, now: Date): Date | null {
  if (isTerminalAttempt(attempts)) return null;
  return new Date(now.getTime() + CLIENT_STATEMENT_DELIVERY_RETRY_MINUTES * 60 * 1000);
}

export interface ClientStatementDeliveryLedgerReservation {
  tenantId: string;
  clientId: string;
  statementId: string;
  dedupeKey: string;
  periodKey: string;
  recipientEmail: string;
  now: Date;
}

/**
 * Kalıcı defterin sözleşmesi. Adaptör, `dedupeKey` üzerindeki UNIQUE kısıtı ve
 * koşullu `updateMany` ile yarışları kaybeden koşunun `null` almasını GARANTİ eder
 * (emsal: PoaExpiryDeliveryService.claimDeliveryReservation).
 */
export interface ClientStatementDeliveryLedgerPort {
  /** Rezervasyonu kazandıysa kayıt, kaybettiyse `null` döner — çift gönderim yapısal olarak imkânsızdır. */
  claim(input: ClientStatementDeliveryLedgerReservation): Promise<ClientStatementDeliveryLedgerRecord | null>;
  markSent(dedupeKey: string, now: Date): Promise<void>;
  /** Başarısızlığı KALICI olarak damgalar; terminal ise `nextRetryAt` null bırakılır. */
  markFailed(dedupeKey: string, attempts: number, error: string, now: Date): Promise<void>;
}

/** Defter kaydına yazılacak hata metni — sınırlı uzunluk (emsal: truncateError/500). */
export function truncateLedgerError(message: string | null | undefined): string {
  return (message || 'Bilinmeyen hata').slice(0, 500);
}
