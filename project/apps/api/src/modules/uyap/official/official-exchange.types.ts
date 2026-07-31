import type {
  OfficialCodeResolution,
  OfficialWrapperResolution,
} from './official-codelist-registry';
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
 * - ID ANCHOR INTEGRITY (P02B-R1): `id` anchor'ları (taraf zorunlu, alacakKalemi opsiyonel) resmî `id ID`
 *   tipidir → belge genelinde BENZERSİZ ve BOŞ-OLMAYAN olmalıdır. Boş veya çift `id` → `REJECTED`
 *   (`idViolations`). **`ref`/IDREF CROSS-REFERENCE bu alt-kümede DESTEKLENMEZ** — girdi tipi `ref`
 *   taşımaz (ref-bearing input TYPE TARAFINDAN İFADE EDİLEMEZ), serializer `<ref>` üretmez.
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
 * Resmî `taraf`: `id ID` anchor + `<rolTur>` ELEMENT (girdideki resolution'dan) +
 * `kisiKurumBilgileri` (kişi VEYA kurum, opsiyonel adres). Yalnız `RESOLVED` resolution serialize edilir.
 */
export interface OfficialTaraf {
  /**
   * taraf `id ID` anchor — belge genelinde BENZERSİZ ve BOŞ-OLMAYAN olmalıdır (boş/çift → REJECTED).
   * `ref`/IDREF cross-reference bu alt-kümede DESTEKLENMEZ (P02B-R1); bu alan yalnız ID anchor'ıdır.
   */
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
  /**
   * UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01: kalem, owner-ratified
   * sarmalayıcı çözümü (W-01…W-05, `resolveOfficialAlacakKalemiWrapper`) taşıyorsa
   * RESOLVED sarmalayıcı ELEMENTİ altında emit edilir. Alan yoksa veya çözüm
   * RESOLVED değilse P02B-R2 fail-closed reddi AYNEN uygulanır — sarmalayıcı
   * TAHMİN EDİLMEZ, `digerAlacak`'a fallback YOKTUR.
   */
  wrapperResolution?: OfficialWrapperResolution;
}

/**
 * Resmî `dosya` attribute alt kümesi (ATTLIST dosya).
 *
 * **P02B-R2 / XA-04:** hukuki anlam taşıyan kodlu alanlar (`takipTuru`, `mahiyetKodu`)
 * artık ÇAĞIRANDAN HAM STRING olarak alınmaz. Legacy sözlük aynı sayısal kodları farklı
 * hukuki anlamlarla kullandığı için "geçerli kod" tek başına doğru anlam kanıtı değildir;
 * bu yüzden alanlar `OfficialCodeResolution` ile çözülmüş olarak verilir.
 */
export interface OfficialDosya {
  dosyaTipi: string;

  /**
   * `takipTuru` anlam çözümü. **ZORUNLU** — çünkü resmî DTD bu attribute'u
   * `(0 | 1) "1"` ile VARSAYILANLI bildirir: attribute yoksa ayrıştırıcı `1`
   * (İlamsız) uygular. Sessiz ihmal örtük hukuki iddiadır; `NOT_ASSERTED` ile
   * AÇIKÇA beyan edilmelidir.
   */
  takipTuruResolution: OfficialCodeResolution;

  /** `mahiyetKodu` anlam çözümü. Attribute gerçekten `#IMPLIED` olduğu için opsiyonel. */
  mahiyetResolution?: OfficialCodeResolution;

  /** Kodlu-anlam kapsamı dışı (P02B-R2'de eşleme yapılmadı; olduğu gibi taşınır). */
  takipYolu?: string;
  takipSekli?: string;
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
      /**
       * ID ANCHOR INTEGRITY ihlalleri (P02B-R1): boş veya çift `id`. Yalnız id-integrity reddinde
       * doldurulur; rol reddinde tanımsızdır. `source` ihlalin geldiği element türüdür.
       */
      idViolations?: Array<{
        id: string;
        issue: 'EMPTY_ID' | 'DUPLICATE_ID';
        source: 'taraf' | 'alacakKalemi';
      }>;
      /**
       * CLAIM-WRAPPER AUTHORITY GUARD (P02B-R2): `alacakKalemleri` bir veya daha fazla kalem
       * içeriyorsa doldurulur. Resmî DTD'de `alacakKalemi`, `dosya`'nın DOĞRUDAN çocuğu OLAMAZ —
       * yalnız cek/senet/police/kontrat/digerAlacak/ilam sarmalayıcıları altında geçerlidir. Hangi
       * sarmalayıcının doğru olduğuna dair owner/LDO yetkisi henüz verilmemiştir; bu alan yalnız
       * FAIL-CLOSED reddi taşır — hiçbir wrapper/instrument otomatik seçilmez veya varsayılmaz.
       */
      claimShapeViolations?: Array<{
        code: 'UNAUTHORIZED_ALACAK_KALEMI_PARENT';
        path: 'dosya/alacakKalemi';
        count: number;
        /** Resmî DTD'den ölçülmüş yetkili ebeveyn listesi (bkz. `OFFICIAL_ALACAK_KALEMI_PARENTS`). */
        authorizedParents: readonly string[];
      }>;
    };
