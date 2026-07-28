/**
 * CLIENT-FINANCIAL-DISCLOSURE-PRODUCTION-ACTIVATION-R01 / I02 — DI token'ları.
 *
 * Domain servisleri (`...WriterService`, `...ApprovalService`, `...PublicationService`)
 * BİLEREK `@Injectable()` DEĞİLDİR ve Nest'e bağımlı DEĞİLDİR — charter §38.4/§42.2/§43.9'da
 * kayıtlı clean-architecture sınırı korunur. Bağlama, Nest tarafında **factory provider** ile
 * yapılır; sınıfların kendisi değiştirilmez.
 *
 * Bu dosya yalnız sabit taşır; IO ve Nest decorator'ı yoktur.
 */

/** `DisclosureNotificationDispatcher` portunun DI token'ı (interface runtime'da yoktur). */
export const DISCLOSURE_NOTIFICATION_DISPATCHER = Symbol.for(
  'DISCLOSURE_NOTIFICATION_DISPATCHER',
);

/**
 * §35.10 fail-closed varsayılanı. Gerçek provider adaptörü bağlanana kadar dispatcher bu
 * adı taşır; `assertProductionProvider()` onaylı provider allowlist'inde bulamayınca
 * `DISCLOSURE_PUBLICATION_PROVIDER_NOT_PRODUCTION` ile reddeder ve provider'a **tek byte**
 * gitmez. Yani "binding var ama adapter yok" durumu sessizce yayınlamaya dönüşemez.
 */
export const DISCLOSURE_DISPATCHER_UNCONFIGURED_PROVIDER = 'unconfigured';
