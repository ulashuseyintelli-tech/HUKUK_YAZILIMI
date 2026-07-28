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

/**
 * Resmî `mahiyetKodu` codelist sözlüğü — **18 kod** (`KodluBilgilerData.xml` ASCII
 * iskeleti; etiketler lossy).
 */
export const OFFICIAL_CODELIST_MAHIYET_KODU_SET: ReadonlySet<string> = new Set([
  '1007', '1107', '1207', '1307', '1407',
  '2007', '3007', '4007', '5007', '6007', '7007',
  '8008', '9009',
  '1045', '2045', '3045', '4045', '5045',
]);

/**
 * Resmî `exchange.dtd` (`124a9a96…`, 9273 B) `ATTLIST dosya` içindeki `mahiyetKodu`
 * enumerasyonu — **17 kod**.
 *
 * ⚠ Ölçüm: iki resmî artefakt AYNI FİKİRDE DEĞİL. Codelist `5045`
 * (`Arabulucuk - Örnek 4-5`) taşır; DTD enumerasyonu **taşımaz**. `5045` emit edilirse
 * strict DTD doğrulamasında attribute-değer ihlali olur.
 *
 * **`5045` DİSPOZİSYONU: EXTERNAL TECHNICAL AUTHORITY REQUIRED.** Hangi artefaktın bu
 * alan için authority olduğu bir **owner hukuki kararı değildir** — UYAP/BİGM veya
 * yetkili entegratöre sorulacak teknik sorudur (`P04B-EXT-01` sınıfı). Cevap gelene
 * kadar kesişim uygulanır ve `5045` fail-closed kalır.
 * (`UYAP-P02B-R2-FOLLOWUP-CANONICALIZATION-R01`)
 */
export const OFFICIAL_DTD_MAHIYET_KODU_SET: ReadonlySet<string> = new Set([
  '1007', '1107', '1207', '1307', '1407',
  '2007', '3007', '4007', '5007', '6007', '7007',
  '8008', '9009',
  '1045', '2045', '3045', '4045',
]);

/**
 * Emit edilebilir `mahiyetKodu` kümesi = **iki resmî artefaktın KESİŞİMİ** (17 kod).
 *
 * Fail-closed ilkesi: bir kod ancak HER İKİ resmî artefakt da onu tanıyorsa emit
 * edilebilir. Tek artefaktta bulunan kod (`5045`) reddedilir —
 * `OFFICIAL_MAHIYET_DTD_UNREPRESENTABLE`.
 */
export const OFFICIAL_MAHIYET_KODU_SET: ReadonlySet<string> = new Set(
  [...OFFICIAL_CODELIST_MAHIYET_KODU_SET].filter((k) => OFFICIAL_DTD_MAHIYET_KODU_SET.has(k)),
);

/**
 * Resmî `takipTuru` sözlüğü — **2 kod**: `0` = İlamlı, `1` = İlamsız.
 *
 * ⚠ Legacy `UyapExchangeData.takipTuru` tipi `'1'..'6'` idi ve `1=İlamsız, 2=İlamlı`
 * diyordu. Resmî sözlükte `2` **YOKTUR** ve `0` İlamlı'dır. Legacy yol bu görevde
 * DEĞİŞTİRİLMEZ (canlı legacy cutover yasak); resmî hat yalnız bu iki kodu kabul eder.
 */
export const OFFICIAL_TAKIP_TURU_SET: ReadonlySet<string> = new Set(['0', '1']);

/**
 * Resmî `exchange.dtd`'de `alacakKalemi`'yi içerik modelinde listeleyen **yetkili
 * ebeveynler** (ölçüm, tahmin değil):
 *
 * ```text
 * <!ELEMENT cek          (alacakKalemi | taraf | ref)*>
 * <!ELEMENT senet        (alacakKalemi | taraf | ref)*>
 * <!ELEMENT police       (alacakKalemi | taraf | ref)*>
 * <!ELEMENT kontrat      (alacakKalemi | taraf | ref)*>
 * <!ELEMENT digerAlacak  (alacakKalemi | taraf | ref)*>
 * <!ELEMENT ilam         ((paraylaOlculemeyenAlacak | alacakKalemi)*, teminat?, ...)>
 * ```
 *
 * `dosya` içerik modeli `alacakKalemi` **içermez**:
 * `(cek | senet | taraf | VekilKisi | police | kontratKefil | digerAlacak | evrak | ref | ilam)*`
 *
 * ⚠ **REPOSITORY LOCAL DTD DERIVATIVE bunun TERSİNİ söyler** — orada `dosya` içerik
 * modeli `… , alacakKalemi+` ile biter, yani `alacakKalemi` doğrudan çocuk VE zorunludur.
 * Legacy `uyap-xml.service.ts` bu yerel türeve göre yazılmıştır. Resmî artefakt
 * (`124a9a96…`) authority'dir; yerel türev değildir.
 *
 * ⚠ `ilam` içerik modeli aynı zamanda D1 nondeterministic-content-model örneklerinden
 * biridir; bu liste strict DTD doğrulamasını mümkün KILMAZ.
 */
export const OFFICIAL_ALACAK_KALEMI_PARENTS: readonly string[] = Object.freeze([
  'cek',
  'digerAlacak',
  'ilam',
  'kontrat',
  'police',
  'senet',
]);

// ============================================================================
// Fail-closed reason kodları
// ============================================================================

export type OfficialCodelistFailureCode =
  | 'OFFICIAL_ROLE_AUTHORITY_REQUIRED'
  | 'OFFICIAL_ROLE_UNSUPPORTED'
  | 'OFFICIAL_ROLE_UNRESOLVED'
  | 'INVALID_OFFICIAL_MAHIYET_KODU'
  | 'INVALID_OFFICIAL_TAKIP_TURU'
  | 'OFFICIAL_CODELIST_LABEL_MISMATCH'
  /** Kod codelist'te var ama resmî DTD `ATTLIST dosya` enumerasyonunda YOK (ör. `5045`). */
  | 'OFFICIAL_MAHIYET_DTD_UNREPRESENTABLE'
  /**
   * Kod resmî sözlükte geçerli, ancak **hangi iç domain türünün bu koda karşılık
   * geldiği** owner tarafından tayin edilmemiştir. Ham kodun çağırandan kabulü
   * yasaktır (P02B-R2 §4): legacy sözlük aynı kodları FARKLI hukuki anlamlarla
   * kullanır, bu yüzden "geçerli kod" tek başına doğru anlam kanıtı değildir.
   */
  | 'OFFICIAL_MAHIYET_MAPPING_AUTHORITY_REQUIRED'
  /** `takipTuru` için domain → resmî kod eşlemesi owner tarafından tayin edilmemiştir. */
  | 'OFFICIAL_TAKIP_MAPPING_AUTHORITY_REQUIRED';

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

/**
 * `mahiyetKodu` **sözdizimsel** doğrulaması: değer her iki resmî artefaktta da var mı?
 *
 * ⚠ Bu fonksiyon **anlam** doğrulaması YAPMAZ. Ham kodun doğru hukuki mahiyeti
 * gösterdiğini kanıtlamaz — bkz. `resolveOfficialMahiyetKodu`. Sessiz varsayılan yoktur.
 */
export function validateOfficialMahiyetKodu(value: string | undefined): OfficialCodelistCheck {
  if (value === undefined) return { ok: true }; // opsiyonel alan — ATANMAZ, uydurulmaz
  if (OFFICIAL_MAHIYET_KODU_SET.has(value)) return { ok: true };

  // Codelist tanıyor ama DTD enumerasyonu tanımıyor → ayrı, daha kesin reason.
  if (OFFICIAL_CODELIST_MAHIYET_KODU_SET.has(value)) {
    return {
      ok: false,
      failureCode: 'OFFICIAL_MAHIYET_DTD_UNREPRESENTABLE',
      detail:
        `mahiyetKodu ${value} codelist'te var ancak resmi DTD ATTLIST dosya ` +
        `enumerasyonunda YOK; emit edilirse attribute-deger ihlali olur`,
    };
  }
  return {
    ok: false,
    failureCode: 'INVALID_OFFICIAL_MAHIYET_KODU',
    detail: `mahiyetKodu resmi sozlukte yok: ${JSON.stringify(value)}`,
  };
}

/**
 * `takipTuru` **sözdizimsel** doğrulaması.
 *
 * ⚠ Anlam doğrulaması DEĞİLDİR — bkz. `resolveOfficialTakipTuru`. Sessiz varsayılan yoktur.
 */
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

// ============================================================================
// DOMAIN → RESMÎ KOD ANLAM ESLEMESI (P02B-R2)
// ============================================================================

/**
 * Bir kodlu alanın **anlam** çözümü. Rol modelindeki `OfficialRoleResolution` ile aynı
 * fail-closed deseni izler: emisyon için `RESOLVED` şarttır.
 */
export type OfficialCodeResolution =
  | { readonly kind: 'RESOLVED'; readonly code: string }
  | {
      readonly kind: 'AUTHORITY_REQUIRED';
      readonly domainType: string;
      readonly reason: string;
    }
  /**
   * Çağıran bu alan için **hiçbir hukuki iddiada bulunmuyor**. Attribute emit edilmez.
   *
   * Bu, "değer yok" ile aynı şey DEĞİLDİR ve sessiz de değildir: resmî DTD
   * `takipTuru`'nu `(0 | 1) "1"` ile **varsayılanlı** bildirir; attribute yoksa
   * ayrıştırıcı `1` (İlamsız) uygular. Bu yüzden ihmal, örtük bir hukuki iddiadır ve
   * AÇIKÇA beyan edilmek zorundadır — evidence'ta `dtdDefaultApplies` ile taşınır.
   */
  | { readonly kind: 'NOT_ASSERTED' };

/**
 * Owner tarafından ratifiye edilmiş **domain türü → resmî `mahiyetKodu`** eşlemeleri.
 *
 * **ŞU AN BOŞ.** Bu bir eksiklik değil, ölçülmüş bir gerçektir:
 *
 * ```text
 * resmi 1007 = Telefon (Sabit) - Ornek 7      legacy 1007 = Genel Haciz Yoluyla Takip
 * resmi 3007 = Internet/Tv - Ornek 7          legacy 3007 = Nafaka Alacagi Takibi
 * resmi 1045 = Nafaka - Ornek 4-5             legacy 1045 = Fatura Alacagi
 * ```
 *
 * Paylaşılan **17 kodun 17'si de** legacy sözlükte FARKLI hukuki anlam taşıyor. Yani
 * mevcut hiçbir iç domain türünün resmî karşılığı repository kanıtıyla türetilemez;
 * türetmeye çalışmak hukuki anlam İCADI olur (ör. fatura alacağını nafaka olarak emit
 * etmek). Eşleme owner/LDO kararı bekler.
 */
const RATIFIED_MAHIYET_BY_DOMAIN: Readonly<Record<string, string>> = Object.freeze({});

/** Owner tarafından ratifiye edilmiş **domain türü → resmî `takipTuru`** eşlemeleri. **ŞU AN BOŞ.** */
const RATIFIED_TAKIP_TURU_BY_DOMAIN: Readonly<Record<string, string>> = Object.freeze({});

/**
 * Domain türünden resmî `mahiyetKodu`'na **anlam** çözümü.
 *
 * Ham kod kabul EDİLMEZ; yalnız ratifiye edilmiş domain eşlemesi `RESOLVED` üretir.
 * Ratifiye eşleme yoksa fail-closed `AUTHORITY_REQUIRED` döner — varsayılan kod,
 * "en yakın" kod veya legacy kodun geçirilmesi YOKTUR.
 */
export function resolveOfficialMahiyetKodu(domainType: string): OfficialCodeResolution {
  const code = RATIFIED_MAHIYET_BY_DOMAIN[domainType];
  if (code !== undefined) return { kind: 'RESOLVED', code };
  return {
    kind: 'AUTHORITY_REQUIRED',
    domainType,
    reason:
      'Domain -> resmi mahiyetKodu eslemesi owner tarafindan tayin edilmemistir. ' +
      'Legacy sozluk ayni kodlari FARKLI hukuki anlamlarla kullanir; ham kod gecirmek ' +
      'hukuken yanlis ama teknik olarak gecerli XML uretir.',
  };
}

/**
 * Domain türünden resmî `takipTuru`'na **anlam** çözümü.
 *
 * Resmî kod uzayı (`0`=İlamlı, `1`=İlamsız) ile legacy kod uzayı (`'1'..'6'`,
 * `2`=İlamlı) AYRI SİSTEMLERDİR. Sayısal eşitlik anlam eşitliği DEĞİLDİR: legacy `1`
 * ile resmî `1` tesadüfen aynı anlama gelir, legacy `2` ile resmî `1` gelmez.
 */
export function resolveOfficialTakipTuru(domainType: string): OfficialCodeResolution {
  const code = RATIFIED_TAKIP_TURU_BY_DOMAIN[domainType];
  if (code !== undefined) return { kind: 'RESOLVED', code };
  return {
    kind: 'AUTHORITY_REQUIRED',
    domainType,
    reason:
      'Domain -> resmi takipTuru eslemesi owner tarafindan tayin edilmemistir. ' +
      'Resmi (0|1) ve legacy (1..6) AYRI kod sistemleridir; sayisal esitlik anlam ' +
      'esitligi degildir.',
  };
}
