// PR-2a: Aynı hatayı gruplamak için deterministik parmak izi (SAF). DB'ye yalnız metadata.fingerprint
// olarak (mevcut Json kolon) yazılır — occurrenceCount/firstSeenAt KOLONLARI PR-2b (migration).
import { createHash } from "crypto";

export interface FingerprintInput {
  tenantId?: string;
  source: string;
  statusCode: number;
  name?: string;
  stack?: string;
}

/**
 * Stack'ten ilk anlamlı frame'i alıp satır/kolon, mutlak yol ve sayısal id'leri normalize eder.
 * Böylece yalnız satır numarası/yol/id farkı olan aynı hata, AYNI imzaya düşer.
 */
export function normalizeStackSignature(stack: string | undefined | null): string {
  if (!stack) return "";
  const lines = stack.split("\n").map((l) => l.trim());
  const frame = lines.find((l) => l.startsWith("at ")) || lines[0] || "";
  return frame
    .replace(/[A-Za-z]:\\/g, "/") // windows drive harfi
    .replace(/\\/g, "/") // ters bölü → düz
    .replace(/\(.*\//g, "(") // dosya adından önceki yol
    .replace(/:\d+:\d+/g, "") // :satır:kolon
    .replace(/\d+/g, "#"); // kalan rakamlar (id'ler)
}

export function computeFingerprint(input: FingerprintInput): string {
  const sig = [
    input.tenantId ?? "",
    input.source,
    String(input.statusCode),
    input.name ?? "",
    normalizeStackSignature(input.stack),
  ].join("|");
  return createHash("sha1").update(sig).digest("hex").slice(0, 16);
}
