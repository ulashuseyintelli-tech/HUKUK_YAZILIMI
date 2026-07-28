/**
 * UYAP-OFFICIAL-DTD-CONFORMANCE-RECORD-CORRECTION-R01 — kanonik kayıt düzeltmesi kilidi
 *
 * ## Düzeltilen maddi yanlış
 *
 * PR #1775 ile merge edilen kayıt şunu iddia ediyordu:
 *
 * ```text
 * OFFICIAL_DTD_ARTEFACT_ABSENT
 * "Resmî exchange.dtd owner tarafından repository'ye pinlenmiş artefakt olarak sağlanmalı"
 * OWNER KARARI GEREKİR: EVET
 * ```
 *
 * Bu **yanlıştı**. Artefakt 2026-07-18'de owner tarafından zaten teslim edilmişti —
 * repository'ye DEĞİL, **repo-dışı canonical evidence bundle**'a (Model B, MANIFEST'li,
 * SHA-256 pinli). Hatanın kökü: *working-tree/repository sınırı* ile *canonical evidence
 * sınırı* eşitlendi.
 *
 * Strict doğrulamanın GERÇEK blocker'ı `decision-log.md` 2026-07-19 owner kararı **D1**:
 * resmî DTD'nin 6 element bildirimi **NONDETERMINISTIC CONTENT MODEL** taşıyor.
 *
 * ## Bu spec neyi YAPMAZ
 *
 * Operatör iş istasyonundaki canonical bundle yoluna **erişmez** (CI'da yok, makineye
 * bağımlı olurdu). Kanonik olgular governance kaydından türetilen sabitler olarak
 * doğrulanır — deterministik ve makineden bağımsız.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  LOCAL_DTD_DRIFT_DISPOSITION,
  LOCAL_DTD_KNOWN_HASHES,
  OFFICIAL_ARTEFACT_PRESENT_IN_CANONICAL_EVIDENCE,
  OFFICIAL_ARTEFACT_PRESENT_IN_REPOSITORY,
  OWNER_DECISION_REQUIRED_FOR_MATERIALIZATION,
  STRICT_VALIDATION_BLOCK_REASON,
  STRICT_VALIDATION_ELIGIBILITY,
  measureStrictDtdValidationFeasibility,
  sha256OfFile,
} from '../official-conformance-measurement';
import { OFFICIAL_CONTRACT_PROVENANCE } from '../official-contract-provenance';

const API_ROOT = path.resolve(__dirname, '../../../../..');
const REPO_ROOT = path.resolve(API_ROOT, '../../..');
const LOCAL_DTD = path.join(API_ROOT, 'src/modules/uyap/schemas/exchange.dtd');

// ============================================================================
// CR-01 — repository yokluğu ≠ canonical evidence yokluğu
// ============================================================================

describe('CR-01 — repository artefact absent != canonical evidence absent', () => {
  it('iki yüzey AYRI sabitlerle temsil edilir', () => {
    expect(OFFICIAL_ARTEFACT_PRESENT_IN_REPOSITORY).toBe(false);
    expect(OFFICIAL_ARTEFACT_PRESENT_IN_CANONICAL_EVIDENCE).toBe(true);
    // İkisi AYNI şey değildir — eşitlenirse düzeltme geri alınmış demektir.
    expect(OFFICIAL_ARTEFACT_PRESENT_IN_REPOSITORY).not.toBe(
      OFFICIAL_ARTEFACT_PRESENT_IN_CANONICAL_EVIDENCE,
    );
  });

  it('ölçüm evidence i her iki yüzeyi de AYRI AYRI raporlar', () => {
    const { evidence } = measureStrictDtdValidationFeasibility();
    expect(evidence).toContain('officialArtefactPresentInRepository=false');
    expect(evidence).toContain('officialArtefactPresentInCanonicalEvidence=true');
  });

  it('P02A olgusu KORUNUR (dtdFilePresentInRepository=false hâlâ doğru)', () => {
    expect(OFFICIAL_CONTRACT_PROVENANCE.dtdFilePresentInRepository).toBe(false);
  });
});

// ============================================================================
// CR-02 / CR-03 — canonical bundle SHA ve byte length
// ============================================================================

describe('CR-02/CR-03 — canonical bundle kimliği', () => {
  it('CR-02: pinlenmiş SHA-256 kaydı DEĞİŞMEDİ', () => {
    expect(OFFICIAL_CONTRACT_PROVENANCE.dtdSha256).toBe(
      '124a9a96848299d8abf216111572d7c8286777819422a5e29089b956f56a8fe6',
    );
  });

  it('CR-03: doğrulanmış byte length kayıt altındadır', () => {
    // Canonical bundle ölçümü (operatör iş istasyonu, 2026-07-28): 9273 byte.
    // Sabit governance kaydındadır; bu spec dosya sistemine ERİŞMEZ.
    const doc = fs.readFileSync(
      path.join(REPO_ROOT, 'project/docs/blueprint/UYAP-OFFICIAL-DTD-AND-CODELIST-CONFORMANCE-I01-v1.0.md'),
      'utf8',
    );
    expect(doc).toContain('9273');
    expect(doc).toContain('124a9a96848299d8abf216111572d7c8286777819422a5e29089b956f56a8fe6');
  });
});

// ============================================================================
// CR-04 / CR-05 — blocker sebebi ve owner kararı
// ============================================================================

describe('CR-04/CR-05 — strict validation blocker semantiği', () => {
  it('CR-04: blocker NONDETERMINISTIC_CONTENT_MODEL dir (artefakt yokluğu DEĞİL)', () => {
    expect(STRICT_VALIDATION_BLOCK_REASON).toBe('NONDETERMINISTIC_CONTENT_MODEL');
    expect(STRICT_VALIDATION_ELIGIBILITY).toBe('BLOCKED');

    const { state, evidence } = measureStrictDtdValidationFeasibility();
    // Eski (yanlış) durum kodu ARTIK KULLANILMAZ.
    expect(state).not.toBe('UNMEASURABLE_ARTEFACT_ABSENT');
    expect(state).toBe('BLOCKED_BY_CONTRACT_GRAMMAR');
    expect(evidence).toContain('strictValidationBlockReason=NONDETERMINISTIC_CONTENT_MODEL');
  });

  it('CR-05: materialization için owner kararı GEREKMEZ', () => {
    expect(OWNER_DECISION_REQUIRED_FOR_MATERIALIZATION).toBe(false);
    expect(measureStrictDtdValidationFeasibility().evidence).toContain(
      'ownerDecisionRequiredForMaterialization=false',
    );
  });

  it('hiçbir yüzey "resmî DTD ile doğrulandı" İDDİA ETMEZ (değişmedi)', () => {
    expect(OFFICIAL_CONTRACT_PROVENANCE.typeModelOfficiallyDtdValidated).toBe(false);
    expect(OFFICIAL_CONTRACT_PROVENANCE.runtimeCutoverAuthority).toBe('NONE');
  });
});

// ============================================================================
// CR-06 — ağ indirmesi yok
// ============================================================================

describe('CR-06 — no network download', () => {
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue;
        walk(p, acc);
      } else if (e.name.endsWith('.ts') && !e.name.includes('.spec.')) acc.push(p);
    }
    return acc;
  };

  it('production kodu resmî kaynaktan DTD indirmez', () => {
    const offenders: string[] = [];
    for (const f of walk(path.join(API_ROOT, 'src'))) {
      const code = stripComments(fs.readFileSync(f, 'utf8'));
      if (/(fetch|axios|https?\.get|request)\s*\(\s*[`'"][^`'"]*(uyap\.gov\.tr|rayp\.adalet\.gov\.tr)/.test(code)) {
        offenders.push(path.relative(API_ROOT, f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('ölçüm modülü operatör iş istasyonu yoluna BAĞLANMAZ (CI deterministik)', () => {
    const src = fs.readFileSync(
      path.join(API_ROOT, 'src/modules/uyap/official/official-conformance-measurement.ts'),
      'utf8',
    );
    // Mutlak Windows yolu veya bundle dizini production kodunda GEÇMEZ.
    expect(src).not.toMatch(/[A-Za-z]:\\\\?Development/);
    expect(src).not.toContain('UYAP_OFFICIAL_PACKAGE_REVIEW');
  });
});

// ============================================================================
// CR-07 — repo DTD drift yüzeye çıkarıldı
// ============================================================================

describe('CR-07 — repo DTD drift surfaced', () => {
  it('iki bilinen hash de kayıt altındadır', () => {
    expect(LOCAL_DTD_KNOWN_HASHES.beforeTruthfulnessContainment).toBe(
      '5a3ea03c4f92e92949408cb98532132436a8028836030b86a2de422529e55a5f',
    );
    expect(LOCAL_DTD_KNOWN_HASHES.afterTruthfulnessContainment).toBe(
      'a7c2e2672603dd3375c15fb572cde4fbe24a7505d9039feead86326ba5827ae1',
    );
  });

  it('güncel dosya "after" hash ile eşleşir', () => {
    expect(sha256OfFile(LOCAL_DTD)).toBe(
      LOCAL_DTD_KNOWN_HASHES.afterTruthfulnessContainment,
    );
  });

  it('drift disposition EXPECTED_LOCAL_DERIVATIVE dir (UNAUTHORIZED DEĞİL)', () => {
    expect(LOCAL_DTD_DRIFT_DISPOSITION).toBe('EXPECTED_LOCAL_DERIVATIVE');
  });

  it('drift YALNIZ başlık yorumundadır — DTD grameri DEĞİŞMEDİ', () => {
    const dtd = fs.readFileSync(LOCAL_DTD, 'utf8');
    // Truthfulness banner mevcut (PR #1385 F4).
    expect(dtd).toContain('NOT THE OFFICIAL UYAP exchange.dtd');
    // Yanıltıcı eski etiket KALDIRILMIŞ.
    expect(dtd).not.toContain('Versiyon: 2024.03');
    // Gramer gövdesi yerinde.
    expect(dtd).toContain('<!ELEMENT exchangeData (dosyalar)>');
  });
});

// ============================================================================
// CR-08 — tarihsel bulgu SİLİNMEDİ, superseded olarak korundu
// ============================================================================

describe('CR-08 — historical PR #1775 finding preserved as superseded', () => {
  const doc = () =>
    fs.readFileSync(
      path.join(REPO_ROOT, 'project/docs/blueprint/UYAP-OFFICIAL-DTD-AND-CODELIST-CONFORMANCE-I01-v1.0.md'),
      'utf8',
    );

  it('orijinal bulgu metni KORUNUR (sessiz silme yok)', () => {
    expect(doc()).toContain('OFFICIAL_DTD_ARTEFACT_ABSENT');
  });

  it('disposition blokları eksiksizdir', () => {
    const d = doc();
    expect(d).toContain('SUPERSEDED — EVIDENCE SCOPE INCOMPLETE');
    // Disposition bloğu hizalanmış olabilir (`ALAN  : DEĞER`) — esnek eşleşme.
    expect(d).toMatch(/ARTEFACT-ABSENCE DISPOSITION\s*:\s*RETRACTED/);
    expect(d).toMatch(/STRICT-CONFORMANCE DISPOSITION\s*:\s*OPEN \/ BLOCKED BY D1/);
  });

  it('yeni artefakt ÜRETİLDİĞİ izlenimi verilmez; 2026-07-18 tarihi yazılıdır', () => {
    const d = doc();
    expect(d).toContain('2026-07-18');
    expect(d).toMatch(/zaten mevcut|zaten teslim/i);
  });

  it('licence/redistribution gerekçesi UNSPECIFIED olarak KORUNUR', () => {
    expect(doc()).toContain('UNSPECIFIED');
  });

  it('Model B nin P02A ile uyumlu olduğu kayıtlıdır', () => {
    expect(doc()).toMatch(/Model B[\s\S]{0,400}P02A/);
  });
});
