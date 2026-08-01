/**
 * UYAP-OFFICIAL-CODELIST-EMISSION-I01B-1 — codelist emisyonu ve guard'lar
 *
 * ## Artefakt gerçeği (ölçüldü, uydurulmadı)
 *
 * `KodluBilgilerData.xml` (SHA `f9592571…`, 134717 B) **MANIFEST ile birebir eşleşir**
 * → bundle'da drift YOK. Ancak dosya `encoding="ISO-8859-9"` deklare ederken gerçek
 * byte'ları **UTF-8 kodlanmış `U+FFFD`** içerir (`ef bf bd`): etiketlerdeki Türkçe
 * harfler **kaynakta** kaybolmuştur, geri döndürülemez.
 *
 * Sonuç: **kodlar (saf ASCII) güvenilir**, **etiketler artefakttan türetilemez**.
 * Bu yüzden registry her etikete `labelProvenance` iliştirir ve **yalnız
 * `OWNER_RATIFIED` etiket emit edilebilir**. Etiket tahmin/onarım YAPILMAZ.
 *
 * Test matrisi: **CL-01 … CL-25** + **CA-01 … CA-10**.
 */
import * as fs from 'fs';
import * as path from 'path';
import { DebtorRole } from '@prisma/client';
import {
  OFFICIAL_ALACAK_KALEMI_PARENTS,
  OFFICIAL_CODELIST_MAHIYET_KODU_SET,
  OFFICIAL_CODELIST_PROVENANCE,
  OFFICIAL_DTD_MAHIYET_KODU_SET,
  OFFICIAL_MAHIYET_KODU_SET,
  OFFICIAL_ROLE_REGISTRY,
  OFFICIAL_TAKIP_TURU_SET,
  UYAP_OFFICIAL_CODELIST_VERSION,
  checkOfficialRolePair,
  emittableLabel,
  isOfficialRoleId,
  resolveOfficialMahiyetKodu,
  resolveOfficialTakipTuru,
  validateOfficialMahiyetKodu,
  validateOfficialTakipTuru,
} from '../official-codelist-registry';
import type { OfficialCodeResolution } from '../official-codelist-registry';
import { serializeUyapExchangeCanonical } from '../official-canonical-serializer';
import { prepareUyapDormantDispatch } from '../official-dormant-dispatch';
import { resolveOfficialRole } from '../official-role-translator';
import type { OfficialExchangeInput, OfficialTaraf } from '../official-exchange.types';

const API_ROOT = path.resolve(__dirname, '../../../../..');
const OFFICIAL_DIR = path.join(API_ROOT, 'src/modules/uyap/official');
const rel = (p: string) => path.relative(API_ROOT, p).replace(/\\/g, '/');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = (p: string) => stripComments(fs.readFileSync(p, 'utf8'));

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
const OFFICIAL_FILES = walk(OFFICIAL_DIR);

// ---------------------------------------------------------------- fixtures

const taraf = (over: Partial<OfficialTaraf> = {}): OfficialTaraf => ({
  id: 'T1',
  roleResolution: resolveOfficialRole(DebtorRole.ASIL_BORCLU),
  kisi: { adi: 'Ahmet', soyadi: 'Yilmaz' },
  ...over,
});

/**
 * P02B-R2: kodlu-anlam alanları artık ham string DEĞİL, `OfficialCodeResolution`.
 * Testler ratifiye-mapping varmış gibi doğrudan `RESOLVED` kurar — böylece SÖZDİZİM
 * katmanı sınanabilir; ANLAM katmanı `resolveOfficial*` üzerinden ayrıca sınanır.
 */
const resolved = (code: string): OfficialCodeResolution => ({ kind: 'RESOLVED', code });
const notAsserted: OfficialCodeResolution = { kind: 'NOT_ASSERTED' };

const input = (
  taraflar: OfficialTaraf[] = [taraf()],
  dosya: Partial<OfficialExchangeInput['dosya']> = {},
): OfficialExchangeInput => ({
  dosya: {
    dosyaTipi: '1',
    takipTuruResolution: resolveOfficialTakipTuru({ proceedingType: 'GENERAL_EXECUTION' }),
    ...dosya,
  },
  taraflar,
});

// ============================================================================
// CL-01 — provenance
// ============================================================================

describe('CL-01 — official bundle provenance', () => {
  it('artefakt kimliği sabittir ve etiket kaybı AÇIKÇA kayıtlıdır', () => {
    expect(UYAP_OFFICIAL_CODELIST_VERSION).toBe('UYAP-OFFICIAL-CODELIST/v1');
    expect(OFFICIAL_CODELIST_PROVENANCE.sha256).toBe(
      'f95925714428b66eec9b0b29be761e4982fd0a207ae90bff34bbffeaf979ec7c',
    );
    expect(OFFICIAL_CODELIST_PROVENANCE.byteLength).toBe(134717);
    expect(OFFICIAL_CODELIST_PROVENANCE.labelsLossyAtSource).toBe(true);
    expect(OFFICIAL_CODELIST_PROVENANCE.bundleDriftDetected).toBe(false);
  });

  it('resmî rol kümesi 17 rol / rolID 21-71', () => {
    expect(OFFICIAL_ROLE_REGISTRY).toHaveLength(17);
    const ids = OFFICIAL_ROLE_REGISTRY.map((e) => Number(e.rolID));
    expect(Math.min(...ids)).toBe(21);
    expect(Math.max(...ids)).toBe(71);
    expect(new Set(ids).size).toBe(17);
  });

  it('mahiyetKodu: codelist 18, DTD 17, emit edilebilir KESİŞİM 17', () => {
    // P02B-R2 ölçümü: iki resmî artefakt aynı fikirde DEĞİL. `5045` codelist'te var,
    // DTD `ATTLIST dosya` enumerasyonunda yok → fail-closed olarak kesişim alınır.
    expect(OFFICIAL_CODELIST_MAHIYET_KODU_SET.size).toBe(18);
    expect(OFFICIAL_DTD_MAHIYET_KODU_SET.size).toBe(17);
    expect(OFFICIAL_MAHIYET_KODU_SET.size).toBe(17);
    expect(OFFICIAL_CODELIST_MAHIYET_KODU_SET.has('5045')).toBe(true);
    expect(OFFICIAL_DTD_MAHIYET_KODU_SET.has('5045')).toBe(false);
    expect(OFFICIAL_MAHIYET_KODU_SET.has('5045')).toBe(false);
  });

  it('takipTuru 2 kod', () => {
    expect([...OFFICIAL_TAKIP_TURU_SET].sort()).toEqual(['0', '1']);
  });
});

// ============================================================================
// CL-02 … CL-04, CL-11 — rol emisyonu ve etiket sahipliği
// ============================================================================

describe('CL-02/03/04/11 — resolved rol emisyonu ve etiket sahipliği', () => {
  it('CL-02: resolved rol EXACT resmî ID emit eder', () => {
    const r = serializeUyapExchangeCanonical(input());
    expect(r.status).toBe('CANONICAL_BYTES');
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.xml).toContain('22');
    }
  });

  it('CL-03: emit edilebilir etiket REGISTRY den gelir', () => {
    expect(emittableLabel('22')).toBe('BORÇLU/MÜFLİS');
    expect(emittableLabel('33')).toBe('KEFİL');
  });

  it('CL-04: owner-ratified OLMAYAN etiket emit EDİLEMEZ', () => {
    // 15 rol yalnız MANIFEST transkripsiyonu ile bilinir → emit edilemez.
    for (const e of OFFICIAL_ROLE_REGISTRY) {
      if (e.labelProvenance === 'OWNER_RATIFIED') continue;
      expect(emittableLabel(e.rolID)).toBeUndefined();
    }
    const emittable = OFFICIAL_ROLE_REGISTRY.filter(
      (e) => e.labelProvenance === 'OWNER_RATIFIED',
    ).map((e) => e.rolID);
    expect(emittable.sort()).toEqual(['22', '33']);
  });

  it('CL-11: caller etiketi canonical etiketle çelişirse REDDEDİLİR', () => {
    const spoofed = taraf({
      roleResolution: { kind: 'RESOLVED', rolID: '22', rol: 'ALACAKLI' } as any,
    });
    const r = serializeUyapExchangeCanonical(input([spoofed]));

    expect(r.status).toBe('CODELIST_REJECTED');
    if (r.status === 'CODELIST_REJECTED') {
      expect(r.failureCode).toBe('OFFICIAL_CODELIST_LABEL_MISMATCH');
    }
  });

  it('CL-04b: caller resmî ID ye owner-ratified olmayan etiket iliştiremez', () => {
    const spoofed = taraf({
      roleResolution: { kind: 'RESOLVED', rolID: '21', rol: 'ALACAKLI' } as any,
    });
    const r = serializeUyapExchangeCanonical(input([spoofed]));

    expect(r.status).toBe('CODELIST_REJECTED');
    if (r.status === 'CODELIST_REJECTED') {
      expect(r.failureCode).toBe('OFFICIAL_ROLE_AUTHORITY_REQUIRED');
    }
  });
});

// ============================================================================
// CL-05 … CL-10 — fail-closed rol dispozisyonu
// ============================================================================

describe('CL-05/06/07/08 — unresolved roller fail-closed', () => {
  it.each([
    ['CL-05 authority-required', DebtorRole.MIRASCI],
    ['CL-05 authority-required', DebtorRole.TASFIYE_MEMURU],
    ['CL-05 authority-required', DebtorRole.IFLAS_MASASI],
    ['CL-06 unsupported', DebtorRole.KESIDECI],
    ['CL-06 unsupported', DebtorRole.CIRANTA],
    ['CL-06 unsupported', DebtorRole.AVAL],
    ['CL-06 unsupported', DebtorRole.LEHDAR],
    ['CL-06 unsupported', DebtorRole.MUHATAP],
  ])('%s: %s emit EDİLMEZ, byte YOK', (_label, role) => {
    const r = serializeUyapExchangeCanonical(
      input([taraf({ roleResolution: resolveOfficialRole(role) })]),
    );

    expect(r.status).not.toBe('CANONICAL_BYTES');
    expect(r as any).not.toHaveProperty('bytes');
  });

  it('CL-08: bilinmeyen resmî ID reddedilir', () => {
    expect(isOfficialRoleId('99')).toBe(false);
    const check = checkOfficialRolePair('99', 'X');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.failureCode).toBe('OFFICIAL_ROLE_UNRESOLVED');
  });

  it('CL-09: resmî serializer legacy 1-10 kod ÜRETMEZ', () => {
    const r = serializeUyapExchangeCanonical(input());
    expect(r.status).toBe('CANONICAL_BYTES');
    if (r.status === 'CANONICAL_BYTES') {
      // rolTur/rolID attribute'unda 1-10 aralığında bir değer bulunmamalı.
      const roleAttrs = r.xml.match(/rolID="(\d+)"/g) ?? [];
      for (const a of roleAttrs) {
        const n = Number(/\d+/.exec(a)![0]);
        expect(n).toBeGreaterThanOrEqual(21);
        expect(n).toBeLessThanOrEqual(71);
      }
    }
  });

  it('CL-10: emit edilen bütün rolID ler resmî kümededir', () => {
    const r = serializeUyapExchangeCanonical(input([taraf(), taraf({ id: 'T2' })]));
    expect(r.status).toBe('CANONICAL_BYTES');
    if (r.status === 'CANONICAL_BYTES') {
      for (const m of r.xml.matchAll(/rolID="(\d+)"/g)) {
        expect(isOfficialRoleId(m[1])).toBe(true);
      }
    }
  });
});

// ============================================================================
// CL-12 … CL-16 — mahiyetKodu / takipTuru
// ============================================================================

describe('CL-12/13/14/15/16 — kodlu alan doğrulaması', () => {
  it('CL-12: canonical resolver-issued geçerli mahiyetKodu kabul edilir', () => {
    expect(validateOfficialMahiyetKodu('1045').ok).toBe(true);
    const r = serializeUyapExchangeCanonical(
      input([taraf()], {
        takipTuruResolution: resolveOfficialTakipTuru({
          proceedingType: 'JUDGMENT_ENFORCEMENT',
        }),
        mahiyetResolution: resolveOfficialMahiyetKodu({
          caseSubCategory: 'NAFAKA',
          takipTuru: { proceedingType: 'JUDGMENT_ENFORCEMENT' },
          caseJudgmentNafakaType: 'TEDBIR',
        }),
      }),
    );
    expect(r.status).toBe('CANONICAL_BYTES');
  });

  it('CL-13: caller-created mahiyetKodu authority kapısında REDDEDİLİR', () => {
    const r = serializeUyapExchangeCanonical(
      input([taraf()], { mahiyetResolution: resolved('9999') }),
    );
    expect(r.status).toBe('CODELIST_REJECTED');
    if (r.status === 'CODELIST_REJECTED') {
      expect(r.failureCode).toBe('OFFICIAL_MAHIYET_MAPPING_AUTHORITY_REQUIRED');
    }
  });

  it('CL-14: geçerli takipTuru kabul edilir (0=İlamlı, 1=İlamsız)', () => {
    for (const proceedingType of ['JUDGMENT_ENFORCEMENT', 'GENERAL_EXECUTION'] as const) {
      expect(
        serializeUyapExchangeCanonical(
          input([taraf()], {
            takipTuruResolution: resolveOfficialTakipTuru({ proceedingType }),
          }),
        ).status,
      ).toBe('CANONICAL_BYTES');
    }
  });

  it('CL-15: caller-created takipTuru authority kapısında REDDEDİLİR (legacy 2 dahil)', () => {
    // Legacy tip '1'..'6' idi ve 2=İlamlı diyordu; resmî sözlükte 2 YOKTUR.
    for (const v of ['2', '3', '6']) {
      const r = serializeUyapExchangeCanonical(
        input([taraf()], { takipTuruResolution: resolved(v) }),
      );
      expect(r.status).toBe('CODELIST_REJECTED');
      if (r.status === 'CODELIST_REJECTED') {
        expect(r.failureCode).toBe('OFFICIAL_TAKIP_MAPPING_AUTHORITY_REQUIRED');
      }
    }
  });

  it('CL-16: sessiz fallback YOK — boş string ve "0" birbirine dönüşmez', () => {
    expect(validateOfficialTakipTuru('').ok).toBe(false);
    expect(validateOfficialTakipTuru('0').ok).toBe(true);
    expect(validateOfficialMahiyetKodu('').ok).toBe(false);
    // undefined opsiyonel alandır — değer UYDURULMAZ.
    expect(validateOfficialTakipTuru(undefined).ok).toBe(true);
  });
});

// ============================================================================
// CL-17 … CL-21, CL-25 — emisyon bütünlüğü
// ============================================================================

describe('CL-17/18/19/20/21/25 — emisyon bütünlüğü', () => {
  it('CL-17: mapping hatasında kısmi XML/byte YOK', () => {
    const r = serializeUyapExchangeCanonical(
      input([taraf()], { mahiyetResolution: resolved('XXX') }),
    );
    expect(r.status).toBe('CODELIST_REJECTED');
    expect(r as any).not.toHaveProperty('bytes');
    expect(r as any).not.toHaveProperty('xml');
  });

  it('CL-18: registry bağlandıktan sonra byte determinizmi KORUNUR', () => {
    const a = serializeUyapExchangeCanonical(input());
    const b = serializeUyapExchangeCanonical(input());
    expect(a.status).toBe('CANONICAL_BYTES');
    if (a.status === 'CANONICAL_BYTES' && b.status === 'CANONICAL_BYTES') {
      expect(a.bytes.equals(b.bytes)).toBe(true);
      expect(a.evidence.encodedBytesSha256).toBe(b.evidence.encodedBytesSha256);
    }
  });

  it('CL-19: ISO-8859-9 sınırı KORUNUR', () => {
    const r = serializeUyapExchangeCanonical(input());
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.evidence.encoding).toBe('ISO-8859-9');
      expect(r.evidence.declarationMatchesBytes).toBe(true);
      expect(r.evidence.roundTripVerified).toBe(true);
    }
  });

  it('CL-20/21: dormant dispatch — ağ 0, flag OFF; reddedilen girdide byte YOK', () => {
    const ok = prepareUyapDormantDispatch(input());
    expect(ok.status).toBe('DORMANT_PREPARED');
    if (ok.status === 'DORMANT_PREPARED') {
      expect(ok.evidence.networkCallCount).toBe(0);
      expect(ok.evidence.transportPerformed).toBe(false);
      expect(ok.evidence.featureFlagEnabled).toBe(false);
    }

    const bad = prepareUyapDormantDispatch(
      input([taraf()], { takipTuruResolution: resolved('2') }),
    );
    expect(bad.status).toBe('NOT_PREPARED');
    expect(bad as any).not.toHaveProperty('bytes');
  });

  it('CL-25: strict DTD uyum hükmü ÜRETİLMEZ', () => {
    const r = serializeUyapExchangeCanonical(input());
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.evidence.officialDtdValidated).toBe(false);
      expect(r.evidence.officialCodelistConformance).toBe('REGISTRY_VALIDATED');
    }
  });
});

// ============================================================================
// CL-22 / CL-23 — legacy sınırı
// ============================================================================

describe('CL-22/23 — legacy yüzeyler', () => {
  it('CL-22: legacy canlı serializer davranışı DEĞİŞMEDİ (kod 1-10 tablosu yerinde)', () => {
    const legacy = fs.readFileSync(
      path.join(API_ROOT, 'src/modules/uyap/uyap-xml.service.ts'),
      'utf8',
    );
    expect(legacy).toContain('UYAP_ROL_TURLERI');
    expect(legacy).toMatch(/BORCLU:\s*\{\s*kod:\s*'2'/);
  });

  it('CL-23: resmî serializer hattı legacy mapper a BAĞLI DEĞİL', () => {
    for (const f of OFFICIAL_FILES) {
      const c = code(f);
      expect(c).not.toContain('UYAP_ROL_TURLERI');
      expect(c).not.toContain('uyap-xml.service');
      expect(c).not.toContain('uyap-case-mapper');
    }
  });
});

// ============================================================================
// CA-01 … CA-10 — ARCHITECTURE GUARDS
// ============================================================================

describe('CA — architecture guards', () => {
  it('CA-01: TEK canonical codelist registry sahibi', () => {
    const owners = OFFICIAL_FILES.filter((f) =>
      /export const OFFICIAL_ROLE_REGISTRY/.test(code(f)),
    ).map(rel);
    expect(owners).toEqual([
      'src/modules/uyap/official/official-codelist-registry.ts',
    ]);
  });

  it('CA-02/CA-03: resmî ETİKET tek sahiplidir, duplicate sözlük YOK', () => {
    // Resmî etiket metni yalnız registry'de tanımlanabilir. Domain → rolID SEÇİMİ
    // (owner kararı) başka dosyada durabilir; etiketi oradan tekrar yazmak ikinci
    // bir sözlük yaratır ve sürüklenmeye açar.
    const labels = OFFICIAL_ROLE_REGISTRY.map((e) => e.label);
    const carriers = OFFICIAL_FILES.filter((f) => {
      const c = code(f);
      return labels.some((l) => c.includes(`'${l}'`) || c.includes(`"${l}"`));
    }).map(rel);

    expect(carriers).toEqual(['src/modules/uyap/official/official-codelist-registry.ts']);
    // Guard'ın boşa geçmediğinin kanıtı: registry gerçekten TAM tabloyu taşıyor.
    expect(OFFICIAL_ROLE_REGISTRY.length).toBe(17);
  });

  it('CA-03b: resmî rolID literal koleksiyonu yalnız registry ve owner mapping de', () => {
    const officialIds = new Set(OFFICIAL_ROLE_REGISTRY.map((e) => e.rolID));
    const tables = OFFICIAL_FILES.map((f) => {
      const found = new Set<string>();
      for (const m of code(f).matchAll(/['"](\d{2})['"]/g)) {
        if (officialIds.has(m[1])) found.add(m[1]);
      }
      return { file: rel(f), count: found.size };
    })
      .filter((x) => x.count > 1)
      .map((x) => x.file)
      .sort();

    expect(tables).toEqual([
      'src/modules/uyap/official/official-codelist-registry.ts',
      // P03A owner-ratified domain → rolID seçimi (yalnız 22/33). Etiket TAŞIMAZ.
      'src/modules/uyap/official/official-role-translator.ts',
    ]);
  });

  it('CA-03c: translator etiketi REGISTRY den alır, kendi yazmaz', () => {
    const c = code(path.join(OFFICIAL_DIR, 'official-role-translator.ts'));
    expect(c).toContain('emittableLabel');
    // Emit edilemeyen bir rolID için etiket UYDURULMAZ → RESOLVED üretilmez.
    expect(c).toMatch(/if\s*\(!rol\)/);
  });

  it('CA-04/CA-07: canonical serializer magic rolID/etiket TAŞIMAZ', () => {
    const c = code(path.join(OFFICIAL_DIR, 'official-canonical-serializer.ts'));
    expect(c).not.toMatch(/rolID\s*[:=]\s*['"]\d+['"]/);
    expect(c).toContain('checkOfficialRolePair');
  });

  it('CA-08: mahiyetKodu/takipTuru değerleri REGISTRY sahipliğinde', () => {
    const c = code(path.join(OFFICIAL_DIR, 'official-canonical-serializer.ts'));
    expect(c).toContain('validateOfficialMahiyetKodu');
    expect(c).toContain('validateOfficialTakipTuru');

    const registrySrc = code(path.join(OFFICIAL_DIR, 'official-codelist-registry.ts'));
    expect(registrySrc).toContain('OFFICIAL_MAHIYET_KODU_SET');
    expect(registrySrc).toContain('OFFICIAL_TAKIP_TURU_SET');
  });

  it('CA-09: runtime bundle okuma veya ağ indirmesi YOK', () => {
    const c = code(path.join(OFFICIAL_DIR, 'official-codelist-registry.ts'));
    expect(c).not.toContain('UYAP_OFFICIAL_PACKAGE_REVIEW');
    expect(c).not.toMatch(/[A-Za-z]:\\\\?Development/);
    expect(c).not.toMatch(/readFileSync|fetch\(|axios/);
    expect(c).not.toMatch(/process\.env/);
  });

  it('CA-10: registry strict DTD uyum iddiası ÜRETMEZ', () => {
    const c = code(path.join(OFFICIAL_DIR, 'official-codelist-registry.ts'));
    for (const w of ['UYAP_READY', 'SUBMITTABLE', 'OFFICIAL_ACCEPTED', 'VALIDATED_BYTES']) {
      expect(c).not.toContain(w);
    }
  });
});
