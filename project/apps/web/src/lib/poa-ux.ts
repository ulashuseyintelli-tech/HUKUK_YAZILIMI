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

/** Müvekkil (Client) gövdesine ait OLMAYAN vekaletname alanları. */
const POA_CLIENT_PAYLOAD_KEYS = ["poaNumber", "poaDate", "notaryName", "notaryCity"] as const;

/**
 * Müvekkil formundan/taramasından gelen ham veride kayda değer vekalet bilgisi var mı?
 * (Yevmiye No, Vekalet Tarihi veya Noter Adı dolu ise vekalet kaydı oluşturulmalı.)
 */
export function hasPoaInput(source: any): boolean {
  return !!(source?.poaNumber || source?.poaDate || source?.notaryName);
}

/**
 * Müvekkil (Client) gövdesinden vekaletname alanlarını ayıklar. Bu alanlar
 * `ClientPowerOfAttorney` modeline aittir; `ClientService` bunları okumaz ve lenient
 * ValidationPipe sessizce düşürür. `/clients` gövdesine GÖNDERİLMEMELERİ gerekir
 * (aksi hâlde "giriliyor ama düşüyor" hâli oluşur).
 */
export function stripPoaFields<T extends Record<string, any>>(payload: T): Record<string, any> {
  const rest: Record<string, any> = { ...payload };
  for (const key of POA_CLIENT_PAYLOAD_KEYS) delete rest[key];
  return rest;
}

/**
 * `POST /poa` için kanonik gövdeyi kurar. Vekaletname bilgisi tek otorite olan
 * `ClientPowerOfAttorney` modelinde tutulur; Client tablosuna yazılmaz. Müvekkil
 * formu/taraması alanlarını PoaService.create DTO şekline çevirir. `lawyerIds`
 * (tarama akışında avukat eşleştirme) çağıran tarafından ayrıca eklenir.
 */
export function buildPoaCreatePayload(clientId: string, source: any): Record<string, any> {
  return {
    clientId,
    journalNo: source?.poaNumber,
    poaNumber: source?.poaNumber,
    dateIssued: source?.poaDate ? new Date(source.poaDate) : undefined,
    notaryName: source?.notaryName,
    notaryCity: source?.notaryCity,
    isLimited: source?.isLimited || false,
    validUntil: source?.validUntil ? new Date(source.validUntil) : undefined,
    scopeType: source?.scopeType || "GENEL",
    scopeDescription: source?.scopeDescription,
    canCollect: source?.canCollect ?? true,
    canWaive: source?.canWaive ?? false,
    canSettle: source?.canSettle ?? false,
    canRelease: source?.canRelease ?? false,
  };
}
