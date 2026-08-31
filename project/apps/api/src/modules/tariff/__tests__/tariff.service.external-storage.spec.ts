/**
 * C37-EXTERNAL-RUNTIME-STORAGE — TariffService dis veri koku davranisi.
 *
 * Kapsam: release DISI kokten okuma/yazma, atomik yazim, es zamanli yazim
 * kilidi, kayip-guncelleme onlemi, production'da bos kok = HARD FAIL.
 *
 * DB GEREKMEZ.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import { RuntimeStoragePaths } from "../../../common/storage/runtime-storage-paths";
import { TariffService, TariffData } from "../tariff.service";

const FS_ROOT = path.parse(process.cwd()).root;
const FAKE_CWD = path.join(FS_ROOT, "c37-fake-release-tariff", "project", "apps", "api");

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

function minimalTariff(year: number): TariffData {
  return {
    year,
    version: 0,
    effective_date: `${year}-01-01`,
    // REQUIRED_TARIFF_SECTIONS'in TAMAMI — eksik bolum fail-closed reddedilir.
    fixed_fees: { basvurma_harci: 1 },
    rate_fees: { nispi: 1 },
    postage: { tebligat: 1 },
    interest_rates: { yasal: 1 },
    penalties: { gecikme: 1 },
  } as unknown as TariffData;
}

function storageFor(dataRoot: string, ocrRoot: string, nodeEnv: string): RuntimeStoragePaths {
  return new RuntimeStoragePaths({
    env: {
      NODE_ENV: nodeEnv,
      HUKUK_DATA_ROOT: dataRoot,
      HUKUK_OCR_MODELS_ROOT: ocrRoot,
    } as NodeJS.ProcessEnv,
    cwd: FAKE_CWD,
  });
}

describe("C37 TariffService — dis veri koku", () => {
  let dataRoot: string;
  let ocrRoot: string;

  beforeEach(() => {
    dataRoot = makeRoot("c37-tar-data-");
    ocrRoot = makeRoot("c37-tar-ocr-");
  });
  afterEach(() => {
    cleanup(dataRoot);
    cleanup(ocrRoot);
  });

  const seed = (year: number, version = 3): void => {
    const dir = path.join(dataRoot, "tariffs");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${year}.yaml`),
      yaml.dump({ ...minimalTariff(year), version }),
      "utf8",
    );
  };

  it("1) tarifeler release DISI kokten okunur", () => {
    seed(2026);
    const svc = new TariffService(storageFor(dataRoot, ocrRoot, "test"));
    expect(svc.getTariff(2026)).not.toBeNull();
    expect(svc.getAvailableYears()).toEqual([2026]);
  });

  it("2) yazim dis koke duser; release koku ICINE hicbir sey yazilmaz", () => {
    seed(2026);
    const svc = new TariffService(storageFor(dataRoot, ocrRoot, "test"));
    const res = svc.saveTariff(2027, minimalTariff(2027));
    expect(res.success).toBe(true);
    expect(fs.existsSync(path.join(dataRoot, "tariffs", "2027.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(FAKE_CWD, "src", "config", "tariffs", "2027.yaml"))).toBe(false);
  });

  it("3) version DISKTEKI gercek degerden turetilir (kayip guncelleme onlemi)", () => {
    seed(2026, 7);
    const svc = new TariffService(storageFor(dataRoot, ocrRoot, "test"));
    // Baska bir surec diski v9'a tasidi; bellek cache'i bayat.
    fs.writeFileSync(
      path.join(dataRoot, "tariffs", "2026.yaml"),
      yaml.dump({ ...minimalTariff(2026), version: 9 }),
      "utf8",
    );
    const res = svc.saveTariff(2026, minimalTariff(2026));
    expect(res.success).toBe(true);
    const onDisk = yaml.load(
      fs.readFileSync(path.join(dataRoot, "tariffs", "2026.yaml"), "utf8"),
    ) as TariffData;
    // 7+1 = 8 DEGIL; disk 9 idi -> 10
    expect(onDisk.version).toBe(10);
  });

  it("4) es zamanli yazim: kilit tutuluyorken yazim REDDEDILIR (dosya degismez)", () => {
    seed(2026, 2);
    const svc = new TariffService(storageFor(dataRoot, ocrRoot, "test"));
    const target = path.join(dataRoot, "tariffs", "2026.yaml");
    const before = fs.readFileSync(target, "utf8");

    // Baska bir surec kilidi tutuyor.
    const lockPath = `${target}.lock`;
    fs.closeSync(fs.openSync(lockPath, "wx"));
    try {
      const res = svc.saveTariff(2026, minimalTariff(2026));
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/baska bir islem/);
      expect(fs.readFileSync(target, "utf8")).toBe(before);
    } finally {
      fs.unlinkSync(lockPath);
    }
  });

  it("5) kilit basarili yazimdan SONRA birakilir", () => {
    seed(2026);
    const svc = new TariffService(storageFor(dataRoot, ocrRoot, "test"));
    expect(svc.saveTariff(2026, minimalTariff(2026)).success).toBe(true);
    expect(fs.existsSync(path.join(dataRoot, "tariffs", "2026.yaml.lock"))).toBe(false);
  });

  it("6) atomik yazim: rename basarisiz olursa ORIJINAL korunur ve temp ARTIGI kalmaz", () => {
    seed(2026, 4);
    const svc = new TariffService(storageFor(dataRoot, ocrRoot, "test"));
    const dir = path.join(dataRoot, "tariffs");
    const target = path.join(dir, "2026.yaml");
    const before = fs.readFileSync(target, "utf8");

    const spy = jest.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("simule edilmis rename hatasi");
    });
    try {
      const res = svc.saveTariff(2026, minimalTariff(2026));
      expect(res.success).toBe(false);
    } finally {
      spy.mockRestore();
    }

    expect(fs.readFileSync(target, "utf8")).toBe(before);
    expect(fs.readdirSync(dir).filter((f) => f.includes(".tmp-"))).toEqual([]);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".lock"))).toEqual([]);
  });

  it("7) basarili yazimdan sonra temp artigi kalmaz", () => {
    seed(2026);
    const svc = new TariffService(storageFor(dataRoot, ocrRoot, "test"));
    svc.saveTariff(2026, minimalTariff(2026));
    expect(fs.readdirSync(path.join(dataRoot, "tariffs")).filter((f) => f.includes(".tmp-"))).toEqual([]);
  });

  it("8) gecersiz yil segmenti REDDEDILIR (traversal/tasma)", () => {
    seed(2026);
    const svc = new TariffService(storageFor(dataRoot, ocrRoot, "test"));
    for (const bad of [0, -1, 1899, 10000, 2026.5, NaN]) {
      expect(svc.saveTariff(bad as number, minimalTariff(2026)).success).toBe(false);
    }
  });

  it("9) silme dis kokte calisir", () => {
    seed(2026);
    const svc = new TariffService(storageFor(dataRoot, ocrRoot, "test"));
    expect(svc.deleteTariff(2026).success).toBe(true);
    expect(fs.existsSync(path.join(dataRoot, "tariffs", "2026.yaml"))).toBe(false);
  });

  it("10) PRODUCTION + bos tarife koku = HARD FAIL (sessiz 'tarife yok' DEGIL)", () => {
    fs.mkdirSync(path.join(dataRoot, "tariffs"), { recursive: true });
    expect(() => new TariffService(storageFor(dataRoot, ocrRoot, "production"))).toThrow(
      /Tarife bulunamadi/,
    );
  });

  it("11) PRODUCTION + dolu kok = kurulur", () => {
    seed(2026);
    expect(() => new TariffService(storageFor(dataRoot, ocrRoot, "production"))).not.toThrow();
  });

  it("12) dev/test'te bos kok tolere edilir (geriye uyumluluk)", () => {
    fs.mkdirSync(path.join(dataRoot, "tariffs"), { recursive: true });
    expect(() => new TariffService(storageFor(dataRoot, ocrRoot, "test"))).not.toThrow();
  });
});
