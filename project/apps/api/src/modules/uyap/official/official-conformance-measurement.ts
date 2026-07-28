/**
 * UYAP-OFFICIAL-DTD-AND-CODELIST-CONFORMANCE-I01 — resmî sözleşmeye uyum ÖLÇÜMÜ.
 *
 * ## Ne yapar
 *
 * Repository'nin resmî UYAP Contract A sözleşmesine uyum durumunu **ölçer ve sabitler**.
 * Ölçüm, repository içinden deterministik olarak türetilebilen olgularla sınırlıdır;
 * hiçbir dış kaynağa erişmez ve hiçbir resmî artefaktı **üretmez**.
 *
 * ## Ne YAPMAZ
 *
 * - Resmî `exchange.dtd` içeriğini indirmez, üretmez veya tahmin etmez.
 * - Strict DTD doğrulaması ÇALIŞTIRMAZ — resmî DTD artefaktı repository'de yoktur
 *   (`OFFICIAL_CONTRACT_PROVENANCE.dtdFilePresentInRepository === false`, P02A bağlayıcı sınırı).
 * - Legacy kodları resmî kodlara EŞLEMEZ; eşleme owner authority'sidir (P03A/P03B).
 * - Runtime davranışı DEĞİŞTİRMEZ; yalnız test-reachable saf ölçümdür.
 *
 * ## Neden ayrı bir modül
 *
 * Uyum durumu bugüne kadar üç ayrı yere dağılmış prose olarak duruyordu (provenance
 * yorumları, legacy DTD başlığı, translator JSDoc'ları). Makine tarafından kontrol
 * edilebilir tek bir ölçüm yüzeyi olmadan "uyumlu mu?" sorusu her turda yeniden
 * yorumlanıyordu. Bu modül o soruyu **veriye** çevirir.
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { OFFICIAL_CONTRACT_PROVENANCE } from './official-contract-provenance';

/**
 * Resmî Contract A `rolTur` sözlüğünün geçerli `rolID` aralığı.
 *
 * Kaynak: `official-role-translator.ts` owner-ratified authority tablosu (P03A) —
 * BORÇLU/MÜFLİS=22, KEFİL=33. Resmî sözlük 21..71 aralığındadır. Bu aralık burada
 * **yeniden tanımlanmaz**, yalnız ölçüm için sınır olarak kullanılır; hiçbir domain
 * rolü bu modülde bir `rolID`'ye eşlenmez.
 */
export const OFFICIAL_ROL_ID_RANGE = Object.freeze({ min: 21, max: 71 });

/** Repository'deki YEREL (resmî OLMAYAN) DTD dosyasının yolu. */
export const LOCAL_LEGACY_DTD_RELATIVE_PATH = 'src/modules/uyap/schemas/exchange.dtd';

/** Uyum boyutlarının makine-okunur durumu. */
export type ConformanceState =
  /** Ölçüldü ve resmî sözleşmeyle UYUMLU. */
  | 'CONFORMANT'
  /** Ölçüldü ve resmî sözleşmeden SAPIYOR. */
  | 'DIVERGENT'
  /** Ölçülemiyor: gerekli resmî artefakt repository'de YOK. */
  | 'UNMEASURABLE_ARTEFACT_ABSENT';

export interface ConformanceDimension {
  readonly dimension: string;
  readonly state: ConformanceState;
  /** Ölçümün dayandığı somut olgu (hash, sayı, küme). */
  readonly evidence: string;
}

/**
 * Bir dosyanın SHA-256'sı. Resmî DTD ile karşılaştırma **yalnız hash** üzerinden yapılır;
 * içerik karşılaştırması resmî dosya olmadığı için mümkün değildir.
 */
export function sha256OfFile(absolutePath: string): string {
  return createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
}

/**
 * Yerel `exchange.dtd`'nin resmî sözleşme DOSYASI olup olmadığını ölçer.
 *
 * Beklenen sonuç `DIVERGENT`'tır: dosya kendi başlığında resmî olmadığını beyan eder ve
 * hash'i pinlenmiş resmî hash ile eşleşmez. Bu bir kusur DEĞİL, doğru etiketlenmiş bir
 * durumdur; ölçüm onu sabitler.
 */
export function measureLocalDtdIdentity(apiRoot: string): ConformanceDimension {
  const localPath = path.join(apiRoot, LOCAL_LEGACY_DTD_RELATIVE_PATH);
  if (!fs.existsSync(localPath)) {
    return {
      dimension: 'LOCAL_DTD_IDENTITY',
      state: 'UNMEASURABLE_ARTEFACT_ABSENT',
      evidence: `yerel DTD bulunamadi: ${LOCAL_LEGACY_DTD_RELATIVE_PATH}`,
    };
  }
  const localHash = sha256OfFile(localPath);
  const officialHash = OFFICIAL_CONTRACT_PROVENANCE.dtdSha256;
  return {
    dimension: 'LOCAL_DTD_IDENTITY',
    state: localHash === officialHash ? 'CONFORMANT' : 'DIVERGENT',
    evidence: `local=${localHash} official=${officialHash}`,
  };
}

/**
 * Strict DTD doğrulamasının ÇALIŞTIRILABİLİR olup olmadığını ölçer.
 *
 * Resmî DTD içeriği repository'de bulunmadığı sürece strict doğrulama yapılamaz;
 * bu, kod eksikliği değil **artefakt eksikliğidir**. Sessizce "doğrulandı" demek
 * yerine ölçüm bunu açıkça `UNMEASURABLE_ARTEFACT_ABSENT` olarak raporlar.
 */
export function measureStrictDtdValidationFeasibility(): ConformanceDimension {
  // `OFFICIAL_CONTRACT_PROVENANCE` `as const`'tur → alan tipi literal `false`. Ölçüm,
  // artefakt ileride eklenirse KENDİLİĞİNDEN doğru sonucu vermelidir; bu yüzden değer
  // boolean'a genişletilerek okunur (literal karşılaştırma derlenmez, TS2367).
  const present: boolean = OFFICIAL_CONTRACT_PROVENANCE.dtdFilePresentInRepository;
  return {
    dimension: 'STRICT_DTD_VALIDATION_FEASIBILITY',
    state: present ? 'CONFORMANT' : 'UNMEASURABLE_ARTEFACT_ABSENT',
    evidence: `dtdFilePresentInRepository=${present}; ` +
      `typeModelOfficiallyDtdValidated=${OFFICIAL_CONTRACT_PROVENANCE.typeModelOfficiallyDtdValidated}`,
  };
}

/**
 * Runtime'da yayılan legacy `rolTur` kodlarının resmî `rolID` sözlüğüne ait olup
 * olmadığını ölçer.
 *
 * Legacy kodlar sayısal string'lerdir (`'1'..'10'`); resmî sözlük `21..71` aralığındadır.
 * Kesişim boşsa runtime'da üretilen HER `rolTur` resmî sözlüğün DIŞINDADIR.
 */
export function measureRolTurCodelistOverlap(
  legacyCodes: readonly string[],
): ConformanceDimension {
  const insideOfficialRange = legacyCodes.filter((code) => {
    const n = Number(code);
    return (
      Number.isInteger(n) && n >= OFFICIAL_ROL_ID_RANGE.min && n <= OFFICIAL_ROL_ID_RANGE.max
    );
  });
  return {
    dimension: 'ROLTUR_CODELIST_OVERLAP',
    state: insideOfficialRange.length === legacyCodes.length ? 'CONFORMANT' : 'DIVERGENT',
    evidence:
      `legacy=[${[...legacyCodes].sort((a, b) => Number(a) - Number(b)).join(',')}] ` +
      `officialRange=${OFFICIAL_ROL_ID_RANGE.min}-${OFFICIAL_ROL_ID_RANGE.max} ` +
      `inRange=${insideOfficialRange.length}/${legacyCodes.length}`,
  };
}
