import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { IIK78_STATUTORY_INACTIVITY_DAYS } from "../../case/iik78-inactivity";

/**
 * F03-D2 (J-25 / OFP-19b; owner kararı K6-b, 25.11.2026) — İİK-78 büro ayarı "yalnız saklama"dır; dosya pasiflik hesabı
 * yasal 1 yılda kalır.
 *
 * Bu test bir SINIR sabitlemesidir: ayar alanlarını (`inactivityThresholdDays`, `inactivityWarningDays`) okuyan üretim kodu
 * yalnız saklama / okuma yüzeyidir (DTO, projeksiyon, büro servisi). Alanlar bir hesaba, zamanlayıcıya ya da uyarıya
 * bağlanırsa test düşer: bu, yasal süreyi ayarla değiştirmek demektir ve yeni owner kararı ister (K6-a seçilmedi).
 */
const SRC = join(__dirname, "..", "..", "..");
const SETTING_FIELD = /inactivityThresholdDays|inactivityWarningDays/;
/** Yorumlar ayarın adını anabilir (etiket); sınır KOD kullanımını ölçer. */
const code = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function productionSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      productionSources(full, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".spec.ts") && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("F03-D2 — İİK-78 büro ayarı yalnız saklanır", () => {
  it("ayar alanlarını okuyan üretim kodu yalnız saklama / okuma yüzeyidir", () => {
    const readers = productionSources(SRC)
      .filter((file) => SETTING_FIELD.test(code(readFileSync(file, "utf8"))))
      .map((file) => relative(SRC, file).split(sep).join("/"))
      .sort();

    expect(readers).toEqual([
      "modules/office/dto/office-settings.dto.ts",
      "modules/office/office-f01-projection.ts",
      "modules/office/office.service.ts",
    ]);
  });

  it("dosya pasiflik hesabı yasal süre sabitini kullanır; sabit 365 gündür ve ayardan okunmaz", () => {
    expect(IIK78_STATUTORY_INACTIVITY_DAYS).toBe(365);
    const caseService = readFileSync(join(SRC, "modules", "case", "case.service.ts"), "utf8");
    expect(caseService).toContain("Math.max(0, IIK78_STATUTORY_INACTIVITY_DAYS - daysSinceLastAction)");
    expect(code(caseService)).not.toMatch(SETTING_FIELD);
  });

  it("ayar ucu saklanan değeri olduğu gibi geri verir; değer hesaba girmez (okuma varsayılanları 365 / 60)", async () => {
    const { OfficeService } = await import("../office.service");
    const service = new (OfficeService as unknown as new (...args: unknown[]) => {
      getOrCreate(tenantId: string): Promise<unknown>;
      getIik78Settings(tenantId: string): Promise<unknown>;
    })({}, {});
    const getOrCreate = jest.spyOn(service, "getOrCreate");

    getOrCreate.mockResolvedValue({ id: "o1", inactivityThresholdDays: null, inactivityWarningDays: null });
    await expect(service.getIik78Settings("t1")).resolves.toEqual({ inactivityThresholdDays: 365, inactivityWarningDays: 60 });

    // Büro 90 gün saklasa da bu yalnız saklanan değerdir: pasiflik hesabının sabiti değişmez.
    getOrCreate.mockResolvedValue({ id: "o1", inactivityThresholdDays: 90, inactivityWarningDays: 15 });
    await expect(service.getIik78Settings("t1")).resolves.toEqual({ inactivityThresholdDays: 90, inactivityWarningDays: 15 });
    expect(IIK78_STATUTORY_INACTIVITY_DAYS).toBe(365);
  });
});
