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

/**
 * D-4 (owner GO 2026-09-06): `POST /poa` (ve diger POA yazimlari) artik ADMIN VEYA yetkilendirilmis
 * onaylayici ister. Yetki reddi (403 + stabil reasonCode) kullaniciya ACIKCA gosterilir; sessiz
 * basari YOK. Musteri kaydi (POST /clients) zaten kaydedildiyse yeniden denemede mukerrer musteri
 * uretilmez: musteri secili kalir, vekaleti yetkili kullanici sonradan ekler.
 */
export const POA_AUTHORIZATION_REASON_CODES: ReadonlySet<string> = new Set([
  "CLIENT_MUTATION_DENIED_WORKSPACE_COMMAND",
  "CLIENT_MUTATION_DENIED_VIEWER",
  "CLIENT_MUTATION_DENIED_UNKNOWN_ROLE",
  "CLIENT_MUTATION_DENIED_NO_ACTOR",
  "CLIENT_MUTATION_DENIED_TENANT_MISMATCH",
]);

/** Hata bir POA yetki reddi mi (HTTP 403 veya bilinen reasonCode)? */
export function isPoaAuthorizationDenied(err: any): boolean {
  const code = err?.body?.reasonCode ?? err?.response?.data?.reasonCode;
  return err?.status === 403 || (typeof code === "string" && POA_AUTHORIZATION_REASON_CODES.has(code));
}

export const POA_AUTHORIZATION_DENIED_MESSAGE =
  "Vekalet kaydı için yetkili onay gerekir (ADMIN veya yetkilendirilmiş onaylayıcı).";

/**
 * Vekalet kaydi BASARISIZ oldugunda gosterilecek metin. `clientLabel` verilirse musterinin
 * KAYDEDILDIGI, yalniz vekaletin kaydedilmedigi ve yeniden musteri olusturulmayacagi acikca yazilir.
 */
export function poaCreateFailureMessage(err: any, clientLabel?: string): string {
  const head = clientLabel
    ? `Müvekkil "${clientLabel}" kaydedildi, ancak vekalet KAYDEDİLMEDİ.`
    : "Vekalet KAYDEDİLMEDİ.";
  const reason = isPoaAuthorizationDenied(err)
    ? `${POA_AUTHORIZATION_DENIED_MESSAGE} Müvekkil yeniden oluşturulmaz; vekaleti yetkili bir kullanıcı sonradan ekleyebilir.`
    : (err?.message || "Bilinmeyen hata");
  return `${head}\n\n${reason}`;
}
