/**
 * DEBTOR-OF01-HISTORY-P04-C-I02 — dar, domain-agnostik non-retryable outbox contract.
 *
 * ActionHandlerService.dispatch() bu marker'ı `instanceof` ile tanır (bkz. dispatch() catch
 * bloğu) — hiçbir domain hata sınıfı (OccurrenceTenantMismatchError, DeadlineInputIncompleteError,
 * vb.) shared infrastructure içine hard-code EDİLMEZ. Bir consumer, kalıcı/asla-retry-ile-
 * düzelmeyecek bir hatayı bu sınıfa SARARSA (wrap), action ilk denemede dead-letter'a düşer;
 * sarmayan tüm hatalar (marker taşımayan) mevcut exponential retry/backoff yoluna aynen gider —
 * default davranış DEĞİŞMEZ.
 *
 * `message` HER ZAMAN güvenli, PII/secret İÇERMEYEN bir operasyonel metin olmalıdır — outbox
 * satırının `lastError` JSON kolonuna ve timeline'a yazılan tam olarak budur. Orijinal/ham hata
 * (potansiyel olarak daha ayrıntılı/hassas) yalnız `cause` alanında taşınır ve ASLA lastError/
 * timeline'a yazılmaz — yalnız iç loglama/hata ayıklama amaçlıdır.
 */
export class NonRetryableOutboxError extends Error {
  readonly reasonCode: string;
  readonly securityRelevant: boolean;
  readonly cause?: unknown;

  constructor(params: {
    reasonCode: string;
    message: string;
    securityRelevant?: boolean;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'NonRetryableOutboxError';
    this.reasonCode = params.reasonCode;
    this.securityRelevant = params.securityRelevant ?? false;
    this.cause = params.cause;
  }
}
