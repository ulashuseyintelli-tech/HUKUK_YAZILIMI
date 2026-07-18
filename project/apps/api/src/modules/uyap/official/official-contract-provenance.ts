/**
 * DBP-P2-UYAP-CONTRACT-A-P02A — Official Contract A Provenance (köken/kimlik metadata)
 *
 * UYAP exchangeData Contract A resmî sözleşmesinin PROVENANCE bilgisidir. Bu modül tek authority
 * yüzeyidir: resmî DTD SHA-256 ve versiyon/tarih sabitleri YALNIZ burada bulunur; translator ve
 * (gelecekteki) serializer bu sabitleri kopyalamaz.
 *
 * SINIRLAR (bağlayıcı):
 * - Resmî exchange.dtd DOSYASI repository'ye EKLENMEZ (yalnız hash ile köken beyanı; dtdFilePresentInRepository=false).
 * - Bu metadata, tip modelinin resmî DTD ile DOĞRULANDIĞINI GÖSTERMEZ (typeModelOfficiallyDtdValidated=false).
 * - Runtime cutover authority YOKTUR (runtimeCutoverAuthority='NONE'); bu modül yalnız köken beyanıdır.
 *
 * Kaynak (authority DEĞİL, köken referansı): resmî e-Takip paketi tarihsel olarak
 * uyap.gov.tr / rayp.adalet.gov.tr üzerinde yayımlanmıştır (GO-VERIFY: DBP-P2-UYAP-PUBLIC-SOURCES-01).
 *
 * NOT: Bu dosya hiçbir domain rolünü resmî rolID (21-71) değerine EŞLEMEZ ve XML üretMEZ.
 */

/** Resmî sözleşme adı. */
export const OFFICIAL_CONTRACT_NAME = 'UYAP exchangeData Contract A' as const;

/** Resmî exchangeHeader versiyonu (exchange.dtd ATTLIST: versiyon "1.2"). */
export const OFFICIAL_CONTRACT_VERSION = '1.2' as const;

/** Resmî exchange.dtd dosya tarihi (paket içi). */
export const OFFICIAL_DTD_DATE = '2015-12-17' as const;

/** Köken alınan resmî e-Takip paketinin tarihi. */
export const OFFICIAL_PACKAGE_DATE = '2024-03-20' as const;

/**
 * Resmî exchange.dtd SHA-256'sı (versiyon 1.2). Bu, resmî sözleşme DOSYASININ köken parmak-izidir;
 * dosyanın kendisi repository'de bulunmaz. Tek authority sabiti — kopyalanmamalıdır.
 */
export const OFFICIAL_DTD_SHA256 =
  '124a9a96848299d8abf216111572d7c8286777819422a5e29089b956f56a8fe6' as const;

/** Resmî kaynağın yetkili alan adları (köken referansı). */
export const SOURCE_AUTHORITY = 'uyap.gov.tr / rayp.adalet.gov.tr' as const;

/**
 * P02A provenance sözleşmesi. Hiçbir alan runtime davranışı TETİKLEMEZ; yalnız kayıt/kanıt amaçlıdır.
 * Runtime-immutable (Object.freeze) — köken beyanı değiştirilemez olmalıdır.
 */
export const OFFICIAL_CONTRACT_PROVENANCE = Object.freeze({
  contractName: OFFICIAL_CONTRACT_NAME,
  contractVersion: OFFICIAL_CONTRACT_VERSION,
  dtdDate: OFFICIAL_DTD_DATE,
  packageDate: OFFICIAL_PACKAGE_DATE,
  dtdSha256: OFFICIAL_DTD_SHA256,
  sourceAuthority: SOURCE_AUTHORITY,

  // Açık sınırlamalar (P02A brief'i):
  /** Köken (hash + versiyon + kaynak) doğrulanmıştır. */
  provenanceVerified: true,
  /** Resmî DTD dosyası repository'de bulunmaz. */
  dtdFilePresentInRepository: false,
  /** Tip modeli resmî DTD ile doğrulanmamıştır (P04 kapsamı). */
  typeModelOfficiallyDtdValidated: false,
  /** Runtime cutover yetkisi yoktur. */
  runtimeCutoverAuthority: 'NONE',
} as const);

/** Provenance sözleşmesinin tipi. */
export type OfficialContractProvenance = typeof OFFICIAL_CONTRACT_PROVENANCE;
