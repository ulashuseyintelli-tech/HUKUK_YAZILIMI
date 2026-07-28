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
  /**
   * Ölçülemiyor: gerekli resmî artefakt HİÇBİR yüzeyde yok.
   *
   * UYAP-OFFICIAL-DTD-CONFORMANCE-RECORD-CORRECTION-R01: resmî DTD **bu durumda
   * DEĞİLDİR** — canonical evidence bundle'da mevcuttur. Bu değer yalnız gerçekten
   * hiçbir yüzeyde bulunmayan artefaktlar için ayrılmıştır.
   */
  | 'UNMEASURABLE_ARTEFACT_ABSENT'
  /**
   * Artefakt MEVCUT ve doğrulanmış; ölçüm resmî sözleşmenin KENDİ grameri nedeniyle
   * yapılamıyor (D1 nondeterministic content model). Artefakt yokluğuyla KARIŞTIRILMAZ.
   */
  | 'BLOCKED_BY_CONTRACT_GRAMMAR';

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

// ============================================================================
// UYAP-OFFICIAL-DTD-CONFORMANCE-RECORD-CORRECTION-R01
// Ölçüm semantiği ayrıştırması — "repository'de yok" ≠ "artefakt yok"
// ============================================================================

/**
 * **DÜZELTME KAYDI.** I01 ilk ölçümü `dtdFilePresentInRepository === false` olgusunu
 * doğru okudu ama SONUCUNU yanlış çerçeveledi: "resmî byte artefaktı YOK, owner
 * sağlamalı". Gerçek şu ki artefakt **2026-07-18'de owner tarafından zaten teslim
 * edilmişti** — repository'ye DEĞİL, **repo-dışı canonical evidence bundle**'a
 * (Model B, MANIFEST'li, SHA-256 pinli).
 *
 * Hatanın kökü: *working-tree/repository sınırı* ile *canonical evidence sınırı*
 * eşitlendi. Bu iki alan artık isim seviyesinde AYRIŞTIRILMIŞTIR.
 *
 * Kaynak: `decision-log.md` 2026-07-18 `DBP-P2-UYAP-PUBLIC-SOURCES-01-GOV` —
 * *"Resmî paket repo-DIŞI READ-ONLY intake ...'a kaynak yapısı korunarak alındı
 * + MANIFEST (URL/tarih/boyut/SHA-256/archive+extraction path)"*.
 */
export const OFFICIAL_ARTEFACT_PRESENT_IN_REPOSITORY = false;

/**
 * Resmî byte artefaktı **canonical evidence yüzeyinde MEVCUTTUR** (Model B).
 *
 * Bu bir dosya-sistemi okuması DEĞİLDİR: konum operatör iş istasyonundadır ve CI
 * ondan erişemez. Değer, owner-ratified governance kaydından türetilen bir
 * **olgu beyanıdır**; böylece ölçüm makineden bağımsız ve CI'da deterministiktir.
 */
export const OFFICIAL_ARTEFACT_PRESENT_IN_CANONICAL_EVIDENCE = true;

/** Strict DTD doğrulamasının uygunluk durumu. */
export type StrictValidationEligibility = 'ELIGIBLE' | 'BLOCKED';

/**
 * Strict doğrulamayı bloke eden GERÇEK neden.
 *
 * `ARTEFACT_ABSENT` **DEĞİLDİR** — artefakt mevcut ve hash'i eşleşiyor. Blocker,
 * resmî DTD'nin **kendi grameridir**: 6 element bildirimi NONDETERMINISTIC CONTENT
 * MODEL taşır (XML 1.0 §3.2.1) — `exchangeData`(kök), `taraf`, `kisiKurumBilgileri`,
 * `kontratKefil`, `VekilKisi`, `ilam`. Kök ambiguity'si tek başına en minimal belgeyi
 * bile reddeder; bu serializer kaynaklı DEĞİL, artefaktın özelliğidir.
 *
 * Kaynak: `decision-log.md` 2026-07-19 `DBP-P2-UYAP-CONTRACT-A-P04B-VAL-R1-GOV`
 * owner kararı **D1** (validator: libxml2/xmllint 2.13.9).
 */
export const STRICT_VALIDATION_BLOCK_REASON = 'NONDETERMINISTIC_CONTENT_MODEL' as const;

/** Strict doğrulama şu an uygun değildir — sebep artefakt yokluğu DEĞİLDİR. */
export const STRICT_VALIDATION_ELIGIBILITY: StrictValidationEligibility = 'BLOCKED';

/**
 * Materialization için **yeni owner kararı GEREKMEZ**: artefakt Model B ile zaten
 * teslim edilmiş ve P02A'nın "repository'ye eklenmez" kuralıyla ÇELİŞMEZ
 * (repo'da yok, canonical evidence'ta pinli ve manifested).
 */
export const OWNER_DECISION_REQUIRED_FOR_MATERIALIZATION = false;

/**
 * Strict DTD doğrulamasının ÇALIŞTIRILABİLİR olup olmadığını ölçer.
 *
 * **Geriye dönük uyumluluk:** dönen `state` DEĞİŞMEDİ — ölçüm hâlâ "strict doğrulama
 * yapılamıyor" der. DEĞİŞEN, `evidence` içindeki GEREKÇEDİR: artık artefakt yokluğu
 * değil, D1 nondeterministic grammar blocker'ı raporlanır.
 */
export function measureStrictDtdValidationFeasibility(): ConformanceDimension {
  // `OFFICIAL_CONTRACT_PROVENANCE` `as const`'tur → alan tipi literal `false`. Ölçüm,
  // artefakt ileride repository'ye eklenirse KENDİLİĞİNDEN doğru sonucu vermelidir;
  // bu yüzden değer boolean'a genişletilerek okunur (literal karşılaştırma derlenmez).
  const inRepository: boolean = OFFICIAL_CONTRACT_PROVENANCE.dtdFilePresentInRepository;
  return {
    dimension: 'STRICT_DTD_VALIDATION_FEASIBILITY',
    state: STRICT_VALIDATION_ELIGIBILITY === 'ELIGIBLE' ? 'CONFORMANT' : 'BLOCKED_BY_CONTRACT_GRAMMAR',
    evidence:
      `officialArtefactPresentInRepository=${inRepository}; ` +
      `officialArtefactPresentInCanonicalEvidence=${OFFICIAL_ARTEFACT_PRESENT_IN_CANONICAL_EVIDENCE}; ` +
      `strictValidationEligibility=${STRICT_VALIDATION_ELIGIBILITY}; ` +
      `strictValidationBlockReason=${STRICT_VALIDATION_BLOCK_REASON}; ` +
      `ownerDecisionRequiredForMaterialization=${OWNER_DECISION_REQUIRED_FOR_MATERIALIZATION}; ` +
      `typeModelOfficiallyDtdValidated=${OFFICIAL_CONTRACT_PROVENANCE.typeModelOfficiallyDtdValidated}`,
  };
}

/**
 * Repository içindeki YEREL `exchange.dtd`'nin bilinen sürüm geçmişi.
 *
 * `decision-log.md` 2026-07-18 kaydı `5a3ea03c…` hash'ini yazdı; bugün ölçülen değer
 * `a7c2e267…`. Bu **yetkisiz bir kayma DEĞİLDİR**: aynı gün merge edilen PR #1385
 * (`DBP-P2-UYAP-CONTRACT-A-P01`, F4) dosyanın YALNIZ başlık yorumunu değiştirdi
 * (6 ekleme / 3 silme; hiçbir `<!ELEMENT`/`<!ATTLIST` bildirimi değişmedi) ve
 * yanıltıcı *"UYAP e-Takip XML DTD / Versiyon: 2024.03"* etiketini
 * *"LOCAL / LEGACY CONTRACT — NOT THE OFFICIAL"* uyarısıyla değiştirdi.
 * Governance kaydı, containment merge edilmeden ÖNCEKİ değeri yakalamıştır.
 */
export const LOCAL_DTD_KNOWN_HASHES = Object.freeze({
  /** 2026-01-02 `9d6e7cfb` — governance kaydında geçen değer. */
  beforeTruthfulnessContainment:
    '5a3ea03c4f92e92949408cb98532132436a8028836030b86a2de422529e55a5f',
  /** 2026-07-18 `e3c881b3` (PR #1385, F4) — güncel değer. */
  afterTruthfulnessContainment:
    'a7c2e2672603dd3375c15fb572cde4fbe24a7505d9039feead86326ba5827ae1',
});

/** Yerel DTD kayma sınıflandırması. Kanıt yetersizse `UNKNOWN` kullanılır — tahmin YOK. */
export const LOCAL_DTD_DRIFT_DISPOSITION = 'EXPECTED_LOCAL_DERIVATIVE' as const;

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
