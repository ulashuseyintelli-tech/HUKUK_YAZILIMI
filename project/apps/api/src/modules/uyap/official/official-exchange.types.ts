import type { OfficialRoleResolution } from './official-role-translation.types';

/**
 * DBP-P2-UYAP-CONTRACT-A-P02B — Official Contract A XML shape (input model + serialization result)
 *
 * Resmî `exchange.dtd` v1.2'den TÜRETİLMİŞ (contract-derived) tip modelidir. P02B serializer'ı bu
 * modeli deterministik biçimde official-shaped XML metnine çevirir.
 *
 * Sınırlar:
 * - Girdi ÖNCEDEN-RESOLVED'dir: her `OfficialTaraf.roleResolution` `RESOLVED` değilse serialize
 *   edilmez (REJECTED). Domain `DebtorRole` → `rolID` eşlemesi burada YAPILMAZ (P03 authority);
 *   `rolID`/`Rol` yalnız girdideki `RESOLVED` resolution'dan alınır.
 * - Encoding yalnız XML DEKLARASYON ETİKETİ olarak taşınır (ISO-8859-9); gerçek byte dönüşümü ve
 *   Türkçe round-trip P04 kapsamındadır (`byteEncodingPerformed=false`).
 * - `faizTipKod` gibi değerler taşınabilir ama P02B hiçbir kanonik değer ATAMAZ (ADR-014/P03).
 */

/** Resmî `kisiTumBilgileri` (EMPTY element + attribute modeli). */
export interface OfficialKisi {
  adi: string;
  soyadi: string;
  tcKimlikNo?: string;
  babaAdi?: string;
  anaAdi?: string;
  /** YYYY-MM-DD */
  dogumTarihi?: string;
  dogumYeri?: string;
  vergiNo?: string;
}

/** Resmî `kurum` (EMPTY element + attribute modeli). */
export interface OfficialKurum {
  kurumAdi: string;
  vergiNo?: string;
  vergiDairesi?: string;
  ticaretSicilNo?: string;
  mersisNo?: string;
}

/** Resmî `adres` (EMPTY element + attribute modeli; `kisiKurumBilgileri` içinde). */
export interface OfficialAdres {
  adresTuru?: string;
  il?: string;
  ilce?: string;
  /** Resmî `adres` attribute'u (tam adres metni). */
  adres?: string;
  postaKodu?: string;
  telefon?: string;
  elektronikPostaAdresi?: string;
}

/**
 * Resmî `taraf`: `id ID` (ID/IDREF için) + `<rolTur>` ELEMENT (girdideki resolution'dan) +
 * `kisiKurumBilgileri` (kişi VEYA kurum, opsiyonel adres). Yalnız `RESOLVED` resolution serialize edilir.
 */
export interface OfficialTaraf {
  /** taraf `id ID` — ID/IDREF çapraz-referans için. */
  id: string;
  /** Rol çözümlemesi (P02A `OfficialRoleResolution`). Yalnız `RESOLVED` serialize edilir. */
  roleResolution: OfficialRoleResolution;
  kisi?: OfficialKisi;
  kurum?: OfficialKurum;
  adres?: OfficialAdres;
}

/** Resmî `faiz` (EMPTY element + attribute modeli). Değer P03/ADR-014; P02B yalnız şekil taşır. */
export interface OfficialFaiz {
  baslangicTarihi?: string;
  bitisTarihi?: string;
  faizOran?: string;
  /** Değer authority ADR-014/P03; P02B hiçbir kanonik değer atamaz. */
  faizTipKod?: string;
  faizTutar?: string;
}

/** Resmî `alacakKalemi` (attribute modeli + opsiyonel `faiz`). */
export interface OfficialAlacakKalemi {
  id?: string;
  alacakKalemAdi?: string;
  alacakKalemTutar?: string;
  tutarTur?: string;
  faiz?: OfficialFaiz;
}

/** Resmî `dosya` attribute alt kümesi (ATTLIST dosya). */
export interface OfficialDosya {
  dosyaTipi: string;
  takipTuru?: string;
  takipYolu?: string;
  takipSekli?: string;
  mahiyetKodu?: string;
}

/** Serializer girdisi: önceden-resolved resmî exchange modeli. */
export interface OfficialExchangeInput {
  dosya: OfficialDosya;
  taraflar: OfficialTaraf[];
  alacakKalemleri?: OfficialAlacakKalemi[];
}

/**
 * Serializer sonucu. Owner düzeltmesi: `EMITTED` statüsü KULLANILMAZ — contract-derived serializer
 * yalnız `SERIALIZED_DRAFT` (resmî DTD ile doğrulanmamış taslak XML metni) veya `REJECTED` üretir.
 */
export type OfficialSerializationResult =
  | {
      status: 'SERIALIZED_DRAFT';
      /** Üretilen official-shaped XML metni (JS string). Resmî DTD ile DOĞRULANMAMIŞTIR. */
      xml: string;
      /** XML deklarasyonundaki encoding ETİKETİ (yalnız etiket; gerçek byte dönüşümü DEĞİL). */
      xmlDeclarationEncoding: 'ISO-8859-9';
      /** Gerçek byte encoding + Türkçe round-trip UYGULANMADI (P04 kapsamı). */
      byteEncodingPerformed: false;
      /** Resmî DTD doğrulaması YAPILMADI (P04 kapsamı). */
      officialDtdValidated: false;
    }
  | {
      status: 'REJECTED';
      reason: string;
      /** Çözülemeyen/desteklenmeyen taraf id'leri ve resolution kind'ları. */
      unresolved: Array<{ tarafId: string; kind: string }>;
    };
