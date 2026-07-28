/**
 * UYAP-OFFICIAL-CODELIST-EMISSION-I01B-1 — CANONICAL RESMÎ CODELIST REGISTRY.
 *
 * Resmî UYAP Contract A kodlu alanlarının **tek sahibi**. Serializer bu registry
 * dışında hiçbir kaynaktan kod veya etiket almaz.
 *
 * ## Kaynak ve provenance
 *
 * Değerler Model B canonical evidence bundle'ından çıkarılmıştır:
 *
 * ```text
 * KodluBilgilerData.xml   SHA-256 f95925714428b66eec9b0b29be761e4982fd0a207ae90bff34bbffeaf979ec7c
 *                         134717 B · MANIFEST ile birebir eşleşir (drift YOK)
 * ```
 *
 * Registry **runtime'da bu dosyayı OKUMAZ**: değerler derleme zamanı sabitleridir.
 * Operatör iş istasyonu yoluna bağımlılık, ağ çağrısı, mutable global state ve
 * locale/environment duyarlılığı **YOKTUR**.
 *
 * ## ⚠ Artefakt etiket kaybı (kaynakta, intake sonrası DEĞİL)
 *
 * `KodluBilgilerData.xml` deklarasyonunda `encoding="ISO-8859-9"` yazar; ancak
 * gerçek byte'ları **UTF-8 kodlanmış `U+FFFD` REPLACEMENT CHARACTER** içerir
 * (`ef bf bd`). Yani etiketlerdeki Türkçe harfler **yayımdan/çıkarımdan önce
 * kaybolmuştur** ve geri döndürülemez:
 *
 * ```text
 * dosyada : Rol="BOR<U+FFFD>LU/M<U+FFFD>FL<U+FFFD>S"
 * olması gereken : "BORÇLU/MÜFLİS"
 * ```
 *
 * Dosya hash'i MANIFEST ile **eşleştiği** için bu bir *canonical evidence drift*
 * DEĞİLDİR — bundle bozulmamıştır; kayıp **kaynaktadır**.
 *
 * **Sonuç:** `rolID` / `kod` değerleri (saf ASCII) **güvenilirdir ve kullanılır**;
 * **etiketler artefakttan türetilemez**. Bu yüzden her etiket bir `labelProvenance`
 * taşır ve **yalnız `OWNER_RATIFIED` etiket emit edilebilir** (bkz. `emittableLabel`).
 * Etiket tahmin edilmez, yeniden yazılmaz, "düzeltilmez".
 */

/** Registry sözleşmesinin sürümü (evidence kayıtlarında taşınır). */
export const UYAP_OFFICIAL_CODELIST_VERSION = 'UYAP-OFFICIAL-CODELIST/v1' as const;

/** Kaynak artefaktın kimliği — governance kaydıyla çapraz doğrulanabilir. */
export const OFFICIAL_CODELIST_PROVENANCE = Object.freeze({
  artefact: 'KodluBilgilerData.xml',
  sha256: 'f95925714428b66eec9b0b29be761e4982fd0a207ae90bff34bbffeaf979ec7c',
  byteLength: 134717,
  packageDate: '2024-03-20',
  /** Etiketler kaynakta U+FFFD ile bozulmuştur; kodlar sağlamdır. */
  labelsLossyAtSource: true,
  /** Bundle intake sonrası DEĞİŞMEMİŞTİR (MANIFEST hash eşleşmesi). */
  bundleDriftDetected: false,
});

/**
 * Etiketin nereden geldiği. Emisyon **yalnız** `OWNER_RATIFIED` ile mümkündür.
 *
 * - `OWNER_RATIFIED`: owner kararıyla sabitlenmiş etiket (P03A `OWNER_SAFE_ROLE_TARGETS`
 *   + MANIFEST rol sözlüğü; ikisi de owner-ACCEPTED).
 * - `MANIFEST_TRANSCRIBED`: yalnız MANIFEST'te insan-transkripsiyonu olarak var;
 *   artefakt byte'ıyla doğrulanamaz → **emit EDİLMEZ**, yalnız ID doğrulaması için bilinir.
 * - `ARTEFACT_LOSSY`: artefaktta U+FFFD içerir → **emit EDİLMEZ**.
 */
export type OfficialLabelProvenance =
  | 'OWNER_RATIFIED'
  | 'MANIFEST_TRANSCRIBED'
  | 'ARTEFACT_LOSSY';

export interface OfficialRoleEntry {
  readonly rolID: string;
  readonly label: string;
  readonly labelProvenance: OfficialLabelProvenance;
}

/**
 * Resmî `rolTur` sözlüğü — **17 rol / rolID 21-71**.
 *
 * `rolID` değerleri artefaktın ASCII iskeletinden birebir alınmıştır ve MANIFEST'in
 * bağımsız enümerasyonuyla **tam olarak** eşleşir (17/17).
 *
 * Etiketler MANIFEST rol sözlüğünden (owner-ACCEPTED `DBP-P2-UYAP-PUBLIC-SOURCES-01-GOV`)
 * alınmıştır. `22` ve `33` ayrıca P03A owner-ratified tablosunda birebir aynı biçimde
 * geçer → `OWNER_RATIFIED`. Diğer 15 rol yalnız MANIFEST transkripsiyonuyla bilinir;
 * artefakt byte'ı bozuk olduğu için doğrulanamaz → `MANIFEST_TRANSCRIBED` (emit edilmez).
 *
 * NOT (açık gözlem, bu görevde ÇÖZÜLMEDİ): artefaktın ASCII iskeleti `46` için
 * `H?SSADAR`, MANIFEST ise `HİSSEDAR` diyor — fark yalnız Türkçe harf değil, `A`/`E`
 * ayrımıdır. `46` zaten emit edilmediği için karar gerekmez; kayıt governance'a geçer.
 */
export const OFFICIAL_ROLE_REGISTRY: readonly OfficialRoleEntry[] = Object.freeze([
  { rolID: '21', label: 'ALACAKLI', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '22', label: 'BORÇLU/MÜFLİS', labelProvenance: 'OWNER_RATIFIED' },
  { rolID: '23', label: 'İFLAS İDARE MEMURU', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '24', label: 'İFLAS İDARE MEMURU ADAYI', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '25', label: 'İSTİHKAK İDDİASI SAHİBİ', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '26', label: 'ÜÇÜNCÜ ŞAHIS', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '33', label: 'KEFİL', labelProvenance: 'OWNER_RATIFIED' },
  { rolID: '34', label: 'TEREKE SORUMLUSU', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '41', label: 'MÜFLİS', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '43', label: 'YED-İ EMİN KİŞİ', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '44', label: 'REHİN SAHİBİ', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '45', label: 'İHALE KATILIMCISI', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '46', label: 'HİSSEDAR', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '47', label: 'İPOTEK SAHİBİ', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '53', label: 'KİRACI', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '54', label: 'İŞGALCİ', labelProvenance: 'MANIFEST_TRANSCRIBED' },
  { rolID: '71', label: 'ARACI KİŞİ/KURUM', labelProvenance: 'MANIFEST_TRANSCRIBED' },
]);

/** Resmî `mahiyetKodu` sözlüğü — **18 kod** (artefakt ASCII iskeleti; etiketler lossy). */
export const OFFICIAL_MAHIYET_KODU_SET: ReadonlySet<string> = new Set([
  '1007', '1107', '1207', '1307', '1407',
  '2007', '3007', '4007', '5007', '6007', '7007',
  '8008', '9009',
  '1045', '2045', '3045', '4045', '5045',
]);

/**
 * Resmî `takipTuru` sözlüğü — **2 kod**: `0` = İlamlı, `1` = İlamsız.
 *
 * ⚠ Legacy `UyapExchangeData.takipTuru` tipi `'1'..'6'` idi ve `1=İlamsız, 2=İlamlı`
 * diyordu. Resmî sözlükte `2` **YOKTUR** ve `0` İlamlı'dır. Legacy yol bu görevde
 * DEĞİŞTİRİLMEZ (canlı legacy cutover yasak); resmî hat yalnız bu iki kodu kabul eder.
 */
export const OFFICIAL_TAKIP_TURU_SET: ReadonlySet<string> = new Set(['0', '1']);

// ============================================================================
// Fail-closed reason kodları
// ============================================================================

export type OfficialCodelistFailureCode =
  | 'OFFICIAL_ROLE_AUTHORITY_REQUIRED'
  | 'OFFICIAL_ROLE_UNSUPPORTED'
  | 'OFFICIAL_ROLE_UNRESOLVED'
  | 'INVALID_OFFICIAL_MAHIYET_KODU'
  | 'INVALID_OFFICIAL_TAKIP_TURU'
  | 'OFFICIAL_CODELIST_LABEL_MISMATCH';

export type OfficialCodelistCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly failureCode: OfficialCodelistFailureCode; readonly detail: string };

const roleById = new Map(OFFICIAL_ROLE_REGISTRY.map((e) => [e.rolID, e]));

/** Verilen `rolID` resmî sözlükte var mı? */
export function isOfficialRoleId(rolID: string): boolean {
  return roleById.has(rolID);
}

/**
 * Emisyon için kullanılacak **canonical etiket**. Etiket ÇAĞIRANDAN alınmaz —
 * daima registry'den türetilir (owner §9).
 *
 * `undefined` dönerse o rol emit EDİLEMEZ (etiketi owner-ratified değildir).
 */
export function emittableLabel(rolID: string): string | undefined {
  const entry = roleById.get(rolID);
  if (!entry) return undefined;
  return entry.labelProvenance === 'OWNER_RATIFIED' ? entry.label : undefined;
}

/**
 * Çağıranın verdiği `{rolID, rol}` çiftini registry'ye karşı doğrular.
 *
 * - `rolID` resmî sözlükte değilse → `OFFICIAL_ROLE_UNRESOLVED`
 * - etiket owner-ratified değilse → `OFFICIAL_ROLE_AUTHORITY_REQUIRED` (emit edilemez)
 * - çağıranın etiketi canonical etiketle çelişiyorsa → `OFFICIAL_CODELIST_LABEL_MISMATCH`
 */
export function checkOfficialRolePair(rolID: string, callerLabel: string): OfficialCodelistCheck {
  if (!isOfficialRoleId(rolID)) {
    return {
      ok: false,
      failureCode: 'OFFICIAL_ROLE_UNRESOLVED',
      detail: `rolID resmi sozlukte yok: ${rolID}`,
    };
  }
  const canonical = emittableLabel(rolID);
  if (canonical === undefined) {
    return {
      ok: false,
      failureCode: 'OFFICIAL_ROLE_AUTHORITY_REQUIRED',
      detail: `rolID ${rolID} icin owner-ratified etiket YOK (artefakt etiketi lossy)`,
    };
  }
  if (callerLabel !== canonical) {
    return {
      ok: false,
      failureCode: 'OFFICIAL_CODELIST_LABEL_MISMATCH',
      detail: `rolID ${rolID}: caller etiketi canonical etiketle celisiyor`,
    };
  }
  return { ok: true };
}

/** `mahiyetKodu` doğrulaması. Sessiz varsayılan/fallback YOKTUR. */
export function validateOfficialMahiyetKodu(value: string | undefined): OfficialCodelistCheck {
  if (value === undefined) return { ok: true }; // opsiyonel alan — ATANMAZ, uydurulmaz
  if (!OFFICIAL_MAHIYET_KODU_SET.has(value)) {
    return {
      ok: false,
      failureCode: 'INVALID_OFFICIAL_MAHIYET_KODU',
      detail: `mahiyetKodu resmi sozlukte yok: ${JSON.stringify(value)}`,
    };
  }
  return { ok: true };
}

/** `takipTuru` doğrulaması. Sessiz varsayılan/fallback YOKTUR. */
export function validateOfficialTakipTuru(value: string | undefined): OfficialCodelistCheck {
  if (value === undefined) return { ok: true }; // opsiyonel alan
  if (!OFFICIAL_TAKIP_TURU_SET.has(value)) {
    return {
      ok: false,
      failureCode: 'INVALID_OFFICIAL_TAKIP_TURU',
      detail: `takipTuru resmi sozlukte yok: ${JSON.stringify(value)}`,
    };
  }
  return { ok: true };
}
