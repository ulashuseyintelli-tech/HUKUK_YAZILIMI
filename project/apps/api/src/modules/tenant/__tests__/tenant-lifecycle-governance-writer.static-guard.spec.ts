/**
 * C15-S1-MODIFIED PR-3 — GOVERNANCE-WRITER ENVANTER KAPISI (AST + TypeChecker).
 *
 * AMAÇ
 * -----
 * Beş governance alanı BİRLİKTE korunur:
 *   lifecycle · lifecycleTarget · lifecycleChangedAt · lifecycleReason · quiesceToken
 *
 * PR-3 sonunda bu alanların TEK yazarı transition servisidir. Kapı iki yüzeyi birden
 * kilitler:
 *   (a) Prisma yazma metotları (create/createMany/update/updateMany/upsert) üzerinden
 *       Tenant governance alanı yazan call-site kümesi,
 *   (b) raw SQL ($executeRaw/$executeRawUnsafe/$queryRaw/$queryRawUnsafe) üzerinden
 *       "Tenant" tablosuna governance alanı yazan ifade kümesi.
 * (a) için onaylı envanter BOŞTUR (servis raw SQL kullanır); (b) için onaylı envanter
 * TEK dosyadır: transition servisi. Nedeni: `lifecycleChangedAt = clock_timestamp()`
 * zorunludur ve Prisma `data` nesnesinde SQL fonksiyonu ifade edilemez — CAS update
 * raw SQL olmak ZORUNDADIR. "Raw SQL governance yazımı 0" hükmü bu tek onaylı yazar
 * DIŞINDA 0 olarak uygulanır; yönetilmeyen raw yazım sıfırdır.
 *
 * FAIL-CLOSED
 * -----------
 * - Tenant yazma çağrısının veri nesnesi spread/computed-property içeriyorsa veya
 *   nesne literali değilse (identifier, çağrı sonucu): governance yazamadığı statik
 *   olarak KANITLANAMAZ -> governance yazarı SAYILIR -> envanterde yoksa kapı düşer.
 * - Sembolü çözülemeyen (`as any`) yazma çağrılarında alıcı alt-ağacında `tenant`
 *   adı varsa Tenant yazarı sayılır (PR-2 R2 kalıbı); kalanlar tavanlı envanterdedir.
 * - tsconfig/program/sözdizimi hatası, Prisma client çözümsüzlüğü -> kapı düşer.
 *
 * Yöntem PR-2 reçetesidir: iki fazlı program (OOM önlemi), declaration provenance
 * (`typeToString()` metin karşılaştırması KULLANILMAZ), negatif fixture'lar tek sanal
 * dosyada ve ana programdan ÖNCE koşulur.
 */

import { readFileSync, readdirSync } from "fs";
import * as path from "path";
import * as ts from "typescript";

const API_ROOT = path.resolve(__dirname, "../../../..").replace(/\\/g, "/");
const SCAN_ROOTS = ["src/modules", "src/scripts"] as const;

const WRITE_METHODS: ReadonlySet<string> = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
]);

const GOVERNANCE_FIELDS: ReadonlySet<string> = new Set([
  "lifecycle",
  "lifecycleTarget",
  "lifecycleChangedAt",
  "lifecycleReason",
  "quiesceToken",
]);

const TENANT_DELEGATE_INTERFACE = "TenantDelegate";
const PRISMA_CLIENT_DECL = /[/](\.prisma[/]client|@prisma[/]client)[/]/;

/** (a) Prisma yazma yüzeyi: onaylı governance yazarı YOK — servis raw SQL kullanır. */
const ONAYLI_PRISMA_GOVERNANCE_YAZARLARI: readonly string[] = [];

/** (b) Raw SQL yüzeyi: TEK onaylı yazar. */
const ONAYLI_RAW_GOVERNANCE_YAZARLARI: readonly string[] = [
  "src/modules/tenant/tenant-lifecycle-transition.service.ts",
];

/** Sembolü çözülemeyen Tenant-dışı yazma çağrıları için tavan (PR-2 kalıbı). */
const COZULEMEYEN_YAZMA_TAVANI = 250;

// ---------------------------------------------------------------------------
// AST yardımcıları
// ---------------------------------------------------------------------------

function cagriMetodAdi(call: ts.CallExpression): string | null {
  const e = call.expression;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isElementAccessExpression(e)) {
    const arg = e.argumentExpression;
    return arg && ts.isStringLiteralLike(arg) ? arg.text : "<computed>";
  }
  if (ts.isIdentifier(e)) return e.text;
  return null;
}

function sembolHedefi(call: ts.CallExpression): ts.Node {
  const e = call.expression;
  if (ts.isPropertyAccessExpression(e)) return e.name;
  if (ts.isElementAccessExpression(e)) return e.argumentExpression ?? e;
  return e;
}

function aliciIfadesi(call: ts.CallExpression): ts.Node {
  const e = call.expression;
  if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) return e.expression;
  return e;
}

function unwrap(n: ts.Expression): ts.Expression {
  let cur = n;
  while (
    ts.isParenthesizedExpression(cur) ||
    ts.isAsExpression(cur) ||
    ts.isNonNullExpression(cur) ||
    ts.isSatisfiesExpression(cur)
  ) {
    cur = cur.expression;
  }
  return cur;
}

function tenantDelegateBildirimi(sym: ts.Symbol): boolean {
  for (const decl of sym.getDeclarations() ?? []) {
    const owner = decl.parent;
    if (!owner || !ts.isInterfaceDeclaration(owner)) continue;
    if (owner.name.text !== TENANT_DELEGATE_INTERFACE) continue;
    if (PRISMA_CLIENT_DECL.test(decl.getSourceFile().fileName.replace(/\\/g, "/"))) return true;
  }
  return false;
}

function aliciAltAgacindaTenant(node: ts.Node): boolean {
  let bulundu = false;
  const visit = (n: ts.Node): void => {
    if (bulundu) return;
    if ((ts.isIdentifier(n) || ts.isStringLiteralLike(n)) && n.text === "tenant") bulundu = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return bulundu;
}

/** Veri nesnesi incelemesi: hangi governance alanları yazılıyor; statik analiz edilebilir mi. */
function veriNesnesiIncele(node: ts.Expression | null): { gov: string[]; dinamik: boolean } {
  if (!node) return { gov: [], dinamik: true };
  const u = unwrap(node);
  if (!ts.isObjectLiteralExpression(u)) return { gov: [], dinamik: true };
  const gov: string[] = [];
  let dinamik = false;
  for (const p of u.properties) {
    if (ts.isSpreadAssignment(p)) {
      dinamik = true;
      continue;
    }
    const nm = p.name;
    if (!nm || ts.isComputedPropertyName(nm)) {
      dinamik = true;
      continue;
    }
    const key = ts.isIdentifier(nm) || ts.isStringLiteralLike(nm) ? nm.text : null;
    if (key === null) {
      dinamik = true;
      continue;
    }
    if (GOVERNANCE_FIELDS.has(key)) gov.push(key);
  }
  return { gov, dinamik };
}

/** Yazma çağrısının incelenecek veri ifadeleri: data | create | update (upsert her ikisi). */
function veriIfadeleri(call: ts.CallExpression): (ts.Expression | null)[] {
  const arg = call.arguments[0] ? unwrap(call.arguments[0]) : null;
  if (!arg || !ts.isObjectLiteralExpression(arg)) return [null];
  const out: ts.Expression[] = [];
  for (const p of arg.properties) {
    if (
      ts.isPropertyAssignment(p) &&
      p.name &&
      ts.isIdentifier(p.name) &&
      ["data", "create", "update"].includes(p.name.text)
    ) {
      out.push(p.initializer);
    }
  }
  return out.length > 0 ? out : [null];
}

// ---------------------------------------------------------------------------
// Çözümleme
// ---------------------------------------------------------------------------

interface CozumlemeSonucu {
  readonly incelenenYazma: number;
  readonly tenantYazmaSayisi: number;
  /** Governance alanı yazan VEYA fail-closed dinamik sayılan Tenant yazma dosyaları. */
  readonly prismaGovernanceYazarlari: readonly string[];
  readonly cozulemeyenYazma: readonly string[];
  readonly sozdizimHatasi: readonly string[];
}

function cozumle(
  program: ts.Program,
  checker: ts.TypeChecker,
  taranacak: ReadonlySet<string>,
  kok: string,
): CozumlemeSonucu {
  const prismaGovernanceYazarlari: string[] = [];
  const cozulemeyenYazma: string[] = [];
  const sozdizimHatasi: string[] = [];
  let incelenenYazma = 0;
  let tenantYazmaSayisi = 0;

  for (const sf of program.getSourceFiles()) {
    const norm = sf.fileName.replace(/\\/g, "/");
    if (!taranacak.has(norm)) continue;
    const rel = path.relative(kok, sf.fileName).replace(/\\/g, "/");

    if (program.getSyntacticDiagnostics(sf).length > 0) {
      sozdizimHatasi.push(rel);
      continue;
    }

    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const ad = cagriMetodAdi(n);
        if (ad !== null && ad !== "<computed>" && WRITE_METHODS.has(ad)) {
          incelenenYazma++;
          const sym = checker.getSymbolAtLocation(sembolHedefi(n));
          let tenantYazmasi = false;
          if (sym) {
            tenantYazmasi = tenantDelegateBildirimi(sym);
          } else if (aliciAltAgacindaTenant(aliciIfadesi(n))) {
            // R2 fail-closed: tip silinmiş ama alıcıda `tenant` adı var.
            tenantYazmasi = true;
          } else {
            cozulemeyenYazma.push(rel);
          }
          if (tenantYazmasi) {
            tenantYazmaSayisi++;
            for (const veri of veriIfadeleri(n)) {
              const { gov, dinamik } = veriNesnesiIncele(veri);
              // FAIL-CLOSED: governance alanı yazan VEYA statik analiz edilemeyen
              // veri nesnesi governance yazarı sayılır.
              if (gov.length > 0 || dinamik) prismaGovernanceYazarlari.push(rel);
            }
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }

  return {
    incelenenYazma,
    tenantYazmaSayisi,
    prismaGovernanceYazarlari,
    cozulemeyenYazma,
    sozdizimHatasi,
  };
}

// ---------------------------------------------------------------------------
// Raw SQL yüzeyi — metin tabanlı, dosya düzeyi (bilinçli olarak geniş ağ)
// ---------------------------------------------------------------------------

interface RawBulgu {
  readonly dosya: string;
  readonly satir: number;
}

/**
 * Raw SQL çağrısı içeren VE governance alanına atama (`"alan" =` / `alan =`) İÇEREN
 * template literal'leri bulur. Ağ bilinçli olarak geniştir: SELECT içinde geçse bile
 * yakalar; onaylı envanter dışındaki HER eşleşme kapıyı düşürür ve insan kararına
 * zorlar (fail-closed: kaçırmaktansa yanlış-pozitif tercih edilir).
 */
function rawGovernanceYazarlari(dosyalar: readonly string[], kok: string): RawBulgu[] {
  const RAW_CALL = /\$(executeRaw|executeRawUnsafe|queryRaw|queryRawUnsafe)/;
  const RAW_METHOD = /^(\$?)(executeRaw|executeRawUnsafe|queryRaw|queryRawUnsafe)$/;
  const GOV_SET = /"?(lifecycle|lifecycleTarget|lifecycleChangedAt|lifecycleReason|quiesceToken)"?\s*=/;
  const bulgular: RawBulgu[] = [];
  for (const f of dosyalar) {
    const icerik = readFileSync(f, "utf8");
    if (!RAW_CALL.test(icerik)) continue;
    const sf = ts.createSourceFile(f, icerik, ts.ScriptTarget.ES2020, true);
    const rel = path.relative(kok, f).replace(/\\/g, "/");
    const kaydet = (n: ts.Node, metin: string): void => {
      if (GOV_SET.test(metin) && /Tenant/.test(metin)) {
        bulgular.push({ dosya: rel, satir: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1 });
      }
    };
    const visit = (n: ts.Node): void => {
      // Fonksiyon çağrısı biçimi: prisma.$executeRawUnsafe("UPDATE ...")
      if (ts.isCallExpression(n)) {
        const ad = cagriMetodAdi(n);
        if (ad !== null && RAW_METHOD.test(ad)) kaydet(n, n.getText());
      }
      // Tagged template biçimi: tx.$queryRaw`UPDATE ...` — CallExpression DEĞİLDİR;
      // ilk sürümde bu kör noktaydı ve kapının kendi ölçümüyle yakalandı.
      if (ts.isTaggedTemplateExpression(n)) {
        const tag = n.tag;
        const ad = ts.isPropertyAccessExpression(tag) ? tag.name.text : ts.isIdentifier(tag) ? tag.text : null;
        if (ad !== null && RAW_METHOD.test(ad)) kaydet(n, n.getText());
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return bulgular;
}

// ---------------------------------------------------------------------------
// FAZ 1 — checker'sız aday tespiti (PR-2 OOM önlemi)
// ---------------------------------------------------------------------------

function kapsamdakiDosyalar(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name).replace(/\\/g, "/");
      if (e.isDirectory()) {
        if (/node_modules|[/]dist$|__tests__|[/]generated$/.test(p)) continue;
        walk(p);
      } else if (/\.ts$/.test(p) && !/\.spec\.ts$|\.d\.ts$/.test(p)) {
        out.push(p);
      }
    }
  };
  for (const r of SCAN_ROOTS) walk(path.join(API_ROOT, r));
  return out;
}

function adayDosyalar(dosyalar: readonly string[]): string[] {
  const aday: string[] = [];
  for (const f of dosyalar) {
    const sf = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.ES2020, true);
    let has = false;
    const visit = (n: ts.Node): void => {
      if (has) return;
      if (ts.isCallExpression(n)) {
        const ad = cagriMetodAdi(n);
        if (ad === "<computed>" || (ad !== null && WRITE_METHODS.has(ad))) has = true;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    if (has) aday.push(f);
  }
  return aday;
}

// ---------------------------------------------------------------------------
// NEGATİF FIXTURE'LAR — tek sanal dosya, ana programdan ÖNCE
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path
  .join(API_ROOT, "src", "__governance_writer_fixture__.ts")
  .replace(/\\/g, "/");

const FIXTURE_SRC = [
  'import { PrismaClient } from "@prisma/client";',
  "declare const p: PrismaClient;",
  "declare const dis: Record<string, unknown>;",
  "// G1 DIRECT — governance alanı yazan update: YAKALANMALI",
  'export const a = async () => p.tenant.update({ where: { id: "x" }, data: { lifecycle: "ACTIVE" } });',
  "// G2 CREATE — create ile governance yazımı: YAKALANMALI",
  'export const b = async () => p.tenant.create({ data: { name: "n", slug: "s", quiesceToken: "t" } });',
  "// G3 SPREAD — fail-closed dinamik veri: YAKALANMALI",
  'export const c = async () => p.tenant.update({ where: { id: "x" }, data: { ...dis } });',
  "// G4 UPSERT — update kolunda governance: YAKALANMALI",
  "export const d = async () =>",
  '  p.tenant.upsert({ where: { id: "x" }, create: { name: "n", slug: "s" }, update: { lifecycleReason: "r" } });',
  "// G5 TEMİZ — governance alanı YOK: yakalanMAMALI",
  'export const e = async () => p.tenant.update({ where: { id: "x" }, data: { name: "yeni" } });',
  "// G6 İLGİSİZ MODEL — user üzerinde lifecycle benzeri alan yok, yakalanMAMALI",
  'export const f = async () => p.user.update({ where: { id: "x" }, data: { name: "u" } });',
  "// G7 ANY-CAST tenant — R2 fail-closed + spread: YAKALANMALI",
  "export const g = async () => (p as any).tenant.update({ where: { id: 1 }, data: dis });",
].join("\n");

function fixtureCozumle(options: ts.CompilerOptions): CozumlemeSonucu {
  const host = ts.createCompilerHost(options, true);
  const origGet = host.getSourceFile.bind(host);
  const origRead = host.readFile.bind(host);
  const origExists = host.fileExists.bind(host);
  const sanal = ts.createSourceFile(FIXTURE_PATH, FIXTURE_SRC, ts.ScriptTarget.ES2020, true);
  host.getSourceFile = (f, lv, oe, sn) =>
    f.replace(/\\/g, "/") === FIXTURE_PATH ? sanal : origGet(f, lv, oe, sn);
  host.readFile = (f) => (f.replace(/\\/g, "/") === FIXTURE_PATH ? FIXTURE_SRC : origRead(f));
  host.fileExists = (f) => f.replace(/\\/g, "/") === FIXTURE_PATH || origExists(f);
  const program = ts.createProgram({ rootNames: [FIXTURE_PATH], options, host });
  return cozumle(program, program.getTypeChecker(), new Set([FIXTURE_PATH]), API_ROOT);
}

// ---------------------------------------------------------------------------

describe("C15-S1-MODIFIED PR-3 — governance-writer envanter kapısı (AST/TypeChecker)", () => {
  let sonuc: CozumlemeSonucu;
  let fixture: CozumlemeSonucu;
  let rawBulgular: RawBulgu[];
  let kapsamSayisi = 0;
  let adaySayisi = 0;
  let prismaCozuldu = false;

  beforeAll(() => {
    const cfg = ts.readConfigFile(path.join(API_ROOT, "tsconfig.json"), ts.sys.readFile);
    if (cfg.error) throw new Error("FAIL-CLOSED: tsconfig.json okunamadı");
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, API_ROOT);
    if (parsed.errors.length > 0) throw new Error("FAIL-CLOSED: tsconfig.json ayrıştırılamadı");
    const options: ts.CompilerOptions = { ...parsed.options, noEmit: true, skipLibCheck: true };

    fixture = fixtureCozumle(options); // ÖNCE — iki büyük program aynı anda yaşamasın

    const kapsam = kapsamdakiDosyalar();
    kapsamSayisi = kapsam.length;
    if (kapsamSayisi === 0) throw new Error("FAIL-CLOSED: kapsamda dosya yok");
    const aday = adayDosyalar(kapsam);
    adaySayisi = aday.length;
    if (adaySayisi === 0) throw new Error("FAIL-CLOSED: aday dosya yok — faz 1 bozuk");

    const program = ts.createProgram({ rootNames: aday, options });
    const checker = program.getTypeChecker();

    prismaCozuldu = program
      .getSourceFiles()
      .some(
        (sf) =>
          PRISMA_CLIENT_DECL.test(sf.fileName.replace(/\\/g, "/")) &&
          sf.text.includes(`interface ${TENANT_DELEGATE_INTERFACE}`),
      );
    if (!prismaCozuldu) throw new Error("FAIL-CLOSED: Prisma client / TenantDelegate çözülemedi");

    sonuc = cozumle(program, checker, new Set(aday), API_ROOT);
    rawBulgular = rawGovernanceYazarlari(kapsam, API_ROOT);
  }, 600_000);

  // -- kurulum bütünlüğü ----------------------------------------------------

  it("faz 1 doludur; Prisma client çözüldü; sözdizimi hatası yok; anlamlı yazma incelendi", () => {
    expect(kapsamSayisi).toBeGreaterThan(100);
    expect(adaySayisi).toBeGreaterThan(0);
    expect(prismaCozuldu).toBe(true);
    expect(sonuc.sozdizimHatasi).toEqual([]);
    expect(sonuc.incelenenYazma).toBeGreaterThan(500);
  });

  // -- negatif fixture'lar --------------------------------------------------

  describe("kaçış senaryoları gerçekten yakalanıyor", () => {
    it("G1 direct + G2 create + G4 upsert-update governance yazarı olarak yakalanır", () => {
      // G1,G2,G3,G4,G7 -> 5 yakalama beklenir (G5/G6 temiz).
      expect(fixture.prismaGovernanceYazarlari).toHaveLength(5);
    });

    it("G3 spread ve G7 any-cast+dinamik veri FAIL-CLOSED yakalanır", () => {
      // Fixture'da 6 tenant yazması var (G1..G5,G7); G6 user'dır.
      expect(fixture.tenantYazmaSayisi).toBe(6);
      // G5 (temiz data) governance yazarı DEĞİL: 6 - 5 = 1 temiz tenant yazması.
    });

    it("G5 temiz veri ve G6 ilgisiz model governance yazarı SAYILMAZ", () => {
      // 5 yakalama, 6 tenant yazması, 7 toplam yazma çağrısı -> G5 ve G6 dışarıda.
      expect(fixture.incelenenYazma).toBe(7);
    });
  });

  // -- üretim envanteri ------------------------------------------------------

  describe("üretim kodunda governance yazarı kümesi kapalıdır", () => {
    it("(a) Prisma yüzeyinde governance yazarı onaylı envanterle TAM eşleşir (BOŞ)", () => {
      expect([...new Set(sonuc.prismaGovernanceYazarlari)].sort()).toEqual(
        [...ONAYLI_PRISMA_GOVERNANCE_YAZARLARI].sort(),
      );
    });

    it("(b) raw SQL yüzeyinde governance yazan dosya kümesi TAM olarak transition servisidir", () => {
      const dosyalar = [...new Set(rawBulgular.map((b) => b.dosya))].sort();
      expect(dosyalar).toEqual([...ONAYLI_RAW_GOVERNANCE_YAZARLARI].sort());
      // Onaylı dosyada tam 1 yazma ifadesi (CAS UPDATE) beklenir.
      expect(rawBulgular).toHaveLength(1);
    });

    it("toplam governance yazarı (Prisma ∪ raw) TAM 1 dosyadır", () => {
      const hepsi = new Set([
        ...sonuc.prismaGovernanceYazarlari,
        ...rawBulgular.map((b) => b.dosya),
      ]);
      expect([...hepsi]).toEqual(["src/modules/tenant/tenant-lifecycle-transition.service.ts"]);
    });

    it("çözülemeyen yazma çağrıları tavanı aşmaz (sessiz atlama yok)", () => {
      expect(sonuc.cozulemeyenYazma.length).toBeLessThanOrEqual(COZULEMEYEN_YAZMA_TAVANI);
    });
  });

  // -- servis kaynağının yapısal sabitleri ----------------------------------

  describe("transition servisi kaynak sabitleri", () => {
    const SERVIS = path.join(API_ROOT, "src/modules/tenant/tenant-lifecycle-transition.service.ts");
    let kaynak: string;
    beforeAll(() => {
      kaynak = readFileSync(SERVIS, "utf8");
    });

    it("önsöz sabiti: SET LOCAL lock_timeout, kilitten ÖNCE ve veri ifadesi araya girmeden", () => {
      const setIdx = kaynak.indexOf("SET LOCAL lock_timeout");
      const lockIdx = kaynak.indexOf("pg_advisory_xact_lock");
      const selectIdx = kaynak.indexOf("tenant.findUnique");
      expect(setIdx).toBeGreaterThan(-1);
      expect(lockIdx).toBeGreaterThan(setIdx);
      expect(selectIdx).toBeGreaterThan(lockIdx);
      // Aradaki bölgede başka DB ifadesi yok: SET..lock arası UPDATE/INSERT/SELECT içermez.
      const ara = kaynak.slice(setIdx, lockIdx);
      expect(ara).not.toMatch(/UPDATE|INSERT|findUnique|findMany|findFirst/);
    });

    it("CAS sabiti: WHERE id + mevcut lifecycle ve clock_timestamp birlikte", () => {
      expect(kaynak).toContain('AND "lifecycle" = CAST(');
      expect(kaynak).toContain("clock_timestamp()");
      expect(kaynak).toContain('RETURNING "lifecycleChangedAt"');
    });

    it("audit sabiti: logInTransaction KULLANILIR, yutan log() KULLANILMAZ, retry döngüsü YOK", () => {
      expect(kaynak).toContain("logInTransaction");
      // `.log(` çağrısı yok (logInTransaction hariç):
      expect(kaynak.replace(/logInTransaction/g, "")).not.toMatch(/\baudit\.log\(/);
      // Döngü/retry sözdizimi yok (tek deneme sözleşmesi):
      expect(kaynak).not.toMatch(/\bfor\s*\(|\bwhile\s*\(|retryCount|maxRetries|attempt/i);
    });

    it("withheld kontrolü tablo kontrolünden ÖNCE gelir (koşulsuzluk sırası)", () => {
      const withheldIdx = kaynak.indexOf("isWithheldSafetyCriticalEdge(from, to)");
      const tabloIdx = kaynak.indexOf("canTransitionLifecycle(from, to)");
      expect(withheldIdx).toBeGreaterThan(-1);
      expect(tabloIdx).toBeGreaterThan(withheldIdx);
    });

    it("quiesceToken hiçbir karar dalında OKUNMAZ (kanıt olarak yorumlanamaz)", () => {
      // Token yalnız ÜRETİLİR ve CAS parametresi olarak YAZILIR; `tenant.quiesceToken`
      // okuması veya token'a bağlı if/karşılaştırma yoktur.
      expect(kaynak).not.toMatch(/tenant\.quiesceToken|input\.quiesceToken|quiesceToken\s*[=!]==?/);
    });
  });

  // -- sıfır üretim call-site + sıfır DI kaydı ------------------------------

  describe("transition servisi tüketicisiz teslim edilir (PR-1 kalıbı)", () => {
    it("üretim kodunda TenantLifecycleTransitionService referansı yalnız kendi dosyasındadır", () => {
      // DI kaydı da dahil: PR-3'te servis HİÇBİR modüle kaydedilmez ve hiçbir üretim
      // dosyası import etmez. İlk kayıt/tüketici PR-4'te, kanıt sınıfıyla birlikte gelir.
      const kapsam = kapsamdakiDosyalar();
      const referansVeren: string[] = [];
      for (const f of kapsam) {
        if (f.endsWith("tenant-lifecycle-transition.service.ts")) continue;
        if (readFileSync(f, "utf8").includes("TenantLifecycleTransitionService")) {
          referansVeren.push(path.relative(API_ROOT, f).replace(/\\/g, "/"));
        }
      }
      expect(referansVeren).toEqual([]);
    });
  });
});
