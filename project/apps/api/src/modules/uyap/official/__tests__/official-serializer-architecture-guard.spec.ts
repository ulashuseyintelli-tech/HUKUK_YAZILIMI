/**
 * UYAP-OFFICIAL-SERIALIZER-ARCHITECTURE-I01A — mimari guard'lar (SA-01 … SA-08)
 *
 * Serializer sahipliğini kaynak-metin ve import/call-graph seviyesinde kilitler.
 * Yeni bir üretim yolu canonical entrypoint'i atlarsa CI kırmızıya döner.
 *
 * ## Envanter (I01A ölçümü)
 *
 * | Yüzey | Sınıf | Runtime erişimi |
 * |---|---|---|
 * | `uyap/uyap-xml.service.ts` `UyapXmlService` | LEGACY_PRODUCTION | `uyap.controller.ts` (canlı) |
 * | `uyap-export/uyap-xml-builder.service.ts` | LEGACY_PRODUCTION | `uyap-export.service.ts` (canlı) |
 * | `uyap/official/official-canonical-serializer.ts` | **CANONICAL OWNER** | dormant dispatch |
 * | `uyap/official/official-exchange-builder.ts` | DELEGATE (şekil) | canonical owner çağırır |
 * | `uyap/official/official-iso8859-9-encoder.ts` | DELEGATE (byte) | canonical owner çağırır |
 * | `uyap/official/official-dormant-dispatch.ts` | TEST_ONLY | provider kaydı YOK |
 *
 * İki legacy üretim yolu **resmî-şekilli XML üretmez** (legacy/local şekil, kod 1-10,
 * `officialDtdValidated: false`, `contractMode: LEGACY_LOCAL`). Bu görevde birleştirilmezler
 * — legacy→resmî geçiş `rolTur` eşleme kararına (I01B-1 / P03B) bağlıdır. Guard'lar
 * legacy yolların **resmî uyum iddiası üretmemesini** ve resmî hattın **tek sahipli**
 * kalmasını korur.
 */
import * as fs from 'fs';
import * as path from 'path';

const API_ROOT = path.resolve(__dirname, '../../../../..');
const SRC = path.join(API_ROOT, 'src');
const OFFICIAL_DIR = path.join(SRC, 'modules/uyap/official');

const rel = (p: string) => path.relative(API_ROOT, p).replace(/\\/g, '/');

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

const PRODUCTION_FILES = walk(SRC);
const code = (p: string) => stripComments(fs.readFileSync(p, 'utf8'));

/** Resmî (official) hatta ait üretim dosyaları. */
const OFFICIAL_FILES = PRODUCTION_FILES.filter((f) => f.startsWith(OFFICIAL_DIR));

// ============================================================================

describe('SA-01 — tek canonical production serializer sahibi', () => {
  it('resmî byte üretimi TEK dosyada tanımlıdır', () => {
    const owners = OFFICIAL_FILES.filter((f) =>
      /export function serializeUyapExchangeCanonical/.test(code(f)),
    ).map(rel);

    expect(owners).toEqual([
      'src/modules/uyap/official/official-canonical-serializer.ts',
    ]);
  });

  it('encoder YALNIZ canonical sahip tarafından çağrılır', () => {
    const callers = PRODUCTION_FILES.filter(
      (f) =>
        /encodeOfficialExchangeToIso88599\s*\(/.test(code(f)) &&
        !f.endsWith('official-iso8859-9-encoder.ts'),
    ).map(rel);

    expect(callers).toEqual([
      'src/modules/uyap/official/official-canonical-serializer.ts',
    ]);
  });
});

describe('SA-02 — yetkisiz doğrudan XML birleştirme yok', () => {
  it('resmî hatta string concatenation ile XML üretilmez', () => {
    const offenders: string[] = [];
    for (const f of OFFICIAL_FILES) {
      const c = code(f);
      // `'<' + ...` / `` `<${...}` `` gibi elle XML kurma desenleri.
      if (/['"`]\s*<\s*\w+[^'"`]*['"`]\s*\+/.test(c) || /`<\$\{/.test(c)) {
        offenders.push(rel(f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('resmî hat XML şeklini YALNIZ builder üzerinden kurar', () => {
    const builderUsers = OFFICIAL_FILES.filter((f) =>
      /from 'xmlbuilder2'/.test(code(f)),
    ).map(rel);

    expect(builderUsers).toEqual([
      'src/modules/uyap/official/official-exchange-builder.ts',
    ]);
  });
});

describe('SA-03 — alternatif üretim yolları delege eder veya allowlisted', () => {
  /**
   * Legacy iki yol resmî hattın DIŞINDADIR ve resmî uyum iddia ETMEZ. Allowlist
   * DAR ve dosya-bazlıdır (klasör allowlist'i KULLANILMAZ).
   */
  const LEGACY_ALLOWLIST = [
    'src/modules/uyap/uyap-xml.service.ts',
    'src/modules/uyap-export/uyap-xml-builder.service.ts',
  ];

  it('xmlbuilder2 kullanan UYAP üretim dosyaları tam olarak bilinen kümedir', () => {
    const users = PRODUCTION_FILES.filter(
      (f) => /from 'xmlbuilder2'/.test(code(f)) && /modules[\\/]uyap/.test(f),
    ).map(rel);

    expect(users.sort()).toEqual(
      [
        ...LEGACY_ALLOWLIST,
        'src/modules/uyap/official/official-exchange-builder.ts',
      ].sort(),
    );
  });

  it('legacy yollar resmî uyum İDDİA ETMEZ', () => {
    for (const p of LEGACY_ALLOWLIST) {
      const c = fs.readFileSync(path.join(API_ROOT, p), 'utf8');
      expect(c).not.toMatch(/officialDtdValidated\s*:\s*true/);
      expect(c).not.toMatch(/officialContractCompliant\s*:\s*true/);
    }
  });
});

describe('SA-04 — encoding dönüşümü yalnız canonical sınırda', () => {
  it('ISO-8859-9 dönüşümü TEK dosyada yapılır', () => {
    const encoders = PRODUCTION_FILES.filter((f) => {
      const c = code(f);
      return /iconv/.test(c) && /modules[\\/]uyap/.test(f);
    }).map(rel);

    expect(encoders).toEqual([
      'src/modules/uyap/official/official-iso8859-9-encoder.ts',
    ]);
  });
});

describe('SA-05 — deklarasyon ve byte encoding eşleşmesi zorunlu', () => {
  it('canonical sahip declarationMatchesBytes kanıtı ÜRETİR', () => {
    const c = code(path.join(OFFICIAL_DIR, 'official-canonical-serializer.ts'));
    expect(c).toContain('declarationMatchesBytes');
  });

  it('encoder deklarasyon uyumsuzluğunu REDDEDER', () => {
    const c = code(path.join(OFFICIAL_DIR, 'official-iso8859-9-encoder.ts'));
    expect(c).toContain('DECLARATION_MISMATCH');
  });
});

describe('SA-06 — dormant dispatch canonical serializer kullanır', () => {
  it('dispatch canonical entrypoint i çağırır, kendi XML ini kurmaz', () => {
    const c = code(path.join(OFFICIAL_DIR, 'official-dormant-dispatch.ts'));

    expect(c).toContain('serializeUyapExchangeCanonical');
    expect(c).not.toMatch(/from 'xmlbuilder2'/);
    expect(c).not.toMatch(/iconv/);
  });
});

describe('SA-07 — transport yokluğu korunur', () => {
  it('resmî hatta ağ istemcisi YOK', () => {
    const offenders: string[] = [];
    for (const f of OFFICIAL_FILES) {
      const c = code(f);
      if (/\b(fetch|axios|node-fetch|got|superagent)\b/.test(c)) offenders.push(rel(f));
      if (/from\s+['"](http|https|net|tls)['"]/.test(c)) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });

  it('dormant dispatch flag i FINAL OFF olarak sabittir', () => {
    const c = code(path.join(OFFICIAL_DIR, 'official-dormant-dispatch.ts'));
    expect(c).toMatch(/UYAP_DORMANT_DISPATCH_ENABLED\s*=\s*false as const/);
    // env'den okuma YOK.
    expect(c).not.toMatch(/process\.env/);
  });

  it('resmî hat UyapModule tarafından provider olarak KAYDEDİLMEZ', () => {
    const moduleSrc = code(path.join(SRC, 'modules/uyap/uyap.module.ts'));
    for (const sym of [
      'serializeUyapExchangeCanonical',
      'prepareUyapDormantDispatch',
      'OfficialCanonicalSerializer',
    ]) {
      expect(moduleSrc).not.toContain(sym);
    }
  });
});

describe('SA-08 — I01A resmî uyum hükmü ÜRETEMEZ', () => {
  it('yasaklı statü adları resmî hatta HİÇ geçmez', () => {
    const forbidden = [
      'UYAP_READY',
      'SUBMITTABLE',
      'OFFICIAL_ACCEPTED',
      'VALIDATED_BYTES',
    ];
    const offenders: string[] = [];
    for (const f of OFFICIAL_FILES) {
      const c = code(f);
      for (const w of forbidden) if (c.includes(w)) offenders.push(`${rel(f)}:${w}`);
    }
    expect(offenders).toEqual([]);
  });

  it('canonical sahip officialDtdValidated=false taşır ve strict DTD hükmü ÜRETMEZ', () => {
    const c = code(path.join(OFFICIAL_DIR, 'official-canonical-serializer.ts'));
    expect(c).toMatch(/officialDtdValidated:\s*false/);
    // I01B-1: codelist alanı `NOT_CLOSED` → `REGISTRY_VALIDATED` oldu (kodlu alanlar artık
    // canonical registry'ye karşı doğrulanıyor). Bu guard'ın KONUSU değişmedi: strict
    // **DTD** uyum hükmü hâlâ üretilmez ve yasak statü adları geçmez.
    expect(c).toContain("officialCodelistConformance: 'REGISTRY_VALIDATED'");
    for (const forbidden of ['UYAP_READY', 'SUBMITTABLE', 'OFFICIAL_ACCEPTED', 'VALIDATED_BYTES']) {
      expect(c).not.toContain(forbidden);
    }
  });
});
