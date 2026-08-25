/**
 * C15-S1-MODIFIED PR-2 — Tenant enumeration ENVANTER KAPISI (AST + TypeChecker).
 *
 * AMAÇ
 * -----
 * PR-2, üç worker'ın tenant enumeration sorgusuna `lifecycle: ACTIVE` yüklemini
 * ekledi. Bu kapı, o üç yamanın TEK TEK doğru olduğunu değil, `prisma.tenant`
 * üzerinden enumeration yapan call-site KÜMESİNİN kapalı ve bilinen olduğunu
 * korur. Yeni bir tenant enumeration eklenirse — hangi sözdizimiyle olursa olsun —
 * bu kapı CI'da DÜŞER ve yazarı sınıflandırmaya zorlar.
 *
 * NEDEN REGEX DEĞİL
 * -----------------
 * Owner şartı: alias/helper kaçışının yakalandığı iddia edilecekse kanıt
 * AST/symbol tabanlı olmalıdır. `const d = prisma.tenant; d.findMany()` veya
 * yüklemi bir yardımcı fonksiyona taşımak, `prisma.tenant.findMany` metnini
 * kaynaktan tamamen SİLER; metin araması bunu göremez. Bu kapı bunun yerine
 * çağrılan metodun SEMBOLÜNÜ çözer ve sembolün Prisma `TenantDelegate` arayüzü
 * içinde, generated client dosyasında bildirildiğini doğrular
 * (= declaration provenance). Alias, destructuring, element access ve
 * helper-taşıma bu yolla aynı sembole indirgenir.
 *
 * İKİ KURAL
 * ---------
 *   R1 (checker):  metod sembolü çözülür -> bildirim ebeveyni `TenantDelegate`
 *                  arayüzü VE bildirim dosyası generated Prisma client ise
 *                  tenant call-site'tır. Yalnız `typeToString()` metin
 *                  karşılaştırmasına GÜVENİLMEZ.
 *   R2 (fallback): sembol çözülemezse (repoda yaygın olan `(prisma as any).x`
 *                  kalıbı) çağrının ALICI ALT-AĞACINDA `tenant` adı geçiyorsa
 *                  FAIL-CLOSED biçimde tenant call-site sayılır. Geçmiyorsa
 *                  sessizce atlanmaz; SINIRLI bir "çözülemeyen" envanterine
 *                  yazılır ve tavanı aşarsa kapı düşer.
 *
 * FAIL-CLOSED KAPSAMI VE DÜRÜST SINIRI
 * ------------------------------------
 * Düşürülen durumlar: tsconfig okunamaz/ayrıştırılamaz, program kurulamaz,
 * taranan bir dosyada SÖZDİZİMİ hatası, Prisma generated client çözülemedi,
 * envanter dışı tenant call-site, envanter dışı computed metod erişimi,
 * çözülemeyen çağrı tavanının aşılması.
 *
 * SINIR (dürüst beyan): repo genelinde SEMANTİK diagnostic SIFIR DEĞİLDİR;
 * `tsconfig.json` baseline'ı bilinen biçimde kırıktır. Bu yüzden kapı
 * "sıfır semantik hata" iddiasında BULUNMAZ. Bunun yerine ihtiyaç duyduğu
 * çözümlemenin gerçekten yapıldığını hedefli biçimde kanıtlar: Prisma
 * `TenantDelegate` bildirimi programda bulunmalı ve negatif fixture'ların
 * her biri gerçekten yakalanmalıdır. Çözülemeyen her çağrı ayrıca sayılır.
 *
 * KİMLİK SATIR NUMARASINA BAĞLI DEĞİLDİR
 * --------------------------------------
 * Envanter anahtarı `repo-göreli dosya :: çözülmüş sembol` biçimindedir.
 * Dosya içinde satır kaydırmak kapıyı düşürmez; yeni bir call-site eklemek düşürür.
 */

import { readFileSync, readdirSync } from "fs";
import * as path from "path";
import * as ts from "typescript";

/** `apps/api` kökü. Bu dosya `src/modules/tenant/__tests__/` altındadır. */
const API_ROOT = path.resolve(__dirname, "../../../..").replace(/\\/g, "/");

/** Owner şartı: tarama YALNIZ bu iki kök altında yapılır. */
const SCAN_ROOTS = ["src/modules", "src/scripts"] as const;

/** Tenant ENUMERATION anlamına gelen Prisma metotları. */
const ENUMERATION_METHODS: ReadonlySet<string> = new Set(["findMany", "findFirst"]);

const TENANT_DELEGATE_INTERFACE = "TenantDelegate";

/** Bildirimin generated Prisma client'a ait olduğunu kanıtlayan dosya deseni. */
const PRISMA_CLIENT_DECL = /[/](\.prisma[/]client|@prisma[/]client)[/]/;

// ---------------------------------------------------------------------------
// ONAYLI ENVANTER
// ---------------------------------------------------------------------------

type Sinif = "ACTIVE_SCOPED" | "NON_WORKER_JUSTIFIED";

interface EnvanterKaydi {
  readonly dosya: string;
  readonly sembol: string;
  readonly sinif: Sinif;
  readonly gerekce: string;
}

/**
 * Beş call-site, TAM sınıflandırma ile.
 *
 * ACTIVE_SCOPED        : zamanlayıcı ile tetiklenen worker; enumeration
 *                        sorgusunun KENDİSİ `lifecycle: ACTIVE` taşır.
 * NON_WORKER_JUSTIFIED : zamanlayıcı yoktur; operatör tarafından açıkça
 *                        çağrılan tek seferlik script'tir. Otomatik tur
 *                        üretmediği için yüklem eklenmesi gerekmez.
 */
const ONAYLI_ENVANTER: readonly EnvanterKaydi[] = [
  {
    dosya: "src/modules/escalation/operational-escalation.service.ts",
    sembol: "TenantDelegate.findMany",
    sinif: "ACTIVE_SCOPED",
    gerekce: "@Cron ile tetiklenen eskalasyon turu; ACTIVE_TENANT_WHERE query-level uygulanır.",
  },
  {
    dosya: "src/modules/escalation/case-task-escalation.service.ts",
    sembol: "TenantDelegate.findMany",
    sinif: "ACTIVE_SCOPED",
    gerekce: "@Cron ile tetiklenen görev eskalasyonu; ACTIVE_TENANT_WHERE query-level uygulanır.",
  },
  {
    dosya: "src/modules/greeting/greeting.service.ts",
    sembol: "TenantDelegate.findMany",
    sinif: "ACTIVE_SCOPED",
    gerekce: "@Cron ile tetiklenen selamlama turu; ACTIVE_TENANT_WHERE query-level uygulanır.",
  },
  {
    dosya: "src/scripts/office-cap02-identity-binding-dry-run.ts",
    sembol: "TenantDelegate.findMany",
    sinif: "NON_WORKER_JUSTIFIED",
    gerekce:
      "explicit operator invocation — zamanlayıcı yok, salt-okuma dry-run; " +
      "yalnız operatör çalıştırdığında tüm tenant'lar üzerinde rapor üretir.",
  },
  {
    dosya: "src/scripts/office-cap02-identity-binding-invite-issue.ts",
    sembol: "TenantDelegate.findMany",
    sinif: "NON_WORKER_JUSTIFIED",
    gerekce:
      "explicit operator invocation — zamanlayıcı yok; davet üretimi yalnız " +
      "operatör tarafından açıkça başlatılır, otomatik tur DEĞİLDİR.",
  },
];

/**
 * Computed metod erişimi (`obj[degisken]()`) için statik olarak "bu `findMany`
 * değildir" kanıtlanamaz; bu yüzden ayrı ve SINIRLI bir envanterde tutulur.
 * Yenisi eklenirse kapı düşer ve yazarı sınıflandırmaya zorlar.
 */
const ONAYLI_COMPUTED: readonly { readonly dosya: string; readonly gerekce: string }[] = [
  {
    dosya: "src/modules/calc-preview/diagnostics/diagnostics-audit.service.ts",
    gerekce:
      "NON_PRISMA — `this.logger[logLevel](...)`; alıcı NestJS Logger'dır, " +
      "Prisma delegate DEĞİLDİR, dolayısıyla tenant enumeration üretemez.",
  },
];

/**
 * `(prisma as any).<model>` kalıbı repoda yaygındır; bu çağrılarda sembol
 * çözülemez. Sessizce atlanMAZlar: sayılır ve TAVANLA sınırlanır. Tavanın
 * altına inmek (tip düzeltmek) serbesttir; ÜSTÜNE çıkmak kapıyı düşürür.
 */
const COZULEMEYEN_CAGRI_TAVANI = 213;
const COZULEMEYEN_DOSYA_TAVANI = 53;

// ---------------------------------------------------------------------------
// AST yardımcıları
// ---------------------------------------------------------------------------

/** Çağrılan metodun YAZILI adı. Computed erişimde `<computed>` döner. */
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

/** Sembol çözümü için hedef düğüm (property adı / string literal / identifier). */
function sembolHedefi(call: ts.CallExpression): ts.Node {
  const e = call.expression;
  if (ts.isPropertyAccessExpression(e)) return e.name;
  if (ts.isElementAccessExpression(e)) return e.argumentExpression ?? e;
  return e;
}

/** Metod çağrısının alıcı ifadesi. */
function aliciIfadesi(call: ts.CallExpression): ts.Node {
  const e = call.expression;
  if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) return e.expression;
  return e;
}

/**
 * R1 — declaration provenance. Sembolün bildirimlerinden HERHANGİ BİRİ
 * generated Prisma client içindeki `TenantDelegate` arayüzüne aitse true.
 * `typeToString()` metin karşılaştırması KULLANILMAZ.
 */
function tenantDelegateBildirimi(sym: ts.Symbol): boolean {
  for (const decl of sym.getDeclarations() ?? []) {
    const owner = decl.parent;
    if (!owner || !ts.isInterfaceDeclaration(owner)) continue;
    if (owner.name.text !== TENANT_DELEGATE_INTERFACE) continue;
    const declFile = decl.getSourceFile().fileName.replace(/\\/g, "/");
    if (PRISMA_CLIENT_DECL.test(declFile)) return true;
  }
  return false;
}

/**
 * R2 — fail-closed sözdizimi ağı. Alıcı ALT-AĞACINDA `tenant` adı (identifier
 * veya string literal) geçiyorsa tenant call-site kabul edilir. `as any` ile
 * tip bilgisi silinmiş çağrıların gözden kaçmasını engeller.
 */
function aliciAltAgacindaTenant(node: ts.Node): boolean {
  let bulundu = false;
  const visit = (n: ts.Node): void => {
    if (bulundu) return;
    if (ts.isIdentifier(n) && n.text === "tenant") bulundu = true;
    else if (ts.isStringLiteralLike(n) && n.text === "tenant") bulundu = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return bulundu;
}

// ---------------------------------------------------------------------------
// Çözümleme
// ---------------------------------------------------------------------------

interface Bulgu {
  readonly dosya: string;
  readonly sembol: string;
  readonly yol: "CHECKER" | "FALLBACK";
}

interface CozumlemeSonucu {
  readonly incelenen: number;
  readonly tenantCagrilari: readonly Bulgu[];
  readonly computedDosyalari: readonly string[];
  readonly cozulemeyen: readonly string[];
  readonly sozdizimHatasiOlanDosyalar: readonly string[];
}

function cozumle(
  program: ts.Program,
  checker: ts.TypeChecker,
  taranacak: ReadonlySet<string>,
  kok: string,
): CozumlemeSonucu {
  const tenantCagrilari: Bulgu[] = [];
  const computedDosyalari: string[] = [];
  const cozulemeyen: string[] = [];
  const sozdizimHatasiOlanDosyalar: string[] = [];
  let incelenen = 0;

  for (const sf of program.getSourceFiles()) {
    const norm = sf.fileName.replace(/\\/g, "/");
    if (!taranacak.has(norm)) continue;
    const rel = path.relative(kok, sf.fileName).replace(/\\/g, "/");

    // FAIL-CLOSED: ayrıştırılamayan dosya sessizce atlanamaz.
    if (program.getSyntacticDiagnostics(sf).length > 0) {
      sozdizimHatasiOlanDosyalar.push(rel);
      continue;
    }

    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const ad = cagriMetodAdi(n);
        if (ad === "<computed>") {
          computedDosyalari.push(rel);
        } else if (ad !== null && ENUMERATION_METHODS.has(ad)) {
          incelenen++;
          const sym = checker.getSymbolAtLocation(sembolHedefi(n));
          if (sym) {
            if (tenantDelegateBildirimi(sym)) {
              tenantCagrilari.push({
                dosya: rel,
                sembol: `${TENANT_DELEGATE_INTERFACE}.${sym.getName()}`,
                yol: "CHECKER",
              });
            }
          } else if (aliciAltAgacindaTenant(aliciIfadesi(n))) {
            tenantCagrilari.push({
              dosya: rel,
              sembol: `${TENANT_DELEGATE_INTERFACE}.${ad}`,
              yol: "FALLBACK",
            });
          } else {
            cozulemeyen.push(rel);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }

  return { incelenen, tenantCagrilari, computedDosyalari, cozulemeyen, sozdizimHatasiOlanDosyalar };
}

// ---------------------------------------------------------------------------
// FAZ 1 — checker YOK, aday dosya tespiti
// ---------------------------------------------------------------------------

/**
 * Kapsamdaki HER `.ts` dosyası AST ile ayrıştırılır ve enumeration çağrısı
 * (veya computed erişim) içerenler "aday" seçilir. Bu bir daraltma DEĞİL,
 * bellek önlemidir: bir metod çağrısı ancak adı kaynakta yazılıysa vardır;
 * adı çalışma zamanında hesaplananlar `<computed>` olarak zaten aday sayılır.
 * Faz 2 programı yalnız adaylara köklenir, böylece 2400+ dosyalık programın
 * bellek maliyeti ödenmez.
 */
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
        if (ad === "<computed>" || (ad !== null && ENUMERATION_METHODS.has(ad))) has = true;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    if (has) aday.push(f);
  }
  return aday;
}

// ---------------------------------------------------------------------------
// NEGATİF FIXTURE'LAR — kapının gerçekten yakaladığının kanıtı
// ---------------------------------------------------------------------------

/**
 * Tek sanal dosya, TEK program. Amaç: kaçış sözdizimlerinin her birinin
 * yakalandığını ve ilgisiz bir delegate'in yakalanMADIĞINI kanıtlamak.
 * Dosya API_ROOT altında konumlandırılır ki `@prisma/client` çözülebilsin;
 * diske YAZILMAZ, yalnız derleyici host'una overlay edilir.
 */
const FIXTURE_PATH = path.join(API_ROOT, "src", "__lifecycle_guard_fixture__.ts").replace(/\\/g, "/");

const FIXTURE_SRC = [
  'import { PrismaClient } from "@prisma/client";',
  "declare const p: PrismaClient;",
  "// DIRECT",
  "export const a = async () => p.tenant.findMany();",
  "// ALIAS",
  "export const b = async () => { const d = p.tenant; return d.findMany(); };",
  "// DESTRUCTURING",
  "export const c = async () => { const { tenant } = p; return tenant.findMany(); };",
  "// ELEMENT ACCESS",
  'export const d = async () => p["tenant"].findMany();',
  "// HELPER MOVE",
  'const h = async (x: PrismaClient["tenant"]) => x.findMany();',
  "export const e = async () => h(p.tenant);",
  "// ANY-CAST — R2 fallback ile yakalanmalı",
  "export const f = async () => (p as any).tenant.findMany();",
  "// İLGİSİZ — yakalanMAMALI",
  "export const g = async () => p.user.findMany();",
  "// İLGİSİZ any-cast — çözülemeyene düşmeli, tenant DEĞİL",
  "export const i = async () => (p as any).user.findMany();",
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

describe("C15-S1-MODIFIED PR-2 — tenant enumeration envanter kapısı (AST/TypeChecker)", () => {
  let sonuc: CozumlemeSonucu;
  let fixture: CozumlemeSonucu;
  let kapsamSayisi = 0;
  let adaySayisi = 0;
  let prismaCozuldu = false;

  beforeAll(() => {
    const cfgPath = path.join(API_ROOT, "tsconfig.json");
    const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
    if (cfg.error) throw new Error("FAIL-CLOSED: tsconfig.json okunamadı");
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, API_ROOT);
    if (parsed.errors.length > 0) throw new Error("FAIL-CLOSED: tsconfig.json ayrıştırılamadı");
    const options: ts.CompilerOptions = { ...parsed.options, noEmit: true, skipLibCheck: true };

    // Fixture ÖNCE koşar ve referansı bırakılır; iki büyük program aynı anda
    // bellekte yaşamaz (jest --runInBand ana process'te çalışır).
    fixture = fixtureCozumle(options);

    const kapsam = kapsamdakiDosyalar();
    kapsamSayisi = kapsam.length;
    if (kapsamSayisi === 0) throw new Error("FAIL-CLOSED: kapsamda taranacak dosya yok");
    const aday = adayDosyalar(kapsam);
    adaySayisi = aday.length;
    if (adaySayisi === 0) throw new Error("FAIL-CLOSED: aday dosya yok — faz 1 bozuk");

    const program = ts.createProgram({ rootNames: aday, options });
    const checker = program.getTypeChecker();

    // FAIL-CLOSED: Prisma generated client programda çözülmediyse hiçbir
    // provenance iddiası yapılamaz.
    prismaCozuldu = program
      .getSourceFiles()
      .some(
        (sf) =>
          PRISMA_CLIENT_DECL.test(sf.fileName.replace(/\\/g, "/")) &&
          sf.text.includes(`interface ${TENANT_DELEGATE_INTERFACE}`),
      );
    if (!prismaCozuldu) {
      throw new Error("FAIL-CLOSED: Prisma generated client / TenantDelegate programda çözülemedi");
    }

    sonuc = cozumle(program, checker, new Set(aday), API_ROOT);
  }, 600_000);

  // -- kurulum bütünlüğü ----------------------------------------------------

  it("faz 1 kapsamı doludur ve aday kümesi kapsamın alt kümesidir", () => {
    expect(kapsamSayisi).toBeGreaterThan(100);
    expect(adaySayisi).toBeGreaterThan(0);
    expect(adaySayisi).toBeLessThanOrEqual(kapsamSayisi);
  });

  it("Prisma generated client programda GERÇEKTEN çözüldü", () => {
    expect(prismaCozuldu).toBe(true);
  });

  it("taranan dosyaların hiçbirinde sözdizimi hatası yoktur (fail-closed)", () => {
    expect(sonuc.sozdizimHatasiOlanDosyalar).toEqual([]);
  });

  it("anlamlı sayıda enumeration çağrısı incelendi (kapı boşa çalışmıyor)", () => {
    expect(sonuc.incelenen).toBeGreaterThan(500);
  });

  // -- negatif fixture'lar --------------------------------------------------

  describe("kaçış sözdizimleri gerçekten yakalanıyor", () => {
    it("direct / alias / destructuring / element-access / helper-move CHECKER ile yakalanır", () => {
      const checkerIle = fixture.tenantCagrilari.filter((b) => b.yol === "CHECKER");
      expect(checkerIle).toHaveLength(5);
      for (const b of checkerIle) expect(b.sembol).toBe("TenantDelegate.findMany");
    });

    it("any-cast edilmiş tenant çağrısı R2 fallback ile yakalanır", () => {
      const fallback = fixture.tenantCagrilari.filter((b) => b.yol === "FALLBACK");
      expect(fallback).toHaveLength(1);
    });

    it("ilgisiz delegate (user) tenant sayılMAZ; any-cast hâli çözülemeyene düşer", () => {
      expect(fixture.tenantCagrilari).toHaveLength(6);
      expect(fixture.cozulemeyen).toHaveLength(1);
    });
  });

  // -- envanterin kendisi ---------------------------------------------------

  describe("üretim kodundaki tenant enumeration kümesi kapalıdır", () => {
    const anahtar = (dosya: string, sembol: string): string => `${dosya}::${sembol}`;

    it("bulunan call-site kümesi onaylı envanterle TAM eşleşir", () => {
      const bulunan = [...new Set(sonuc.tenantCagrilari.map((b) => anahtar(b.dosya, b.sembol)))].sort();
      const onayli = [...new Set(ONAYLI_ENVANTER.map((k) => anahtar(k.dosya, k.sembol)))].sort();
      expect(bulunan).toEqual(onayli);
    });

    it("beş call-site'ın tamamı CHECKER provenance ile çözüldü (fallback'e düşen yok)", () => {
      expect(sonuc.tenantCagrilari).toHaveLength(5);
      expect(sonuc.tenantCagrilari.every((b) => b.yol === "CHECKER")).toBe(true);
    });

    it("üç worker ACTIVE_SCOPED, iki script NON_WORKER_JUSTIFIED olarak sınıflandırıldı", () => {
      const say = (s: Sinif): number => ONAYLI_ENVANTER.filter((k) => k.sinif === s).length;
      expect(say("ACTIVE_SCOPED")).toBe(3);
      expect(say("NON_WORKER_JUSTIFIED")).toBe(2);
      expect(ONAYLI_ENVANTER).toHaveLength(5);
    });

    it("her envanter kaydının gerekçesi boş değildir", () => {
      for (const k of ONAYLI_ENVANTER) expect(k.gerekce.length).toBeGreaterThan(20);
    });
  });

  // -- sessiz atlama yok ----------------------------------------------------

  describe("çözülemeyen ve computed çağrılar sessizce atlanmaz", () => {
    it("computed metod erişimleri onaylı envanterle sınırlıdır", () => {
      const bulunan = [...new Set(sonuc.computedDosyalari)].sort();
      const onayli = [...new Set(ONAYLI_COMPUTED.map((k) => k.dosya))].sort();
      expect(bulunan).toEqual(onayli);
    });

    it("çözülemeyen çağrı ve dosya sayısı tavanı aşmaz", () => {
      expect(sonuc.cozulemeyen.length).toBeLessThanOrEqual(COZULEMEYEN_CAGRI_TAVANI);
      expect(new Set(sonuc.cozulemeyen).size).toBeLessThanOrEqual(COZULEMEYEN_DOSYA_TAVANI);
    });

    it("çözülemeyen kümede `tenant` adlı alıcı BULUNAMAZ (aksi hâlde R2 yakalardı)", () => {
      // R2 fail-closed olduğu için `tenant` adı taşıyan hiçbir çağrı çözülemeyene
      // düşemez; üretim kodunda fallback'e düşen call-site olmaması bunu sabitler.
      expect(sonuc.tenantCagrilari.filter((b) => b.yol === "FALLBACK")).toHaveLength(0);
    });
  });
});
