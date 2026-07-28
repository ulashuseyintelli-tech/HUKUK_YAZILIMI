/**
 * UYAP-OFFICIAL-DTD-AND-CODELIST-CONFORMANCE-I01 — uyum ölçümü davranış kilidi
 *
 * ## Ölçülen soru
 *
 * "Repository'nin ürettiği UYAP XML'i resmî Contract A sözleşmesine uyuyor mu?"
 *
 * Bu soru bugüne kadar üç ayrı yerde **prose** olarak duruyordu (provenance yorumları,
 * legacy DTD başlığı, translator JSDoc'ları) ve her turda yeniden yorumlanıyordu. Bu spec
 * cevabı **veriye** çevirir ve sabitler.
 *
 * ## Ölçüm sınırı (dürüst ifade)
 *
 * Resmî `exchange.dtd` DOSYASI repository'de **yoktur** — yalnız SHA-256 pin'i vardır
 * (P02A bağlayıcı sınırı). Bu nedenle **strict DTD doğrulaması çalıştırılamaz**; bu bir
 * kod eksikliği değil, **artefakt eksikliğidir** ve ölçüm bunu `UNMEASURABLE_ARTEFACT_ABSENT`
 * olarak açıkça raporlar. Hiçbir test resmî DTD'yi indirmez, üretmez veya tahmin etmez.
 */
import * as fs from 'fs';
import * as path from 'path';
import { DebtorRole } from '@prisma/client';
import {
  OFFICIAL_ROL_ID_RANGE,
  measureLocalDtdIdentity,
  measureRolTurCodelistOverlap,
  measureStrictDtdValidationFeasibility,
  sha256OfFile,
} from '../official-conformance-measurement';
import { OFFICIAL_CONTRACT_PROVENANCE } from '../official-contract-provenance';
import { resolveOfficialRole } from '../official-role-translator';
import { UYAP_ROL_TURLERI } from '../../uyap-xml.service';

const API_ROOT = path.resolve(__dirname, '../../../../..');
const SRC = path.join(API_ROOT, 'src');

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const walk = (dir: string, acc: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(p, acc);
    } else if (entry.name.endsWith('.ts') && !entry.name.includes('.spec.')) {
      acc.push(p);
    }
  }
  return acc;
};

// ============================================================================
// 1) DTD KİMLİĞİ — yerel dosya resmî sözleşme DEĞİLDİR
// ============================================================================

describe('I07 — DTD kimliği', () => {
  it('yerel exchange.dtd resmî sözleşme DOSYASI DEĞİLDİR (hash eşleşmez)', () => {
    const result = measureLocalDtdIdentity(API_ROOT);

    expect(result.state).toBe('DIVERGENT');
    expect(result.evidence).toContain(OFFICIAL_CONTRACT_PROVENANCE.dtdSha256);
  });

  it('yerel DTD kendi başlığında resmî OLMADIĞINI beyan eder (yanıltıcı etiket yok)', () => {
    const dtd = fs.readFileSync(
      path.join(SRC, 'modules/uyap/schemas/exchange.dtd'),
      'utf8',
    );
    expect(dtd).toContain('NOT THE OFFICIAL UYAP exchange.dtd');
    expect(dtd).toContain('NOT PROVEN CONTRACT-COMPLIANT');
  });

  it('yerel DTD hash i sabittir (sessiz içerik kayması CI da kırmızıya döner)', () => {
    const hash = sha256OfFile(path.join(SRC, 'modules/uyap/schemas/exchange.dtd'));
    // Ölçülen sabit. Dosya değişirse bu test kırılır ve değişiklik BİLİNÇLİ olmak zorundadır.
    expect(hash).toBe('a7c2e2672603dd3375c15fb572cde4fbe24a7505d9039feead86326ba5827ae1');
  });
});

// ============================================================================
// 2) STRICT DTD DOĞRULAMASI — artefakt yokluğu ÖRTÜLMEZ
// ============================================================================

describe('I07 — strict DTD doğrulaması yapılabilirliği', () => {
  it('resmî DTD artefaktı repository de YOK → ölçülemez olarak raporlanır', () => {
    const result = measureStrictDtdValidationFeasibility();

    expect(result.state).toBe('UNMEASURABLE_ARTEFACT_ABSENT');
    expect(OFFICIAL_CONTRACT_PROVENANCE.dtdFilePresentInRepository).toBe(false);
    expect(OFFICIAL_CONTRACT_PROVENANCE.typeModelOfficiallyDtdValidated).toBe(false);
  });

  it('hiçbir yüzey "resmî DTD ile doğrulandı" İDDİA ETMEZ', () => {
    expect(OFFICIAL_CONTRACT_PROVENANCE.runtimeCutoverAuthority).toBe('NONE');
  });

  it('production kodu çalışma anında DTD İNDİRMEZ (owner addendum §8)', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      // uyap.gov.tr / rayp.adalet.gov.tr'ye ağ çağrısı yapan üretim kodu OLAMAZ.
      if (/(fetch|axios|https?\.get|request)\s*\(\s*[`'"][^`'"]*(uyap\.gov\.tr|rayp\.adalet\.gov\.tr)/.test(code)) {
        offenders.push(path.relative(API_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ============================================================================
// 3) CODELIST — legacy rolTur kodları resmî sözlüğün DIŞINDA
// ============================================================================

describe('I07 — rolTur codelist uyumu', () => {
  const legacyCodes = Object.values(UYAP_ROL_TURLERI).map((r) => r.kod);

  it('legacy kod kümesi tam olarak 1..10 dur (davranış kilidi)', () => {
    expect([...legacyCodes].sort((a, b) => Number(a) - Number(b))).toEqual([
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
    ]);
  });

  it('legacy kodların HİÇBİRİ resmî rolID aralığında (21-71) DEĞİLDİR', () => {
    const result = measureRolTurCodelistOverlap(legacyCodes);

    expect(result.state).toBe('DIVERGENT');
    expect(result.evidence).toContain('inRange=0/10');
  });

  it('resmî aralık ile legacy aralık KESİŞMEZ (∅)', () => {
    const inRange = legacyCodes.filter((c) => {
      const n = Number(c);
      return n >= OFFICIAL_ROL_ID_RANGE.min && n <= OFFICIAL_ROL_ID_RANGE.max;
    });
    expect(inRange).toEqual([]);
  });
});

// ============================================================================
// 4) ROL ÇÖZÜMLEME KAPSAMI — resmî translator ne kadarını çözebiliyor
// ============================================================================

describe('I07 — resmî rol çözümleme kapsamı', () => {
  it('12 DebtorRole değerinin dağılımı: 4 RESOLVED / 3 AUTHORITY_REQUIRED / 5 UNSUPPORTED', () => {
    const all = Object.values(DebtorRole) as DebtorRole[];
    const byKind: Record<string, string[]> = {};
    for (const role of all) {
      const r = resolveOfficialRole(role);
      (byKind[r.kind] ??= []).push(role);
    }

    expect(all).toHaveLength(12);
    expect(byKind.RESOLVED?.sort()).toEqual(
      ['ADI_KEFIL', 'ASIL_BORCLU', 'MUSETEREK_BORCLU', 'MUTESELSIL_KEFIL'].sort(),
    );
    expect(byKind.UNRESOLVED_AUTHORITY_REQUIRED?.sort()).toEqual(
      ['IFLAS_MASASI', 'MIRASCI', 'TASFIYE_MEMURU'].sort(),
    );
    expect(byKind.UNSUPPORTED_FOR_ROLTUR?.sort()).toEqual(
      ['AVAL', 'CIRANTA', 'KESIDECI', 'LEHDAR', 'MUHATAP'].sort(),
    );
    expect(byKind.INVALID_INPUT ?? []).toEqual([]);
  });

  it('çözülen roller YALNIZ resmî aralıktaki rolID leri üretir', () => {
    for (const role of Object.values(DebtorRole) as DebtorRole[]) {
      const r = resolveOfficialRole(role);
      if (r.kind !== 'RESOLVED') continue;
      const n = Number(r.rolID);
      expect(n).toBeGreaterThanOrEqual(OFFICIAL_ROL_ID_RANGE.min);
      expect(n).toBeLessThanOrEqual(OFFICIAL_ROL_ID_RANGE.max);
    }
  });

  it('sessiz BORÇLU fallback YOKTUR — çözülemeyen rol hedef değer üretmez', () => {
    for (const role of [DebtorRole.MIRASCI, DebtorRole.TASFIYE_MEMURU, DebtorRole.IFLAS_MASASI]) {
      const r = resolveOfficialRole(role);
      expect(r.kind).toBe('UNRESOLVED_AUTHORITY_REQUIRED');
      expect(r as any).not.toHaveProperty('rolID');
    }
  });
});

// ============================================================================
// 5) YÜZEY SINIRI — hangi yol runtime'da, hangisi değil
// ============================================================================

describe('I07 — yüzey sınırı', () => {
  it('resmî serializer/translator RUNTIME a bağlı DEĞİLDİR (test-reachable)', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file.includes(path.join('modules', 'uyap', 'official'))) continue;
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (/serializeOfficialExchange|resolveOfficialRole/.test(code)) {
        offenders.push(path.relative(API_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('runtime XML doğrulaması kendini DOĞRU etiketler (resmî DTD iddiası YOK)', () => {
    const src = fs.readFileSync(path.join(SRC, 'modules/uyap/uyap-xml.service.ts'), 'utf8');
    expect(src).toContain("validationMode: 'LOCAL_STRUCTURAL_PRECHECK'");
    expect(src).toContain('officialDtdValidated: false');
  });
});
