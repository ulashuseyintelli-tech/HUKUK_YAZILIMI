/**
 * C37-EXTERNAL-RUNTIME-STORAGE — yazim yuzeyi DAVRANIS testleri.
 *
 * Statik kapi (release-write-surface.static-guard.spec.ts) kodun seklini pinler;
 * bu dosya calisma zamani davranisini olcer:
 *   - OCR: dis kokten SALT-OKUMA, model eksikse fail-closed, cache yazimi yok
 *   - POA: containment fail-closed (cross-tenant / kova disi silme reddi)
 *   - updateGolden: production'da reddedilir
 *
 * DB GEREKMEZ.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RuntimeStoragePaths, RuntimeStoragePathError } from "../runtime-storage-paths";
import { PoaService } from "../../../modules/poa/poa.service";
import { ScenarioHarnessService } from "../../../modules/icrabot/v28-engine/scenario-harness.service";

/**
 * OCR bolumu YALNIZ Windows'ta kosar ve modulleri TEMBEL yukler.
 *
 * Gerekce (olculdu): `ocr.service` modul yuklemesinde `require("pdf-poppler")`
 * yapar; bu paket Linux'ta yuklenirken `process.exit(1)` cagirir ve Jest
 * worker'ini oldururur — testin kendisi calismadan tum suite duser. CI
 * ubuntu-latest'te kostugu icin ust seviye import KULLANILAMAZ.
 *
 * Linux'ta kaybolan kapsam bosta BIRAKILMAZ:
 *   - kodun sekli `release-write-surface.static-guard.spec.ts` ile (kaynak
 *     metni okunur, import YOK) her platformda pinlenir;
 *   - calisma zamani davranisi Windows'taki disposable read-only release
 *     qualification'inda (derlenmis dist, gercek ACL) olculur.
 */
const IS_WIN = process.platform === "win32";
const describeWin = IS_WIN ? describe : describe.skip;

const FS_ROOT = path.parse(process.cwd()).root;
const FAKE_CWD = path.join(FS_ROOT, "c37-fake-release-behav", "project", "apps", "api");
const TENANT_A = "clx000000000000000000wa";
const TENANT_B = "clx000000000000000000wb";

function makeRoot(prefix: string): string {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}
function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* yoksay */
  }
}
function storageFor(dataRoot: string, ocrRoot: string, nodeEnv = "test"): RuntimeStoragePaths {
  return new RuntimeStoragePaths({
    env: {
      NODE_ENV: nodeEnv,
      HUKUK_DATA_ROOT: dataRoot,
      HUKUK_OCR_MODELS_ROOT: ocrRoot,
    } as NodeJS.ProcessEnv,
    cwd: FAKE_CWD,
  });
}

describeWin("C37 — OCR dil modeli dis kokten SALT-OKUNUR [WINDOWS]", () => {
  let dataRoot: string;
  let ocrRoot: string;
  let Tesseract: typeof import("tesseract.js");
  let OcrService: typeof import("../../../modules/ocr/ocr.service").OcrService;
  let OCR_TESSERACT_LANGS: string[];
  const configStub = { get: jest.fn(() => undefined) } as any;

  beforeAll(() => {
    // Tembel yukleme: Linux'ta bu blok hic calismaz (bkz. dosya basligi).
    Tesseract = require("tesseract.js");
    const mod = require("../../../modules/ocr/ocr.service");
    OcrService = mod.OcrService;
    OCR_TESSERACT_LANGS = mod.OCR_TESSERACT_LANGS;
  });

  beforeEach(() => {
    dataRoot = makeRoot("c37-b-data-");
    ocrRoot = makeRoot("c37-b-ocr-");
  });
  afterEach(() => {
    cleanup(dataRoot);
    cleanup(ocrRoot);
    jest.restoreAllMocks();
  });

  const seedModels = (): void => {
    for (const lang of OCR_TESSERACT_LANGS) {
      fs.writeFileSync(path.join(ocrRoot, `${lang}.traineddata`), "sentetik-model");
    }
  };

  it("1) recognize cagrisi cachePath=dis kok ve cacheMethod='read' ile yapilir", async () => {
    seedModels();
    const storage = storageFor(dataRoot, ocrRoot);
    const svc = new OcrService(configStub, undefined, storage);
    jest.spyOn(svc as any, "preprocessImage").mockResolvedValue(Buffer.from("x"));

    const spy = jest
      .spyOn(Tesseract, "recognize")
      .mockResolvedValue({ data: { text: "merhaba" } } as any);

    await svc.extractTextFromImage(Buffer.from("x"));

    expect(spy).toHaveBeenCalledTimes(1);
    const [, langs, options] = spy.mock.calls[0] as unknown as [unknown, string, Record<string, unknown>];
    expect(langs).toBe("tur+eng");
    expect(options.cachePath).toBe(ocrRoot);
    // 'read' = okur, ASLA yazmaz (tesseract.js 6 sozlesmesi).
    expect(options.cacheMethod).toBe("read");
  });

  it("2) model EKSIKSE fail-closed: recognize CAGRILMAZ, ag/yazim denemesi yok", async () => {
    // model dosyalari kasitli olarak yazilmadi
    const storage = storageFor(dataRoot, ocrRoot);
    const svc = new OcrService(configStub, undefined, storage);
    jest.spyOn(svc as any, "preprocessImage").mockResolvedValue(Buffer.from("x"));
    const spy = jest.spyOn(Tesseract, "recognize").mockResolvedValue({ data: { text: "" } } as any);

    await expect(svc.extractTextFromImage(Buffer.from("x"))).rejects.toThrow(/OCR dil modeli eksik/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("3) OCR akisi OCR kokune hicbir dosya EKLEMEZ", async () => {
    seedModels();
    const before = fs.readdirSync(ocrRoot).sort();
    const storage = storageFor(dataRoot, ocrRoot);
    const svc = new OcrService(configStub, undefined, storage);
    jest.spyOn(svc as any, "preprocessImage").mockResolvedValue(Buffer.from("x"));
    jest.spyOn(Tesseract, "recognize").mockResolvedValue({ data: { text: "t" } } as any);

    await svc.extractTextFromImage(Buffer.from("x"));

    expect(fs.readdirSync(ocrRoot).sort()).toEqual(before);
    // data root'a da bulasma yok
    expect(fs.readdirSync(dataRoot)).toEqual([]);
  });
});

describe("C37 — POA containment fail-closed", () => {
  let dataRoot: string;
  let ocrRoot: string;

  beforeEach(() => {
    dataRoot = makeRoot("c37-p-data-");
    ocrRoot = makeRoot("c37-p-ocr-");
  });
  afterEach(() => {
    cleanup(dataRoot);
    cleanup(ocrRoot);
  });

  const buildService = (storage: RuntimeStoragePaths, poa: { filePath: string | null }) => {
    const prisma = {
      clientPowerOfAttorney: {
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const svc = new PoaService(prisma, {} as any, {} as any, storage);
    jest.spyOn(svc, "findOne").mockResolvedValue(poa as any);
    return { svc, prisma };
  };

  it("4) kova ICINDEKI dosya silinir", async () => {
    const storage = storageFor(dataRoot, ocrRoot);
    const target = storage.filePath("POA_UPLOADS", "a.pdf", TENANT_A);
    fs.writeFileSync(target, "x");
    const { svc } = buildService(storage, { filePath: target });

    await svc.deleteFile("poa-1", TENANT_A);
    expect(fs.existsSync(target)).toBe(false);
  });

  it("5) BASKA TENANT'in dosyasi silinemez (cross-tenant fail-closed)", async () => {
    const storage = storageFor(dataRoot, ocrRoot);
    const victim = storage.filePath("POA_UPLOADS", "a.pdf", TENANT_B);
    fs.writeFileSync(victim, "x");
    const { svc } = buildService(storage, { filePath: victim });

    await expect(svc.deleteFile("poa-1", TENANT_A)).rejects.toThrow(RuntimeStoragePathError);
    expect(fs.existsSync(victim)).toBe(true);
  });

  it("6) kova DISINDAKI mutlak yol silinemez (DB'den gelen yol guvenilmez)", async () => {
    const storage = storageFor(dataRoot, ocrRoot);
    const outside = path.join(ocrRoot, "kurban.txt");
    fs.writeFileSync(outside, "x");
    const { svc } = buildService(storage, { filePath: outside });

    await expect(svc.deleteFile("poa-1", TENANT_A)).rejects.toThrow(/kova disinda/);
    expect(fs.existsSync(outside)).toBe(true);
  });

  it("7) filePath yolu tenant kovasinda uretilir", () => {
    const storage = storageFor(dataRoot, ocrRoot);
    const p = storage.filePath("POA_UPLOADS", "poa_1.pdf", TENANT_A);
    expect(p).toBe(path.join(dataRoot, "uploads", "poa", TENANT_A, "poa_1.pdf"));
  });
});

describe("C37 — updateGolden production'da reddedilir (D-09)", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  const build = () => new ScenarioHarnessService({} as any, {} as any, {} as any);

  it("8) NODE_ENV=production => reddedilir ve senaryo CALISTIRILMAZ", async () => {
    process.env.NODE_ENV = "production";
    const svc = build();
    const ran = jest.spyOn(svc, "runScenarioFromDir");
    await expect(svc.updateGolden(path.join(FS_ROOT, "c37-herhangi", "dizin"), undefined, {} as any)).rejects.toThrow(
      /production ortaminda devre disidir/,
    );
    expect(ran).not.toHaveBeenCalled();
    ran.mockRestore();
  });

  it("9) production DISI ortamda guard tetiklenmez", async () => {
    process.env.NODE_ENV = "test";
    const svc = build();
    const ran = jest
      .spyOn(svc, "runScenarioFromDir")
      .mockRejectedValue(new Error("senaryo-yok"));
    await expect(svc.updateGolden(path.join(FS_ROOT, "c37-herhangi", "dizin"), undefined, {} as any)).rejects.toThrow(
      /senaryo-yok/,
    );
    expect(ran).toHaveBeenCalledTimes(1);
    ran.mockRestore();
  });
});
