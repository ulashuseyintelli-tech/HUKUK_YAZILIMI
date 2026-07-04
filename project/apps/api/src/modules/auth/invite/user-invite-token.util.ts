// K1-7: Güvenli login provisioning — invite token yardımcıları (SAF, IO yok).
// Ham token YALNIZ bir kez (e-posta linkinde) görünür; DB'de yalnız SHA256 hash saklanır.
import * as crypto from "crypto";

/** Tek-kullanımlık ham davet token'ı (yalnız e-postaya konur, DB'ye YAZILMAZ). */
export function generateRawInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Rest'te saklanan/karşılaştırılan değer. Ham token asla saklanmaz. */
export function hashInviteToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Audit/log için maskeli e-posta (tam e-posta audit'e yazılmaz). */
export function redactEmail(email: string | null | undefined): string {
  const s = String(email ?? "");
  const at = s.indexOf("@");
  if (at <= 0) return "***";
  const head = s.slice(0, Math.min(2, at));
  return `${head}***${s.slice(at)}`;
}
