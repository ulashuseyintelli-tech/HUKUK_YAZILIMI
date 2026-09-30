import { createHash } from "crypto";

/**
 * B11 — anahtar sirasindan bagimsiz kanonik metin (depolamayi ETKILEMEZ). Nesne KURMAZ, yalniz metin birlestirir:
 * JSON.parse ile gelen kendi `__proto__`/`constructor` anahtarlari prototip zincirine dokunmadan okunur. SQL NULL ve
 * JSON null (her ikisi de JS `null`) esit sayilir.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - LawyerService.update() → `defaultPermissions` degisiklik tespiti
 * ///  - defaultPermissionsFingerprint()
 * /// </remarks>
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * K3-A kanit bagi (owner GO 2026-09-30) — `Lawyer.defaultPermissions` degerinin parmak izi. Yonetim guncellemesinin
 * `LAWYER_PRIVILEGE_CHANGED` kaydina yazilir; dosya acilisi yalniz o avukatin EN SON yonetim kaydindaki parmak izi
 * GUNCEL degerle eslesirse varsayilani uygular. Boylece eski bir yonetim islemi, sonradan baska yoldan yazilmis
 * degere yetki kazandirmaz. Deger audit'e KOPYALANMAZ (B11); parmak izi gizlilik onlemi degil, BAGLAMA aracidir.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - LawyerService.update() → LAWYER_PRIVILEGE_CHANGED metadata (defaultPermissions degistiyse)
 * ///  - decideCaseOpenDefaultPermissions() → POST /cases (guncel deger ↔ yonetim kaydi)
 * /// </remarks>
 */
export function defaultPermissionsFingerprint(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}
