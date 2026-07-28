/**
 * CLIENT-FINANCIAL-DISCLOSURE-PRODUCTION-ACTIVATION-R01 / I05 — CANONICAL ACTIVATION GATES
 *
 * SAF (IO-suz, Nest-siz). İki AYRI risk sınırı ayrı ayrı kontrol edilir:
 *
 * ```text
 * LEVEL 0  write OFF · publication OFF   -> yalniz portal okuma
 * LEVEL 1  write ON  · publication OFF   -> disclosure uretilir/onaylanir, DIS ETKI YOK
 * LEVEL 2  write ON  · publication ON    -> dis gonderim; onayli adapter ZORUNLU
 * ```
 *
 * Yazma açık / yayınlama kapalı bir kurulum GEÇERLİDİR ve kasıtlıdır: ofis akışı canlıya
 * alınırken müvekkile hiçbir e-posta gitmez.
 */

/**
 * §7.1 canonical boolean: YALNIZ birebir `'true'` açar.
 *
 * Fail-closed: `undefined` · `''` · `'1'` · `'yes'` · `'on'` · `'enabled'` · `'false'` ·
 * `'TRUE'` · `'True'` · `' true '` (whitespace'li her biçim) · başka her değer.
 *
 * KATI-LİTERAL tercih edildi çünkü bu bayraklar müvekkile giden gerçek e-postayı ve finansal
 * yazmayı açar: "yaklaşık doğru" bir değerin yanlışlıkla aktivasyona dönüşmesi kabul edilemez.
 * Repository'deki gevşek `?.toLowerCase() === 'true'` deseni BU İKİ BAYRAK İÇİN kullanılmaz.
 */
export function isCanonicalActivationTrue(value: string | undefined): boolean {
  return value === 'true';
}

export const CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG =
  'CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED';
export const CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG =
  'CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED';

/** Disclosure ÜRETİMİ ve ONAY akışı. Varsayılan KAPALI. */
export function isDisclosureWriteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCanonicalActivationTrue(env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG]);
}

/**
 * DIŞ GÖNDERİM (müvekkile e-posta). Varsayılan KAPALI ve yazma bayrağından BAĞIMSIZ okunur;
 * yayınlamanın yazmadan ayrı bir risk sınırı olması bilinçlidir.
 */
export function isDisclosurePublicationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCanonicalActivationTrue(env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG]);
}

export type DisclosureActivationLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2';

/** Teşhis/telemetri için tek satırlık seviye özeti — karar mercii bayrakların KENDİSİDİR. */
export function resolveDisclosureActivationLevel(
  env: NodeJS.ProcessEnv = process.env,
): DisclosureActivationLevel {
  if (!isDisclosureWriteEnabled(env)) return 'LEVEL_0';
  return isDisclosurePublicationEnabled(env) ? 'LEVEL_2' : 'LEVEL_1';
}

/**
 * §7.4 canonical event adları. Log satırları bu sabitlerden üretilir → isim sürüklenmesi
 * (drift) testle yakalanabilir.
 */
export const DISCLOSURE_TELEMETRY_EVENTS = {
  CREATE_REQUESTED: 'disclosure_create_requested',
  CREATED: 'disclosure_created',
  OFFICE_APPROVAL_REQUESTED: 'office_approval_requested',
  OFFICE_APPROVAL_COMPLETED: 'office_approval_completed',
  CONTENT_APPROVAL_REQUESTED: 'content_approval_requested',
  CONTENT_APPROVAL_COMPLETED: 'content_approval_completed',
  PUBLICATION_REQUESTED: 'publication_requested',
  PUBLICATION_DISPATCHED: 'publication_dispatched',
  PUBLICATION_FAILED: 'publication_failed',
  PUBLICATION_RETRIED: 'publication_retried',
  PUBLICATION_PUBLISHED: 'publication_published',
  PUBLICATION_REVERSED: 'publication_reversed',
} as const;

/**
 * §7.4 log'a ASLA girmeyecek alanlar. Telemetri yardımcısı bu anahtarları fail-closed atar;
 * çağıran yanlışlıkla eklese bile satıra yazılmaz.
 */
export const DISCLOSURE_TELEMETRY_FORBIDDEN_FIELDS = [
  'amount',
  'totalCollected',
  'clientNetAmount',
  'snapshot',
  'snapshotHash',
  'sourceFingerprint',
  'notificationContent',
  'notificationContentHash',
  'recipient',
  'recipientEmail',
  'approvedRecipientEmail',
  'email',
  'body',
  'secret',
  'token',
  'authorization',
  'password',
  'providerMessageId',
] as const;

const FORBIDDEN = new Set<string>(
  DISCLOSURE_TELEMETRY_FORBIDDEN_FIELDS.map((f) => f.toLowerCase()),
);

/**
 * Tek satırlık, düşük-kardinaliteli structured log gövdesi üretir. Yasak alanlar SESSİZCE
 * DÜŞÜRÜLMEZ — hiç yazılmaz; ayrıca `undefined` alanlar da elenir.
 */
export function buildDisclosureTelemetry(
  event: string,
  fields: Readonly<Record<string, string | number | boolean | null | undefined>>,
): string {
  const parts: string[] = [event];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (FORBIDDEN.has(key.toLowerCase())) continue;
    parts.push(`${key}=${String(value)}`);
  }
  return parts.join(' ');
}
