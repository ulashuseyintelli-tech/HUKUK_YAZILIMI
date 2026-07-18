import { create } from 'xmlbuilder2';

import type {
  OfficialAlacakKalemi,
  OfficialExchangeInput,
  OfficialSerializationResult,
  OfficialTaraf,
} from './official-exchange.types';

/**
 * DBP-P2-UYAP-CONTRACT-A-P02B — Official Contract A serializer (SKELETON)
 *
 * Resmî `exchange.dtd` v1.2 şeklinden TÜRETİLMİŞ (contract-derived) DETERMİNİSTİK serializer.
 *
 * Davranış:
 * - ID ANCHOR INTEGRITY (P02B-R1): tüm `id` anchor'ları (taraf zorunlu + alacakKalemi opsiyonel) belge
 *   genelinde BENZERSİZ + BOŞ-OLMAYAN olmalı (official `id ID`). Boş/çift `id` → `REJECTED` (`idViolations`).
 * - UNRESOLVED-ROLE REJECTION: herhangi bir `taraf.roleResolution` `RESOLVED` değilse → `REJECTED`
 *   (XML ÜRETİLMEZ). Boş taraf listesi de `REJECTED`.
 * - Aksi hâlde official-shaped XML üretilir ve `SERIALIZED_DRAFT` döner (owner düzeltmesi: `EMITTED`
 *   YOK — bu XML resmî DTD ile DOĞRULANMAMIŞTIR).
 * - ENCODING: yalnız XML deklarasyon etiketi `ISO-8859-9`; gerçek byte dönüşümü + Türkçe round-trip
 *   YAPILMAZ (`byteEncodingPerformed=false`, P04 kapsamı).
 * - DETERMİNİZM: girdi sırası korunur; `Date`/rastgelelik yoktur; aynı girdi aynı XML.
 *
 * Sınırlar:
 * - domain `DebtorRole` → `rolID` eşlemesi YAPILMAZ (P03 authority); `rolID`/`Rol` yalnız girdideki
 *   `RESOLVED` resolution'dan alınır. Bu dosyada hiçbir kanonik `rolID` (21-71) değeri yoktur.
 * - Runtime wiring YOK; `PrismaService`/NestJS bağımlılığı YOK; yalnız test-reachable saf fonksiyondur.
 * - Instrument (cek/senet/police) elementleri bu iskelette KAPSAM DIŞIdır (P04-adjacent artım).
 * - `ref`/IDREF CROSS-REFERENCE bu alt-kümede DESTEKLENMEZ: girdi tipi `ref` taşımaz, serializer `<ref>`
 *   ÜRETMEZ. `id` yalnız ID anchor'ıdır (benzersiz/boş-olmayan garanti edilir); IDREF çözümlemesi yoktur.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * /// - (P02B) YALNIZ test-reachable; hiçbir controller/servis/route/module bu fonksiyonu çağırmaz.
 * /// </remarks>
 */
export function serializeOfficialExchange(
  input: OfficialExchangeInput,
): OfficialSerializationResult {
  // 1) ID ANCHOR INTEGRITY (P02B-R1) — tüm `id` anchor'ları belge genelinde BENZERSİZ + BOŞ-OLMAYAN
  //    olmalıdır (official `id ID`). Boş/çift id → REJECTED. `ref`/IDREF cross-reference DESTEKLENMEZ.
  const idViolations = collectIdViolations(input);
  if (idViolations.length > 0) {
    return {
      status: 'REJECTED',
      reason:
        'Gecersiz id anchor: bos veya cift id var; official `id ID` belge genelinde benzersiz ve ' +
        'bos-olmayan olmalidir (P02B-R1). ref/IDREF cross-reference bu alt-kumede desteklenmez.',
      unresolved: [],
      idViolations,
    };
  }

  // 2) UNRESOLVED-ROLE REJECTION — her taraf RESOLVED olmalı.
  const unresolved = input.taraflar
    .filter((t) => t.roleResolution.kind !== 'RESOLVED')
    .map((t) => ({ tarafId: t.id, kind: t.roleResolution.kind }));

  if (unresolved.length > 0) {
    return {
      status: 'REJECTED',
      reason:
        'Cozulememis veya desteklenmeyen taraf rolu var; resmi Contract A XML uretilmez (P02B). ' +
        'Rol degerleri P03 (OWNER/LDO) authority kararini bekler.',
      unresolved,
    };
  }

  if (input.taraflar.length === 0) {
    return {
      status: 'REJECTED',
      reason: 'En az bir taraf zorunludur.',
      unresolved: [],
    };
  }

  // 3) DETERMİNİSTİK official-shaped XML (resmî exchange.dtd v1.2).
  const doc = create({ version: '1.0', encoding: 'ISO-8859-9' })
    .dtd({ name: 'exchangeData', sysID: 'exchange.dtd' })
    .ele('exchangeData');

  // exchangeHeader? , dosyalar  (DTD: (exchangeHeader?, dosyalar) alternatifi)
  doc.ele('exchangeHeader', { versiyon: '1.2' }).up();

  const dosyalar = doc.ele('dosyalar');
  const dosya = dosyalar.ele(
    'dosya',
    pruneUndefined({
      dosyaTipi: input.dosya.dosyaTipi,
      takipTuru: input.dosya.takipTuru,
      takipYolu: input.dosya.takipYolu,
      takipSekli: input.dosya.takipSekli,
      mahiyetKodu: input.dosya.mahiyetKodu,
    }),
  );

  // Taraflar — deterministik (girdi sırası korunur).
  for (const taraf of input.taraflar) {
    addOfficialTaraf(dosya, taraf);
  }

  // Alacak kalemleri — deterministik (girdi sırası korunur).
  for (const kalem of input.alacakKalemleri ?? []) {
    addOfficialAlacakKalemi(dosya, kalem);
  }

  const xml = doc.end({ prettyPrint: true });

  return {
    status: 'SERIALIZED_DRAFT',
    xml,
    xmlDeclarationEncoding: 'ISO-8859-9',
    byteEncodingPerformed: false,
    officialDtdValidated: false,
  };
}

/**
 * Resmî `taraf`: `<taraf id>` + `<rolTur rolID Rol/>` ELEMENT + `kisiKurumBilgileri`
 * (kişi/kurum EMPTY attribute-carrier + opsiyonel `adres`). DTD alternatifi: `(rolTur, kisiKurumBilgileri)`.
 */
function addOfficialTaraf(parent: XmlNode, taraf: OfficialTaraf): void {
  const tarafEl = parent.ele('taraf', { id: taraf.id });

  // rolTur ELEMENT — değer yalnız RESOLVED resolution'dan (yukarıda filtrelendi).
  if (taraf.roleResolution.kind !== 'RESOLVED') {
    // Ulaşılamaz (serializeOfficialExchange filtreler); tip güvenliği için erken dönüş.
    return;
  }
  const { rolID, rol } = taraf.roleResolution;
  tarafEl.ele('rolTur', { rolID, Rol: rol }).up();

  const kkb = tarafEl.ele('kisiKurumBilgileri');
  if (taraf.kisi) {
    kkb
      .ele(
        'kisiTumBilgileri',
        pruneUndefined({
          adi: taraf.kisi.adi,
          soyadi: taraf.kisi.soyadi,
          tcKimlikNo: taraf.kisi.tcKimlikNo,
          babaAdi: taraf.kisi.babaAdi,
          anaAdi: taraf.kisi.anaAdi,
          dogumTarihi: taraf.kisi.dogumTarihi,
          dogumYeri: taraf.kisi.dogumYeri,
          vergiNo: taraf.kisi.vergiNo,
        }),
      )
      .up();
  } else if (taraf.kurum) {
    kkb
      .ele(
        'kurum',
        pruneUndefined({
          kurumAdi: taraf.kurum.kurumAdi,
          vergiNo: taraf.kurum.vergiNo,
          vergiDairesi: taraf.kurum.vergiDairesi,
          ticaretSicilNo: taraf.kurum.ticaretSicilNo,
          mersisNo: taraf.kurum.mersisNo,
        }),
      )
      .up();
  }
  if (taraf.adres) {
    kkb
      .ele(
        'adres',
        pruneUndefined({
          adresTuru: taraf.adres.adresTuru,
          il: taraf.adres.il,
          ilce: taraf.adres.ilce,
          adres: taraf.adres.adres,
          postaKodu: taraf.adres.postaKodu,
          telefon: taraf.adres.telefon,
          elektronikPostaAdresi: taraf.adres.elektronikPostaAdresi,
        }),
      )
      .up();
  }
}

/** Resmî `alacakKalemi` (attribute) + opsiyonel `faiz` (EMPTY attribute). */
function addOfficialAlacakKalemi(parent: XmlNode, kalem: OfficialAlacakKalemi): void {
  const kalemEl = parent.ele(
    'alacakKalemi',
    pruneUndefined({
      id: kalem.id,
      alacakKalemAdi: kalem.alacakKalemAdi,
      alacakKalemTutar: kalem.alacakKalemTutar,
      tutarTur: kalem.tutarTur,
    }),
  );
  if (kalem.faiz) {
    kalemEl
      .ele(
        'faiz',
        pruneUndefined({
          baslangicTarihi: kalem.faiz.baslangicTarihi,
          bitisTarihi: kalem.faiz.bitisTarihi,
          faizOran: kalem.faiz.faizOran,
          faizTipKod: kalem.faiz.faizTipKod,
          faizTutar: kalem.faiz.faizTutar,
        }),
      )
      .up();
  }
}

/**
 * ID ANCHOR INTEGRITY (P02B-R1): tüm `id` anchor'larını (taraf zorunlu + alacakKalemi opsiyonel)
 * belge genelinde toplar; BOŞ (`''`) veya ÇİFT `id`'leri ihlal olarak döndürür. Deterministik:
 * girdi sırası korunur; ilk görülen benzersiz sayılır, sonraki aynı değer `DUPLICATE_ID`.
 * `ref`/IDREF çözümlemesi YOKTUR (cross-reference bu alt-kümede desteklenmez).
 */
function collectIdViolations(
  input: OfficialExchangeInput,
): Array<{ id: string; issue: 'EMPTY_ID' | 'DUPLICATE_ID'; source: 'taraf' | 'alacakKalemi' }> {
  const violations: Array<{
    id: string;
    issue: 'EMPTY_ID' | 'DUPLICATE_ID';
    source: 'taraf' | 'alacakKalemi';
  }> = [];
  const seen = new Set<string>();

  const check = (id: string | undefined, source: 'taraf' | 'alacakKalemi'): void => {
    if (id === undefined) {
      return; // opsiyonel id yok → ihlal değil
    }
    if (id === '') {
      violations.push({ id: '', issue: 'EMPTY_ID', source });
      return;
    }
    if (seen.has(id)) {
      violations.push({ id, issue: 'DUPLICATE_ID', source });
      return;
    }
    seen.add(id);
  };

  for (const taraf of input.taraflar) {
    check(taraf.id, 'taraf');
  }
  for (const kalem of input.alacakKalemleri ?? []) {
    check(kalem.id, 'alacakKalemi');
  }

  return violations;
}

/** `undefined` attribute'ları eler — deterministik ve temiz XML. */
function pruneUndefined(attrs: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/** xmlbuilder2 fluent node (dar tip; kütüphane tipini bağlamamak için minimal arayüz). */
interface XmlNode {
  ele(name: string, attrs?: Record<string, string>): XmlNode;
  up(): XmlNode;
}
