// WSMR-A4c — FİNANSAL IDEMPOTENCY ANAHTARI: güvenli üretim veya HİÇ.
//
// BULGU: dört finansal yol (`Idempotency-Key` header · offset create/reverse ·
// payout create · tahsilat create) anahtarı `crypto.randomUUID()` ile üretiyor,
// bulunamazsa `Math.random()` fallback'ine düşüyordu. Bu anahtar UI'da kalmaz —
// BACKEND DEDUPE SÖZLEŞMESİNE gönderilir. `Math.random` kriptografik değildir;
// zayıf entropy iki ayrı finansal işlemin aynı anahtarı paylaşmasına ve
// sunucunun ikincisini "tekrar" sayıp SESSİZCE yutmasına yol açabilir.
//
// KURAL: anahtar ya kriptografik olarak güvenli üretilir ya da HİÇ üretilmez;
// güvenli entropy yoksa finansal mutation BAŞLATILMAZ ve hata GÖRÜNÜR olur.

/** Güvenli entropy bulunamadığında atılır. Çağıran mutation'ı BAŞLATMAZ. */
export class InsecureEntropyError extends Error {
  readonly code = 'INSECURE_ENTROPY';
  constructor() {
    super(
      'Güvenli anahtar üretilemedi. İşlem başlatılmadı; lütfen sayfayı yenileyip tekrar deneyin.',
    );
    this.name = 'InsecureEntropyError';
  }
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * Kriptografik olarak güvenli idempotency anahtarı üretir.
 *
 * Sıra: `crypto.randomUUID()` → `crypto.getRandomValues()` (RFC 4122 v4 biçimi).
 * İkisi de yoksa `InsecureEntropyError` ATILIR — `Math.random()` fallback'i YOK.
 *
 * @param prefix okunabilirlik için alan öneki (ör. `payout`). Anahtarın
 *   benzersizliği prefix'e DEĞİL, 128 bit entropiye dayanır.
 */
export function createIdempotencyKey(prefix?: string): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;

  let core: string | undefined;
  if (c && typeof c.randomUUID === 'function') {
    core = c.randomUUID();
  } else if (c && typeof c.getRandomValues === 'function') {
    // RFC 4122 v4: 16 bayt + sürüm/variant bitleri.
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = hex(b);
    core = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // Math.random'a DÜŞMEK YOK: zayıf anahtar, sessiz dedupe çakışması demektir.
  if (!core) throw new InsecureEntropyError();

  return prefix ? `${prefix}-${core}` : core;
}

/** Güvenli entropy mevcut mu — çağıran, butonu önceden kapatmak için kullanabilir. */
export function hasSecureEntropy(): boolean {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  return !!c && (typeof c.randomUUID === 'function' || typeof c.getRandomValues === 'function');
}
