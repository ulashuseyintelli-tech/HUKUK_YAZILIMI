import type {
  DocumentSourceType,
  InstrumentType,
  ProceedingType,
} from '@prisma/client';

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
  | 'OFFICIAL_TAKIP_MAPPING_AUTHORITY_REQUIRED'
  /**
   * UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-IMPLEMENTATION-I01: owner satırı APPROVE etti
   * (M-01, 9009) ancak owner'ın bağlayıcı koşulunu ("CaseSubCategory adı dışında nafaka
   * semantiğini doğrulayan canonical legal basis") karşılayan tekil, belirsizliksiz bir
   * domain discriminator repository'de bulunamadı. Tahmin/schema değişikliği YAPILMADI —
   * owner'ın kendi talimatı gereği (§ implementation sınırı) satır MODEL_RESIDUAL kaldı.
   */
  | 'OFFICIAL_MAHIYET_MODEL_RESIDUAL'
  /** `alacakKalemi` wrapper: hem enstrüman hem ilam sinyali aynı anda mevcut — çelişkili. */
  | 'OFFICIAL_WRAPPER_AMBIGUOUS'
  /** `alacakKalemi` wrapper: domain → wrapper eşlemesi owner tarafından tayin edilmemiştir. */
  | 'OFFICIAL_WRAPPER_AUTHORITY_REQUIRED';

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
  | { readonly kind: 'NOT_ASSERTED' }
  /**
   * Owner satırı APPROVE etti, ancak owner'ın bağlayıcı koşulunu karşılayan tekil ve
   * belirsizliksiz bir canonical domain discriminator repository'de YOK. Tahmin/schema
   * değişikliği YASAK; satır bu haliyle emit edilemez kalır
   * (`UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-IMPLEMENTATION-I01`).
   */
  | { readonly kind: 'MODEL_RESIDUAL'; readonly domainType: string; readonly reason: string };

// ============================================================================
// OWNER RATIFICATION — UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-OWNER-RATIFICATION-R01
// ============================================================================
//
// Owner disposition (2026-07-29): 11 aday satırdan T-01..T-04, W-01, W-03..W-05
// KOŞULSUZ APPROVE; W-02 ve M-01/M-02 APPROVE WITH EXACT SEMANTIC CONSTRAINT.
// Kısıtlar implementasyonun PARÇASIDIR — tavsiye değildir. Kısıtı karşılamayan
// veri `AUTHORITY_REQUIRED` / `MODEL_RESIDUAL` kalır; hiçbir varsayılan/tahmin
// uygulanmaz. `5045` bu ratifikasyona DAHİL DEĞİLDİR (EXTERNAL_TECHNICAL_AUTHORITY_REQUIRED).

/**
 * `takipTuru` anlam çözümü girdisi.
 *
 * `proceedingType` — `Case.proceedingType`, `ProceedingClassificationService`'in
 * ürettiği CANONICAL sınıflandırma alanıdır (owner Decision, MPB-028(a) PR-3C).
 * Bilinçli seçim: girdi `proceedingType`'dır, "bir mahkeme belgesi var mı" gibi bir
 * bayrak DEĞİLDİR — T-04'ün owner koşulu ("yalnız bir mahkeme belgesinin bulunması
 * yeterli değildir") tam olarak bunu yasaklar. `ProceedingClassificationService`
 * `CaseType`/`subCategory`/`executionPath`'ten GİZLİ FALLBACK KURMAZ (owner Decision);
 * bu yüzden `proceedingType` tek başına yeterli ve doğru girdidir.
 */
export interface TakipTuruResolutionInput {
  readonly proceedingType: ProceedingType | null;
}

/**
 * Domain'den resmî `takipTuru`'na **anlam** çözümü (T-01…T-11).
 *
 * Owner-approved (koşulsuz): `GENERAL_EXECUTION`/`CAMBIO`/`RENT` → `1` İlamsız,
 * `JUDGMENT_ENFORCEMENT` → `0` İlamlı.
 *
 * `RENT`/`JUDGMENT_ENFORCEMENT` T-03/T-04'ün "yalnız X anlamına geldiğinde" koşulu
 * **yapı gereği** sağlanır: `Case.proceedingType` TEKİL nullable alandır — bir Case
 * aynı anda hem `RENT` hem `JUDGMENT_ENFORCEMENT` olamaz (owner Decision ile
 * kurulmuş tek-değerli exhaustive sınıflandırma). Mahkeme ilamına dayanan
 * tahliye/kira zaten `JUDGMENT_ENFORCEMENT` olarak sınıflandırılır, `RENT` değil.
 *
 * `PLEDGE`/`MORTGAGE`/bağımsız `EVICTION`/`BANKRUPTCY`/`PUBLIC_RECEIVABLE` T-05…T-10:
 * owner onay tablosuna hiç girmedi — `AUTHORITY_REQUIRED` kalır.
 *
 * Exhaustive switch + assertUnreachable: `ProceedingType`'a yeni değer eklenip
 * ele alınmazsa DERLEME HATASI verir.
 */
export function resolveOfficialTakipTuru(
  input: TakipTuruResolutionInput,
): OfficialCodeResolution {
  const { proceedingType } = input;

  if (proceedingType === null) {
    // T-11: sınıflandırılmamış — ProceedingClassificationService tahmin ETMEZ.
    return {
      kind: 'AUTHORITY_REQUIRED',
      domainType: 'proceedingType:UNRESOLVED',
      reason:
        'Case henuz siniflandirilmamis (proceedingType null); ' +
        'ProceedingClassificationService tahmin etmez, sessiz varsayilan uygulanamaz.',
    };
  }

  switch (proceedingType) {
    // T-01, T-02, T-03 — owner APPROVE, koşulsuz.
    case 'GENERAL_EXECUTION':
    case 'CAMBIO':
    case 'RENT':
      return { kind: 'RESOLVED', code: '1' };

    // T-04 — owner APPROVE, koşulsuz (koşul proceedingType'ın kendisiyle sağlanır).
    case 'JUDGMENT_ENFORCEMENT':
      return { kind: 'RESOLVED', code: '0' };

    // T-05..T-10 — owner onay tablosuna hiç girmedi.
    case 'PLEDGE':
    case 'MORTGAGE':
    case 'EVICTION':
    case 'BANKRUPTCY':
    case 'PUBLIC_RECEIVABLE':
      return {
        kind: 'AUTHORITY_REQUIRED',
        domainType: `proceedingType:${proceedingType}`,
        reason:
          'Bu proceedingType degeri owner ratifikasyon paketine hic sunulmadi ' +
          '(UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-OWNER-RATIFICATION-R01).',
      };

    default:
      return assertUnreachableProceedingType(proceedingType);
  }
}

function assertUnreachableProceedingType(value: never): OfficialCodeResolution {
  return {
    kind: 'AUTHORITY_REQUIRED',
    domainType: `proceedingType:UNKNOWN(${String(value)})`,
    reason: 'Siniflandirilamayan/bilinmeyen ProceedingType degeri.',
  };
}

/**
 * `mahiyetKodu` anlam çözümü girdisi — yalnız `CaseSubCategory.NAFAKA` (M-01/M-02)
 * için tanımlıdır; başka bir `subCategory` bu fonksiyona verilirse `AUTHORITY_REQUIRED`
 * döner (owner onay tablosuna hiç girmedi).
 */
export interface MahiyetResolutionInput {
  readonly caseSubCategory: string;
  /** Case için önceden çözülmüş takipTuru anlamı (T-01…T-04'ten). */
  readonly takipTuru: TakipTuruResolutionInput;
  /**
   * `CaseJudgment.nafakaType` — case için EN AZ BİR `CaseJudgment` kaydı NAFAKA türünde
   * mi? M-02'nin owner koşulu 3/4: "geçerli ilam canonical modelde bulunmalı" ve
   * "nafaka alacağı bu ilamla açık biçimde ilişkilendirilmelidir". `CaseJudgment` bu
   * ilişkiyi `nafakaType` alanıyla taşır — genel bir "belge var" bayrağı DEĞİLDİR.
   */
  readonly caseJudgmentNafakaType: 'ISTIRAK' | 'YOKSULLUK' | 'TEDBIR' | 'YARDIM' | null;
}

/**
 * Domain'den resmî `mahiyetKodu`'na **anlam** çözümü (M-01…M-08).
 *
 * ## M-02 (1045, Nafaka — Örnek 4-5) — IMPLEMENTED
 *
 * Owner koşulları: (1) alacak gerçekten nafaka olmalı, (2) canonical procedure
 * ilamlı olmalı, (3) geçerli ilam canonical modelde bulunmalı, (4) nafaka bu ilamla
 * açıkça ilişkilendirilmeli, (5) legacy `FATURA=1045` authority DEĞİL.
 *
 * Koşul (1)+(3)+(4) TEK bir alanla birlikte sağlanır: `caseJudgmentNafakaType`
 * non-null — bu, `CaseJudgment.nafakaType` alanının (Case.subCategory'den TAMAMEN
 * BAĞIMSIZ, ayrı bir model, ayrı bir enum) doldurulmuş olduğu, yani canonical bir
 * ilam kaydının GERÇEKTEN nafaka hükmü taşıdığı anlamına gelir — "CaseSubCategory
 * adı dışında canonical legal basis" şartı budur. Koşul (2) `takipTuru` girdisinden
 * `RESOLVED('0')` şartıyla sağlanır. Koşul (5): legacy kod hiçbir dalda okunmaz.
 *
 * ## M-01 (9009, Nafaka — Örnek 7) — MODEL_RESIDUAL, IMPLEMENTE EDİLMEDİ
 *
 * Owner koşulu (3): "CaseSubCategory adı dışında nafaka semantiğini doğrulayan
 * canonical legal basis bulunmalıdır." İlamsız (takipTuru=1) kolda `CaseJudgment`
 * YOKTUR (ilam yok = ilamsız). Aday ikinci bir alan (`Due.type = NAFAKA`, ayrı bir
 * legacy paralel model) bulundu, ANCAK bu alanın `ClaimItem` karşısında canonical
 * authority statüsünü belirleyen bir governance kaydı YOK — iki model arasında
 * hangisinin "CaseSubCategory dışında" ek kanıt sayılacağı BELİRSİZ. Owner'ın kendi
 * talimatı gereği ("gerekli discriminator bulunamazsa tahmin/schema değişikliği
 * yapılmayacak; satır MODEL_RESIDUAL/NOT IMPLEMENTED döner") bu satır tahmin
 * EDİLMEDİ.
 *
 * ## M-03…M-08 ve diğer subCategory değerleri
 *
 * Owner onay tablosuna hiç girmedi → `AUTHORITY_REQUIRED`.
 */
export function resolveOfficialMahiyetKodu(
  input: MahiyetResolutionInput,
): OfficialCodeResolution {
  if (input.caseSubCategory !== 'NAFAKA') {
    return {
      kind: 'AUTHORITY_REQUIRED',
      domainType: `caseSubCategory:${input.caseSubCategory}`,
      reason:
        'Bu CaseSubCategory degeri owner ratifikasyon paketine hic sunulmadi ' +
        '(UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-OWNER-RATIFICATION-R01).',
    };
  }

  const takip = resolveOfficialTakipTuru(input.takipTuru);

  if (takip.kind === 'RESOLVED' && takip.code === '0') {
    // İlamlı kol — M-02 adayı.
    if (input.caseJudgmentNafakaType !== null) {
      return { kind: 'RESOLVED', code: '1045' };
    }
    return {
      kind: 'AUTHORITY_REQUIRED',
      domainType: 'caseSubCategory:NAFAKA+ilamli',
      reason:
        'M-02 owner kosulu 3/4 karsilanmadi: CaseJudgment.nafakaType dolu degil ' +
        '(gecerli ilam canonical modelde yok veya nafaka bu ilamla iliskilendirilmemis).',
    };
  }

  if (takip.kind === 'RESOLVED' && takip.code === '1') {
    // İlamsız kol — M-01 adayı: owner APPROVE etti ama discriminator YOK.
    return {
      kind: 'MODEL_RESIDUAL',
      domainType: 'caseSubCategory:NAFAKA+ilamsiz',
      reason:
        'M-01 owner APPROVE etti (9009) ancak owner kosulu 3 ("CaseSubCategory ' +
        'adi disinda canonical legal basis") karsilanamadi: ilamsiz kolda CaseJudgment ' +
        'yok; Due.type=NAFAKA adayi bulundu ama ClaimItem karsisinda canonical ' +
        'authority statusu governance kaydiyla belirlenmemis. Tahmin YAPILMADI.',
    };
  }

  // takipTuru henüz çözülmemiş/owner-onaysız — mahiyet de çözülemez.
  return {
    kind: 'AUTHORITY_REQUIRED',
    domainType: 'caseSubCategory:NAFAKA+takipTuruUnresolved',
    reason: 'takipTuru once cozulmeli; mahiyet takipTuru kolundan bagimsiz degildir.',
  };
}

// ============================================================================
// alacakKalemi WRAPPER — DOMAIN → RESMÎ SARMALAYICI ANLAM ÇÖZÜMÜ
// ============================================================================

export type OfficialWrapperResolution =
  | { readonly kind: 'RESOLVED'; readonly wrapper: string }
  | { readonly kind: 'AUTHORITY_REQUIRED'; readonly reason: string }
  /** Hem enstrüman hem ilam sinyali aynı anda mevcut — çelişkili, sarmalayıcı SEÇİLMEZ. */
  | { readonly kind: 'AMBIGUOUS'; readonly reason: string };

/**
 * Bir `ClaimItem` seviyesinde wrapper çözümü girdisi. `alacakKalemi` DTD'de her
 * kalem kendi sarmalayıcısını taşır (dosya seviyesi değil) — bu yüzden girdi
 * Case değil ClaimItem seviyesindedir.
 */
export interface AlacakKalemiWrapperResolutionInput {
  /** `ClaimItem.instrument?.instrumentType` — kambiyo evrakı varsa. */
  readonly instrumentType: InstrumentType | null;
  /** `Case.proceedingType`. */
  readonly proceedingType: ProceedingType | null;
  /** `ClaimItem.sourceDocumentType`. */
  readonly sourceDocumentType: DocumentSourceType | null;
  /** Case için en az bir `CaseJudgment` kaydı var mı (genel varlık, nafaka'ya özgü değil). */
  readonly caseHasJudgmentRecord: boolean;
}

/**
 * Domain'den resmî `alacakKalemi` wrapper adına **anlam** çözümü (W-01…W-07).
 *
 * ⚠ **Kapsam sınırı:** bu fonksiyon yalnız wrapper ADINI çözer. `alacakKalemi`
 * ELEMENT EMİSYONU bu görevin kapsamı DIŞINDADIR — `official-exchange-builder.ts`
 * P02B-R2'deki fail-closed reddini (`UNAUTHORIZED_ALACAK_KALEMI_PARENT`) AYNEN korur.
 * Bu, yeni bir serializer/XML yapısı İCAT ETMEMEK için bilinçli bir sınırdır.
 *
 * W-01 (`cek`), W-03 (`senet`←BONO), W-04 (`police`) koşulsuz APPROVE — enstrüman
 * türünden doğrudan ve tekil türetilir.
 *
 * W-02 (`senet`←SENET) owner koşulu: "yalnız bono/emre muharrer senet anlamında
 * kullanılıyorsa". `InstrumentType.SENET` şeması **zaten** yalnız bu anlamı taşır
 * (bkz. schema.prisma yorum "Senet/Bono"; enum'da genel "yazılı borç ikrarı" değeri
 * YOK) — semantic invariant `CA — official-legal-semantic-mapping-implementation`
 * guard testinde şema yorumu üzerinden KİLİTLENİR.
 *
 * W-05 (`ilam`) owner koşulu: "ilam nesnesi canonical modelde mevcut olmalı VE
 * ilgili alacak kalemleri bu ilamla açık biçimde ilişkilendirilmelidir. Yalnız
 * proceedingType'tan sentetik ilam üretilemez." Bu üç ayrı sinyal ile sağlanır:
 * `proceedingType=JUDGMENT_ENFORCEMENT` (yapısal), `caseHasJudgmentRecord=true`
 * (nesne canonical modelde var), `sourceDocumentType='ILAM'` (KALEM SEVİYESİNDE
 * açık ilişkilendirme — Case seviyesinde judgment olması TEK BAŞINA yetmez).
 *
 * Çelişki (§3.1): bir kalemde hem `instrumentType` hem `sourceDocumentType='ILAM'`
 * varsa → `AMBIGUOUS`, sarmalayıcı SEÇİLMEZ.
 *
 * W-06 (`kontrat`) ve W-07 (`digerAlacak`) owner onay tablosuna hiç girmedi.
 */
export function resolveOfficialAlacakKalemiWrapper(
  input: AlacakKalemiWrapperResolutionInput,
): OfficialWrapperResolution {
  const hasInstrumentSignal = input.instrumentType !== null;
  const hasIlamSignal = input.sourceDocumentType === 'ILAM';

  if (hasInstrumentSignal && hasIlamSignal) {
    return {
      kind: 'AMBIGUOUS',
      reason:
        'ClaimItem hem enstruman (instrumentType) hem ilam (sourceDocumentType=ILAM) ' +
        'sinyali tasiyor; hangi sarmalayicinin dogru oldugu hukuki siniflandirmadir, ' +
        'otomatik secilemez.',
    };
  }

  if (hasInstrumentSignal) {
    switch (input.instrumentType) {
      case 'CEK':
        return { kind: 'RESOLVED', wrapper: 'cek' };
      case 'SENET':
      case 'BONO':
        return { kind: 'RESOLVED', wrapper: 'senet' };
      case 'POLICE':
        return { kind: 'RESOLVED', wrapper: 'police' };
      default:
        return assertUnreachableInstrumentType(input.instrumentType);
    }
  }

  if (input.proceedingType === 'JUDGMENT_ENFORCEMENT') {
    if (hasIlamSignal && input.caseHasJudgmentRecord) {
      return { kind: 'RESOLVED', wrapper: 'ilam' };
    }
    return {
      kind: 'AUTHORITY_REQUIRED',
      reason:
        'proceedingType=JUDGMENT_ENFORCEMENT yapisal sinyali var ancak W-05 kosulu ' +
        'karsilanmadi: CaseJudgment kaydi yok VE/VEYA ClaimItem.sourceDocumentType ' +
        "ILAM degil (acik iliskilendirme yok); sentetik/bos ilam nesnesi uretilmez.",
    };
  }

  return {
    kind: 'AUTHORITY_REQUIRED',
    reason:
      'kontrat (W-06) ve digerAlacak (W-07) owner ratifikasyon paketine hic sunulmadi.',
  };
}

function assertUnreachableInstrumentType(value: never): OfficialWrapperResolution {
  return {
    kind: 'AUTHORITY_REQUIRED',
    reason: `Siniflandirilamayan/bilinmeyen InstrumentType degeri: ${String(value)}`,
  };
}
