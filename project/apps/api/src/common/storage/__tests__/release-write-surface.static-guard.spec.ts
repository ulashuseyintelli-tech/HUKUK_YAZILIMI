/**
 * C37-EXTERNAL-RUNTIME-STORAGE — RELEASE-KOKU YAZIM YUZEYI STATIK KAPISI (AST).
 *
 * Neden regex DEGIL: `const d = process.cwd(); const p = join(d, 'x');
 * writeFileSync(p, ...)` zincirinde `writeFileSync(process.cwd()...)` metni
 * kaynakta HIC gecmez. Kapi bunun yerine yazma API'sinin yol argumanini AST
 * uzerinde cozer ve ayni kapsamdaki yerel tanimlar boyunca `process.cwd()` /
 * `__dirname` turevini takip eder.
 *
 * Iki bolum:
 *   (A) ENVANTER: C37-R05'te olculen 10 yazim yuzeyinin disposition'i pinlenir.
 *       Bir yuzey sessizce geri gelirse veya disposition kaybolursa kapi duser.
 *   (B) TARAMA : runtime kaynagindaki TUM yazma cagrilarinin yol argumani
 *       release-gorece (cwd/__dirname) turev TASIMAMALIDIR.
 *
 * DB GEREKMEZ.
 */
import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

const API_SRC = path.resolve(__dirname, "..", "..", "..");
const WEB_ROOT = path.resolve(API_SRC, "..", "..", "web");

/** Yol uretimi release-gorece olursa release koku ICINE yazilir. */
const RELEASE_RELATIVE_ROOTS = ["process.cwd()", "__dirname"];

/** Diske yazan / yaratan / silen API adlari. */
const WRITE_APIS = new Set([
  "writeFileSync", "writeFile",
  "appendFileSync", "appendFile",
  "createWriteStream",
  "mkdirSync", "mkdir", "mkdtempSync", "mkdtemp",
  "unlinkSync", "unlink",
  "rmSync", "rmdirSync", "rmdir",
  "renameSync", "rename",
  "copyFileSync", "copyFile",
  "truncateSync",
  "outputFileSync", "outputFile",
  "ensureDirSync", "ensureDir",
]);

/** Runtime yuzeyi disi: test, one-off script, tip tanimi. */
function isRuntimeSource(file: string): boolean {
  const rel = path.relative(API_SRC, file).split(path.sep).join("/");
  if (rel.startsWith("..")) return false;
  if (rel.endsWith(".d.ts")) return false;
  if (rel.includes("__tests__/")) return false;
  if (rel.endsWith(".spec.ts")) return false;
  if (rel.startsWith("scripts/")) return false;
  return rel.endsWith(".ts");
}

function collectRuntimeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      collectRuntimeFiles(full, out);
    } else if (entry.isFile() && isRuntimeSource(full)) {
      out.push(full);
    }
  }
  return out;
}

interface Finding {
  file: string;
  line: number;
  api: string;
  expression: string;
}

/**
 * `node` ifadesi release-gorece bir tabandan mi turuyor?
 * Yerel `const`/`let` tanimlari `locals` uzerinden transitif olarak izlenir.
 */
function derivesFromReleaseRoot(
  node: ts.Node,
  locals: Map<string, ts.Expression>,
  seen: Set<string> = new Set(),
): boolean {
  const text = node.getText();
  for (const root of RELEASE_RELATIVE_ROOTS) {
    if (text.includes(root)) return true;
  }
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n)) {
      const name = n.text;
      if (!seen.has(name) && locals.has(name)) {
        seen.add(name);
        if (derivesFromReleaseRoot(locals.get(name)!, locals, seen)) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  if (ts.isIdentifier(node)) {
    const name = node.text;
    if (!seen.has(name) && locals.has(name)) {
      seen.add(name);
      if (derivesFromReleaseRoot(locals.get(name)!, locals, seen)) return true;
    }
  }
  return found;
}

function scanFile(file: string): Finding[] {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const locals = new Map<string, ts.Expression>();
  const findings: Finding[] = [];

  // 1. gecis: dosya genelindeki degisken tanimlarini topla (kapsam-uzeri
  //    yaklasim BILEREK genistir — yanlis NEGATIF uretmemek icin).
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      locals.set(n.name.text, n.initializer);
    }
    if (ts.isPropertyDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      locals.set(`this.${n.name.text}`, n.initializer);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  // 2. gecis: yazma cagrilarini bul, yol argumanini degerlendir.
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      let apiName: string | undefined;
      if (ts.isIdentifier(n.expression)) apiName = n.expression.text;
      else if (ts.isPropertyAccessExpression(n.expression)) apiName = n.expression.name.text;

      if (apiName && WRITE_APIS.has(apiName) && n.arguments.length > 0) {
        const arg = n.arguments[0];
        if (derivesFromReleaseRoot(arg, locals)) {
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
          findings.push({
            file: path.relative(API_SRC, file).split(path.sep).join("/"),
            line: line + 1,
            api: apiName,
            expression: arg.getText().replace(/\s+/g, " ").slice(0, 120),
          });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return findings;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(API_SRC, rel), "utf8");
}

// =============================================================================
// (A) ENVANTER — C37-R05'te olculen 10 yuzeyin disposition pini
// =============================================================================
describe("C37 — yazim yuzeyi envanteri (10/10 disposition)", () => {
  it("W-01 poa.service: POA_UPLOADS kovasi + containment; cwd yol uretimi YOK", () => {
    const src = read("modules/poa/poa.service.ts");
    expect(src).toContain('this.storage.filePath("POA_UPLOADS"');
    expect(src).toContain('this.storage.assertContained("POA_UPLOADS"');
    expect(src).not.toContain('path.join(process.cwd(), "data"');
  });

  it("W-02 portal.controller: PORTAL_DOCUMENTS kovasi TENANT bazli; cwd YOK", () => {
    const src = read("modules/portal/portal.controller.ts");
    expect(src).toContain('bucketDir(\n        "PORTAL_DOCUMENTS",');
    expect(src).toContain('req?.portalUser?.tenantId');
    expect(src).toContain('assertContained(');
    expect(src).not.toContain('join(process.cwd(), "data", "portal-documents")');
  });

  it("W-03 tariff.service: TARIFFS kovasi; atomik yazim + kilit; cwd YOK", () => {
    const src = read("modules/tariff/tariff.service.ts");
    expect(src).toContain("this.storage.bucketDir('TARIFFS')");
    expect(src).toContain("this.storage.filePath('TARIFFS'");
    expect(src).toContain("acquireTariffLock");
    expect(src).toContain("atomicWriteFile");
    expect(src).not.toContain("path.join(process.cwd(), 'src/config/tariffs')");
  });

  it("W-04 ocr.service: cachePath dis kok + cacheMethod 'read' + fail-closed model kontrolu", () => {
    const src = read("modules/ocr/ocr.service.ts");
    expect(src).toContain("assertOcrModelsPresent(OCR_TESSERACT_LANGS)");
    expect(src).toContain("cachePath: this.storage.ocrModelsRoot");
    expect(src).toContain('cacheMethod: "read"');
    // Yazan cache modlari ASLA kullanilmamalidir.
    expect(src).not.toContain('cacheMethod: "write"');
    expect(src).not.toContain('cacheMethod: "refresh"');
  });

  it("W-05/W-06 next.config: image optimizer KAPALI; release-koku cache yazimi yok", () => {
    const cfg = fs.readFileSync(path.join(WEB_ROOT, "next.config.js"), "utf8");
    expect(cfg).toMatch(/images:\s*\{\s*unoptimized:\s*true\s*,?\s*\}/);
    expect(cfg).not.toMatch(/formats\s*:/);
    expect(cfg).not.toMatch(/minimumCacheTTL/);
    // cacheHandler eklenirse hedefi dis kok olmalidir; release-gorece yol YASAK.
    if (/cacheHandler/.test(cfg)) {
      expect(cfg).toMatch(/HUKUK_DATA_ROOT/);
      expect(cfg).not.toMatch(/__dirname|process\.cwd\(\)/);
    }
  });

  it("W-07/W-08 OCR gecici dosyalari release DISI (os.tmpdir) kalir", () => {
    const ocr = read("modules/ocr/ocr.service.ts");
    const poppler = read("modules/ocr/poppler-page-renderer.js".replace(/\.js$/, ".ts"));
    expect(ocr).toContain("os.tmpdir()");
    expect(poppler).toContain("os.tmpdir()");
    // Gecici yol uretiminde cwd kullanilmamalidir.
    expect(poppler).not.toContain("process.cwd()");
  });

  it("W-09 uygulama ici dosya-logger YOKTUR (stdout only)", () => {
    const files = collectRuntimeFiles(API_SRC);
    const offenders = files.filter((f) => {
      const t = fs.readFileSync(f, "utf8");
      return /transports\.File|createLogger\s*\(|file-stream-rotator/.test(t);
    });
    expect(offenders.map((f) => path.relative(API_SRC, f))).toEqual([]);
  });

  it("W-10 updateGolden production'da YAPISAL OLARAK KAPALI", () => {
    const src = read("modules/icrabot/v28-engine/scenario-harness.service.ts");
    const idx = src.indexOf("async updateGolden(");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 1200);
    expect(body).toMatch(/NODE_ENV === 'production'/);
    expect(body).toMatch(/throw new Error\(/);
    // Guard, ilk yazimdan ONCE gelmelidir.
    expect(body.indexOf("NODE_ENV === 'production'")).toBeLessThan(body.indexOf("writeFileSync"));
  });
});

// =============================================================================
// (B) TARAMA — runtime kaynaginda release-gorece yazim SIFIR
// =============================================================================
describe("C37 — release-gorece yazim taramasi", () => {
  const files = collectRuntimeFiles(API_SRC);

  it("runtime kaynagi taranabiliyor (kapi bos kume uzerinde yesil vermez)", () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it("release-gorece (cwd/__dirname) yol ile yazma cagrisi = 0", () => {
    const findings = files.flatMap(scanFile);
    const rendered = findings.map((f) => `${f.file}:${f.line} ${f.api}(${f.expression})`);
    expect(rendered).toEqual([]);
  });

  it("NEGATIF KONTROL: kapi gercekten yakaliyor (sentetik ihlal)", () => {
    const tmp = path.join(API_SRC, "common", "storage", "__tests__", ".c37-guard-probe.ts");
    fs.writeFileSync(
      tmp,
      [
        "import * as fs from 'fs';",
        "import * as path from 'path';",
        "const base = process.cwd();",
        "const dir = path.join(base, 'data', 'x');",
        "export function boom() { fs.writeFileSync(path.join(dir, 'y.txt'), 'z'); }",
        "",
      ].join("\n"),
      "utf8",
    );
    try {
      const findings = scanFile(tmp);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].api).toBe("writeFileSync");
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it("NEGATIF KONTROL: temiz kod yanlis alarm URETMEZ", () => {
    const tmp = path.join(API_SRC, "common", "storage", "__tests__", ".c37-guard-clean.ts");
    fs.writeFileSync(
      tmp,
      [
        "import * as fs from 'fs';",
        "declare const storage: { filePath(b: string, n: string): string };",
        "export function ok() { fs.writeFileSync(storage.filePath('TARIFFS', 'a.yaml'), 'z'); }",
        "",
      ].join("\n"),
      "utf8",
    );
    try {
      expect(scanFile(tmp)).toEqual([]);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
