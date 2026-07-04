// ACT-02: Office SMTP/SMS secret'ları (smtpPass/smsApiKey/smsApiSecret) at-rest şifreleme (SAF, IO yok).
// Şema yorumu "(şifrelenmiş)" diyordu ama hiçbir kod yolu şifrelemiyordu — bu dosya gerçek karşılığı.
// AES-256-GCM (authenticated encryption); anahtar DB'de DEĞİL, env CREDENTIAL_ENCRYPTION_KEY'den türetilir.
import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM için önerilen nonce uzunluğu
const AUTH_TAG_LENGTH = 16;
const PREFIX = "enc:v1:"; // legacy düz-metin ile şifreli değeri ayırt eden format işareti

function deriveKey(): Buffer | null {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!secret) return null;
  // Herhangi-uzunlukta secret'ı sabit 32-byte anahtara indirger (hex/base64 formatı dayatmaz).
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

/** Anahtar yapılandırılmış mı (fail-closed karar noktaları için, secret'ı sızdırmaz). */
export function isCredentialEncryptionConfigured(): boolean {
  return deriveKey() !== null;
}

/** Değerin zaten bu formatla şifrelenmiş olup olmadığını belirtir (legacy düz-metin ayrımı). */
export function isEncryptedCredential(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * Düz-metin secret'ı şifreler. Anahtar yoksa THROW eder (sessiz düz-metin fallback YOK —
 * "şifreli" iddiası gerçek olmalı; yazma anında fail-closed).
 */
export function encryptCredential(plaintext: string): string {
  const key = deriveKey();
  if (!key) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY yapılandırılmamış — secret şifrelenemedi");
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Şifreli/legacy-düz-metin değeri okunabilir hale getirir.
 * - `enc:v1:` öneki YOKSA: legacy düz-metin → OLDUĞU GİBİ döner (geriye-uyumluluk; backfill YOK,
 *   bir sonraki kaydedişte otomatik şifrelenir).
 * - Önek VARSA ama anahtar yoksa: THROW (sessizce bozuk/okunamaz değer dönmez).
 */
export function decryptCredential(stored: string): string {
  if (!isEncryptedCredential(stored)) return stored;
  const key = deriveKey();
  if (!key) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY yapılandırılmamış — şifreli secret çözülemedi");
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
