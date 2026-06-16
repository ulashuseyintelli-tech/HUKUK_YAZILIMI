/**
 * PR-2a-fix: POA mükerrer-bastırma UX sinyali — TEK KAYNAK + shape-agnostic.
 * Backend suppress yolunda dönen nesneye `_suppressedDuplicate:true` ekler. api.post `{data}`
 * sarar ama bazı çağrılar farklı nesleyebilir → tüm olası şekilleri kontrol et (tarama ve manuel
 * yolların AYNI davranması garanti edilir; ıraksama riski kalkar).
 */

export const POA_DUPLICATE_MESSAGE =
  "Bu vekalet zaten kayıtlı; yeni kayıt açılmadı, mevcut kayıt kullanıldı.";

/** Dönen POST /poa yanıtında mükerrer-bastırma bayrağı var mı (her nesleme şekli için). */
export function isPoaDuplicateSuppressed(res: any): boolean {
  return !!(
    res?._suppressedDuplicate ||
    res?.data?._suppressedDuplicate ||
    res?.data?.data?._suppressedDuplicate
  );
}
