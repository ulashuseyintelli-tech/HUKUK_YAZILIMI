// CLIENT-P2-U01: portal şifre sıfırlama token yardımcıları (SAF, IO yok).
// Ham token YALNIZ bir kez (e-posta linkinde) görünür; DB'de yalnız SHA-256 hash saklanır.
// user-invite-token.util.ts ile AYNI hash deseni; ham token formatı owner kararıyla hex (32 byte).
import * as crypto from "crypto";

/** Tek-kullanımlık ham reset token'ı (yalnız e-postaya konur, DB'ye YAZILMAZ). */
export function generateRawResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** DB'de saklanan/karşılaştırılan değer. Ham token asla saklanmaz. */
export function hashResetToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}
