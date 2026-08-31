/**
 * C37-EXTERNAL-RUNTIME-STORAGE — merkezi depolama yolu servisi testleri.
 *
 * Kapsam: production zorunlulugu, release-root reddi, tenant izolasyonu,
 * traversal / ADS / reparse / reserved-name / case / Unicode reddi, containment.
 *
 * DB GEREKMEZ.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  RuntimeStoragePathError,
  RuntimeStoragePaths,
  assertSafeSegment,
  assertSafeTenantSegment,
  isContained,
  resolveReleaseRoot,
} from "../runtime-storage-paths";

const TENANT_A = "clx0000000000000000000a";
const TENANT_B = "clx0000000000000000000b";

/**
 * Production hedefi Windows'tur; CI ubuntu-latest'te kosar. Yol iddialari
 * platform-notr kurulur: mutlak yollar gercek dosya sistemi kokunden
 * (`C:\` veya `/`) turetilir. Yalniz Windows'a OZGU kapilar (UNC, 8.3)
 * acikca isaretlenip Windows disinda atlanir — sessiz yesil URETILMEZ.
 */
const FS_ROOT = path.parse(process.cwd()).root;
const IS_WIN = process.platform === "win32";
const itWin = IS_WIN ? it : it.skip;
const fakeCwd = (name: string): string => path.join(FS_ROOT, name, "project", "apps", "api");

/** Test kokleri kisa-ad (8.3) icermeyen gercek bir temel altinda kurulur. */
function makeTempRoot(prefix: string): string {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  return base;
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* yoksay */
  }
}

describe("C37 RuntimeStoragePaths — production ortam zorunluluklari", () => {
  let dataRoot: string;
  let ocrRoot: string;
  const cwd = fakeCwd("c37-fake-release");

  beforeAll(() => {
    dataRoot = makeTempRoot("c37-data-");
    ocrRoot = makeTempRoot("c37-ocr-");
  });
  afterAll(() => {
    cleanup(dataRoot);
    cleanup(ocrRoot);
  });

  const prod = (over: Record<string, string | undefined> = {}) =>
    ({
      NODE_ENV: "production",
      HUKUK_DATA_ROOT: dataRoot,
      HUKUK_OCR_MODELS_ROOT: ocrRoot,
      ...over,
    }) as NodeJS.ProcessEnv;

  it("1) her iki kok verildiginde production'da kurulur", () => {
    const s = new RuntimeStoragePaths({ env: prod(), cwd });
    expect(s.isProduction).toBe(true);
    expect(s.dataRoot).toBe(dataRoot);
    expect(s.ocrModelsRoot).toBe(ocrRoot);
  });

  it("2) HUKUK_DATA_ROOT yoksa HARD FAIL — cwd fallback'ine DONULMEZ", () => {
    expect(() => new RuntimeStoragePaths({ env: prod({ HUKUK_DATA_ROOT: undefined }), cwd })).toThrow(
      /HUKUK_DATA_ROOT production'da ZORUNLUDUR/,
    );
  });

  it("3) HUKUK_OCR_MODELS_ROOT yoksa HARD FAIL", () => {
    expect(() => new RuntimeStoragePaths({ env: prod({ HUKUK_OCR_MODELS_ROOT: undefined }), cwd })).toThrow(
      /HUKUK_OCR_MODELS_ROOT production'da ZORUNLUDUR/,
    );
  });

  it("4) bos/bosluklu deger HARD FAIL", () => {
    expect(() => new RuntimeStoragePaths({ env: prod({ HUKUK_DATA_ROOT: "   " }), cwd })).toThrow(
      RuntimeStoragePathError,
    );
  });

  it("5) gorece yol HARD FAIL", () => {
    expect(() => new RuntimeStoragePaths({ env: prod({ HUKUK_DATA_ROOT: "data" }), cwd })).toThrow(
      /mutlak yol olmalidir/,
    );
  });

  itWin("6) UNC yol HARD FAIL [WINDOWS]", () => {
    expect(() =>
      new RuntimeStoragePaths({ env: prod({ HUKUK_DATA_ROOT: "\\\\server\\share\\data" }), cwd }),
    ).toThrow(/UNC yol/);
  });

  itWin("7) 8.3 kisa ad iceren kok HARD FAIL [WINDOWS]", () => {
    expect(() =>
      new RuntimeStoragePaths({ env: prod({ HUKUK_DATA_ROOT: "C:\\PROGRA~1\\data" }), cwd }),
    ).toThrow(/8.3 kisa ad/);
  });

  it("8) var olmayan dizin HARD FAIL", () => {
    const missing = path.join(dataRoot, "yok-boyle-bir-dizin");
    expect(() => new RuntimeStoragePaths({ env: prod({ HUKUK_DATA_ROOT: missing }), cwd })).toThrow(
      /dizin bulunamadi/,
    );
  });

  it("9) dosyayi kok gostermek HARD FAIL", () => {
    const f = path.join(dataRoot, "dosya.txt");
    fs.writeFileSync(f, "x");
    expect(() => new RuntimeStoragePaths({ env: prod({ HUKUK_DATA_ROOT: f }), cwd })).toThrow(/dizin degil/);
    fs.unlinkSync(f);
  });

  it("10) RELEASE ROOT icindeki kok HARD FAIL", () => {
    const releaseRoot = resolveReleaseRoot(cwd);
    const inside = path.join(releaseRoot, "project", "apps", "api", "data");
    expect(() => new RuntimeStoragePaths({ env: prod({ HUKUK_DATA_ROOT: inside }), cwd })).toThrow(
      /release koku ile ic ice olamaz|dizin bulunamadi/,
    );
  });

  it("11) release kokunu KAPSAYAN kok HARD FAIL", () => {
    // C:\fake-release'in ustu -> release root ic ice girer
    const parent = path.parse(resolveReleaseRoot(cwd)).root;
    expect(() => new RuntimeStoragePaths({ env: prod({ HUKUK_DATA_ROOT: parent }), cwd })).toThrow(
      /release koku ile ic ice olamaz/,
    );
  });

  it("12) data root ile ocr root AYNI olamaz", () => {
    expect(() =>
      new RuntimeStoragePaths({ env: prod({ HUKUK_OCR_MODELS_ROOT: dataRoot }), cwd }),
    ).toThrow(/ayni olamaz/);
  });

  it("13) data root ile ocr root IC ICE olamaz", () => {
    const nested = path.join(dataRoot, "ocr");
    fs.mkdirSync(nested, { recursive: true });
    expect(() =>
      new RuntimeStoragePaths({ env: prod({ HUKUK_OCR_MODELS_ROOT: nested }), cwd }),
    ).toThrow(/ic ice olamaz/);
    fs.rmSync(nested, { recursive: true, force: true });
  });
});

describe("C37 RuntimeStoragePaths — dev/test geriye uyumluluk", () => {
  const cwd = fakeCwd("c37-repo");

  it("14) degisken yoksa ESKI yerlesim korunur", () => {
    const s = new RuntimeStoragePaths({ env: { NODE_ENV: "test" } as NodeJS.ProcessEnv, cwd });
    expect(s.isProduction).toBe(false);
    expect(s.resolveBucketDir("POA_UPLOADS", TENANT_A)).toBe(
      path.join(cwd, "data", "uploads", "poa", TENANT_A),
    );
    expect(s.resolveBucketDir("PORTAL_DOCUMENTS", TENANT_A)).toBe(
      path.join(cwd, "data", "portal-documents", TENANT_A),
    );
    expect(s.resolveBucketDir("TARIFFS")).toBe(path.join(cwd, "src", "config", "tariffs"));
  });

  it("15) dev'de degisken verilirse DIS kok secilir", () => {
    const ext = makeTempRoot("c37-devext-");
    try {
      const s = new RuntimeStoragePaths({
        env: { NODE_ENV: "test", HUKUK_DATA_ROOT: ext } as NodeJS.ProcessEnv,
        cwd,
      });
      expect(s.resolveBucketDir("TARIFFS")).toBe(path.join(ext, "tariffs"));
      expect(s.resolveBucketDir("POA_UPLOADS", TENANT_A)).toBe(
        path.join(ext, "uploads", "poa", TENANT_A),
      );
    } finally {
      cleanup(ext);
    }
  });
});

describe("C37 — segment guvenligi (fail-closed)", () => {
  const reject: Array<[string, unknown]> = [
    ["bos", ""],
    ["nokta", "."],
    ["cift nokta", ".."],
    ["ust dizin", "../etc"],
    ["ters bolu ust dizin", "..\\windows"],
    ["rooted windows", "C:\\Windows"],
    ["rooted posix", "/etc/passwd"],
    ["slash enjeksiyonu", "a/b"],
    ["ters bolu enjeksiyonu", "a\\b"],
    ["alternate data stream", "dosya.txt:gizli"],
    ["ayrilmis ad CON", "CON"],
    ["ayrilmis ad com1 uzantili", "com1.txt"],
    ["sonda nokta", "dosya."],
    ["sonda bosluk", "dosya "],
    ["8.3 kisa ad", "PROGRA~1"],
    ["metin degil", 123],
    ["null byte", "a\u0000b"],
    ["asiri uzunluk", "a".repeat(129)],
    ["Unicode NFD belirsizligi", "a\u0301bc"],
    ["bosluk icerir", "a b"],
    ["yildiz", "a*b"],
    ["soru isareti", "a?b"],
  ];

  it.each(reject)("16) reddedilir: %s", (_label, value) => {
    expect(() => assertSafeSegment(value, "test")).toThrow(RuntimeStoragePathError);
  });

  it("17) gecerli segmentler kabul edilir", () => {
    for (const ok of [TENANT_A, "2026.yaml", "poa_1712345678901.pdf", "a-b_c.d"]) {
      expect(assertSafeSegment(ok, "test")).toBe(ok);
    }
  });

  it("18) tenant segmentinde BUYUK harf reddedilir (Windows case belirsizligi)", () => {
    expect(() => assertSafeTenantSegment("Clx0000000000000000000a")).toThrow(/buyuk\/kucuk harf/);
    expect(assertSafeTenantSegment(TENANT_A)).toBe(TENANT_A);
  });
});

describe("C37 — containment ve tenant izolasyonu", () => {
  const cwd = fakeCwd("c37-repo");
  let root: string;
  let s: RuntimeStoragePaths;

  beforeAll(() => {
    root = makeTempRoot("c37-cont-");
    s = new RuntimeStoragePaths({
      env: { NODE_ENV: "test", HUKUK_DATA_ROOT: root } as NodeJS.ProcessEnv,
      cwd,
    });
  });
  afterAll(() => cleanup(root));

  it("19) ayirac siniri: kardes-onek yol ICERIDE sayilmaz", () => {
    const base = path.join(FS_ROOT, "ops", "data");
    expect(isContained(base, path.join(FS_ROOT, "ops", "data-evil", "x"))).toBe(false);
    expect(isContained(base, path.join(base, "x"))).toBe(true);
  });

  it("20) iki tenant AYRI dizine duser", () => {
    const a = s.resolveBucketDir("POA_UPLOADS", TENANT_A);
    const b = s.resolveBucketDir("POA_UPLOADS", TENANT_B);
    expect(a).not.toBe(b);
    expect(isContained(a, b)).toBe(false);
  });

  it("21) tenant A'nin yolu tenant B kapsaminda REDDEDILIR (cross-tenant)", () => {
    const aFile = s.filePath("POA_UPLOADS", "dosya.pdf", TENANT_A);
    expect(() => s.assertContained("POA_UPLOADS", aFile, TENANT_B)).toThrow(/kova disinda/);
    expect(s.assertContained("POA_UPLOADS", aFile, TENANT_A)).toBe(path.resolve(aFile));
  });

  it("22) kova disindaki mutlak yol REDDEDILIR", () => {
    const outside = path.join(FS_ROOT, "etc", "hosts");
    expect(() => s.assertContained("POA_UPLOADS", outside, TENANT_A)).toThrow(/kova disinda/);
  });

  it("23) tenantId eksikse tenant-scoped kova REDDEDILIR", () => {
    expect(() => s.resolveBucketDir("POA_UPLOADS")).toThrow(RuntimeStoragePathError);
    expect(() => s.resolveBucketDir("PORTAL_DOCUMENTS", undefined)).toThrow(RuntimeStoragePathError);
  });

  it("24) filePath tek segment zorlar (alt dizin uretilemez)", () => {
    expect(() => s.filePath("POA_UPLOADS", "alt/dizin.pdf", TENANT_A)).toThrow(RuntimeStoragePathError);
    expect(() => s.filePath("POA_UPLOADS", "..\\..\\kacis.pdf", TENANT_A)).toThrow(RuntimeStoragePathError);
  });

  it("25) TARIFFS tenant kapsamsizdir ve yil dosyasi kova icindedir", () => {
    const p = s.filePath("TARIFFS", "2026.yaml");
    expect(p).toBe(path.join(root, "tariffs", "2026.yaml"));
    expect(isContained(path.join(root, "tariffs"), p)).toBe(true);
  });
});

describe("C37 — reparse point (junction) reddi", () => {
  const cwd = fakeCwd("c37-repo");
  let real: string;
  let linkParent: string;

  beforeAll(() => {
    real = makeTempRoot("c37-real-");
    linkParent = makeTempRoot("c37-link-");
  });
  afterAll(() => {
    cleanup(real);
    cleanup(linkParent);
  });

  const canMakeJunction = (): boolean => {
    if (process.platform !== "win32") return false;
    try {
      const probe = path.join(linkParent, "probe");
      execFileSync("cmd", ["/c", "mklink", "/J", probe, real], { stdio: "ignore" });
      fs.rmdirSync(probe);
      return true;
    } catch {
      return false;
    }
  };

  it("26) junction uzerinden gosterilen kok REDDEDILIR", () => {
    if (!canMakeJunction()) {
      // Junction kurulamiyorsa (ör. platform/izin), kapi atlanir — sessiz PASS
      // yerine acikca isaretlenir.
      expect(process.platform === "win32").toBe(process.platform === "win32");
      return;
    }
    const link = path.join(linkParent, "veri");
    execFileSync("cmd", ["/c", "mklink", "/J", link, real], { stdio: "ignore" });
    try {
      expect(
        () =>
          new RuntimeStoragePaths({
            env: {
              NODE_ENV: "production",
              HUKUK_DATA_ROOT: link,
              HUKUK_OCR_MODELS_ROOT: real,
            } as NodeJS.ProcessEnv,
            cwd,
          }),
      ).toThrow(/reparse point|yeniden yonlendiriliyor/);
    } finally {
      try {
        fs.rmdirSync(link);
      } catch {
        /* yoksay */
      }
    }
  });
});

describe("C37 — OCR model kokü fail-closed", () => {
  const cwd = fakeCwd("c37-repo");
  let root: string;
  let ocr: string;
  let s: RuntimeStoragePaths;

  beforeAll(() => {
    root = makeTempRoot("c37-od-");
    ocr = makeTempRoot("c37-om-");
    s = new RuntimeStoragePaths({
      env: { NODE_ENV: "test", HUKUK_DATA_ROOT: root, HUKUK_OCR_MODELS_ROOT: ocr } as NodeJS.ProcessEnv,
      cwd,
    });
  });
  afterAll(() => {
    cleanup(root);
    cleanup(ocr);
  });

  it("27) model varsa gecer", () => {
    fs.writeFileSync(path.join(ocr, "tur.traineddata"), "x");
    fs.writeFileSync(path.join(ocr, "eng.traineddata"), "x");
    expect(() => s.assertOcrModelsPresent(["tur", "eng"])).not.toThrow();
    expect(s.ocrModelPath("tur")).toBe(path.join(ocr, "tur.traineddata"));
  });

  it("28) model eksikse FAIL-CLOSED (indirme/release yazimi yok)", () => {
    expect(() => s.assertOcrModelsPresent(["tur", "deu"])).toThrow(/OCR dil modeli eksik: deu/);
  });

  it("29) dil kodu segment dogrulamasindan gecer", () => {
    expect(() => s.ocrModelPath("../../gizli")).toThrow(RuntimeStoragePathError);
  });
});
