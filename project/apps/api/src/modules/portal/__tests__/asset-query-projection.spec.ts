/**
 * CLIENT-P2-U03-TRACK-A-I02 — toCuratedAssetQuery() pure mapper testleri.
 * API-owned raw-to-curated semantic mapping; web hiçbir ham AssetQueryStatus değeri
 * görmez/yorumlamaz. Exhaustive: 5 ham durum + 1 tanınmayan/gelecek değer, 4 kategori
 * bağımsız mapping, lastQueryAt passthrough (null dahil).
 */
import { toCuratedAssetQuery } from "../asset-query-projection";

function raw(overrides: Partial<Parameters<typeof toCuratedAssetQuery>[0]> = {}) {
  return {
    assetVehicle: "UNKNOWN",
    assetRealEstate: "UNKNOWN",
    assetBank: "UNKNOWN",
    assetSgkWage: "UNKNOWN",
    assetLastQueryAt: null,
    ...overrides,
  };
}

describe("toCuratedAssetQuery — CLIENT-P2-U03-TRACK-A-I02 curated mapping", () => {
  it("[1] UNKNOWN → NOT_QUERIED", () => {
    expect(toCuratedAssetQuery(raw({ assetVehicle: "UNKNOWN" })).vehicle).toBe("NOT_QUERIED");
  });

  it("[2] YES → FOUND", () => {
    expect(toCuratedAssetQuery(raw({ assetVehicle: "YES" })).vehicle).toBe("FOUND");
  });

  it("[3] NO → NOT_FOUND", () => {
    expect(toCuratedAssetQuery(raw({ assetVehicle: "NO" })).vehicle).toBe("NOT_FOUND");
  });

  it("[4] PENDING → RESULT_PENDING", () => {
    expect(toCuratedAssetQuery(raw({ assetVehicle: "PENDING" })).vehicle).toBe("RESULT_PENDING");
  });

  it("[5] ERROR → RESULT_UNAVAILABLE", () => {
    expect(toCuratedAssetQuery(raw({ assetVehicle: "ERROR" })).vehicle).toBe("RESULT_UNAVAILABLE");
  });

  it("[6] tanınmayan/gelecek ham değer → RESULT_UNAVAILABLE (fail-safe, çökmez)", () => {
    expect(toCuratedAssetQuery(raw({ assetVehicle: "SOME_FUTURE_VALUE" })).vehicle).toBe("RESULT_UNAVAILABLE");
  });

  it("[7] 4 kategori tamamen bağımsız map edilir", () => {
    const result = toCuratedAssetQuery(
      raw({
        assetVehicle: "YES",
        assetRealEstate: "NO",
        assetBank: "PENDING",
        assetSgkWage: "ERROR",
      })
    );
    expect(result).toEqual({
      vehicle: "FOUND",
      realEstate: "NOT_FOUND",
      bank: "RESULT_PENDING",
      sgkWage: "RESULT_UNAVAILABLE",
      lastQueryAt: null,
    });
  });

  it("[8] lastQueryAt null ise null döner", () => {
    expect(toCuratedAssetQuery(raw({ assetLastQueryAt: null })).lastQueryAt).toBeNull();
  });

  it("[9] lastQueryAt bir Date ise aynı değer olduğu gibi döner (passthrough)", () => {
    const d = new Date("2026-06-15T10:00:00.000Z");
    expect(toCuratedAssetQuery(raw({ assetLastQueryAt: d })).lastQueryAt).toBe(d);
  });

  it("[10] çıktı yalnız 5 anahtar taşır (vehicle/realEstate/bank/sgkWage/lastQueryAt)", () => {
    expect(Object.keys(toCuratedAssetQuery(raw())).sort()).toEqual(
      ["bank", "lastQueryAt", "realEstate", "sgkWage", "vehicle"].sort()
    );
  });
});
