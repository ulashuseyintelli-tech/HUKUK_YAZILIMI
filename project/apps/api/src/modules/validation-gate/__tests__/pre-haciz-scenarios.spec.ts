/**
 * PR-D4e-5 — Haciz öncesi RİSK skorunun OPERASYONEL DOĞRULUK senaryo/fixture seti.
 * Gerçek borçlu/dosya durumlarının doğru sinyal → doğru seviye ürettiğini sabitler.
 * Kapsam: sinyal türetme fix'leri (NO_ADDRESS, VERIFIED_ABSENT_RECENT, S1=yalnız VERIFIED_PRESENT),
 * kanal/serviceStatus matrisi, çoklu-borçlu sıralama + overallLevel.
 * Net sınır: blok yok (isValid hep true), kalıcı yazım yok.
 */

import { ValidationGateService } from "../validation-gate.service";

type Opts = { recentPresent?: number; recentAbsent?: number; physicalPresent?: number };

const buildPrisma = (caseDebtors: any[], perDebtor: Record<string, Opts> = {}) =>
  ({
    case: { findFirst: jest.fn().mockResolvedValue({ id: "c1" }) },
    caseDebtor: { findMany: jest.fn().mockResolvedValue(caseDebtors) },
    debtorIntelligence: {
      count: jest.fn().mockImplementation(({ where }: any) => {
        const o = perDebtor[where.debtorId] || {};
        if (where.result === "VERIFIED_PRESENT" && where.addressId) return Promise.resolve(o.physicalPresent ?? 0);
        if (where.result === "VERIFIED_PRESENT") return Promise.resolve(o.recentPresent ?? 0);
        if (where.result === "VERIFIED_ABSENT") return Promise.resolve(o.recentAbsent ?? 0);
        return Promise.resolve(0);
      }),
    },
  }) as any;

// caseDebtor fixture kurucu. addr=null → adressiz borçlu.
const mkCd = (
  id: string,
  o: { status?: string; channel?: string; addr?: { verified: boolean; source: string | null } | null } = {}
) => {
  const addr = o.addr === undefined ? { verified: true, source: "FIELD" } : o.addr;
  const address = addr ? { id: `${id}-addr`, verified: addr.verified, verifiedSource: addr.source } : null;
  return {
    serviceStatus: o.status ?? "SENT",
    serviceChannel: o.channel ?? "NORMAL",
    debtor: { id, name: id, debtorAddresses: address ? [address] : [] },
    selectedAddress: address,
  };
};

const run = (caseDebtors: any[], perDebtor: Record<string, Opts> = {}) =>
  new ValidationGateService(buildPrisma(caseDebtors, perDebtor)).checkPreHacizIntelligence("t1", "c1");

const ids = (res: any, debtorId: string) =>
  res.warnings.filter((w: any) => w.path === `debtor.${debtorId}`).map((w: any) => w.id).sort();

describe("D4e-5 — adressiz borçlu (D5-Q1 FIX: artık sessiz değil)", () => {
  it("adres yok + recent PRESENT yok → INTEL_NO_ADDRESS + INTEL_90D_MISSING, S2/S3 YOK, level YUKSEK", async () => {
    const res = await run([mkCd("d1", { addr: null })], {});
    expect(ids(res, "d1")).toEqual(["INTEL_90D_MISSING", "INTEL_NO_ADDRESS"]);
    expect(res.debtors[0].level).toBe("YUKSEK");
  });

  it("adres yok ama recent VERIFIED_PRESENT var → yalnız INTEL_NO_ADDRESS (S1 susar)", async () => {
    const res = await run([mkCd("d1", { addr: null })], { d1: { recentPresent: 1 } });
    expect(ids(res, "d1")).toEqual(["INTEL_NO_ADDRESS"]);
  });
});

describe("D4e-5 — VERIFIED_ABSENT (D5-Q2 FIX: S1'i susturmaz, ayrı YÜKSEK risk)", () => {
  it("recent ABSENT var + recent PRESENT yok → VERIFIED_ABSENT_RECENT + 90D_MISSING birlikte", async () => {
    const res = await run([mkCd("d1")], { d1: { recentAbsent: 1, recentPresent: 0 } });
    expect(ids(res, "d1")).toEqual(expect.arrayContaining(["INTEL_VERIFIED_ABSENT_RECENT", "INTEL_90D_MISSING"]));
    expect(res.debtors[0].level).toBe("YUKSEK");
  });

  it("recent ABSENT + recent PRESENT birlikte → ABSENT sinyali var ama S1 susar", async () => {
    const res = await run([mkCd("d1")], { d1: { recentAbsent: 1, recentPresent: 1 } });
    const got = ids(res, "d1");
    expect(got).toContain("INTEL_VERIFIED_ABSENT_RECENT");
    expect(got).not.toContain("INTEL_90D_MISSING");
  });
});

describe("D4e-5 — PENDING/IN_FIELD (D5-Q3 FIX: süreç var sonuç yok → S1'i susturmaz)", () => {
  it("recent PRESENT 0 (yalnız PENDING/IN_FIELD mevcut) → INTEL_90D_MISSING tetiklenir", async () => {
    // PENDING/IN_FIELD VERIFIED_PRESENT sayılmaz → recentPresent 0 → S1 fires.
    const res = await run([mkCd("d1")], { d1: { recentPresent: 0 } });
    expect(ids(res, "d1")).toContain("INTEL_90D_MISSING");
  });
});

describe("D4e-5 — S2 e-tebligat kanal/serviceStatus matrisi", () => {
  const adsFail = { addr: { verified: false, source: null } }; // S3 da fire eder, S2'yi ayrı kontrol için id filtrele
  it("DELIVERED + UETS + physical yok → ETEBLIGAT_NO_PHYSICAL_VERIFY", async () => {
    const res = await run([mkCd("d1", { status: "DELIVERED", channel: "UETS", ...adsFail })], { d1: { physicalPresent: 0, recentPresent: 1 } });
    expect(ids(res, "d1")).toContain("INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY");
  });
  it("DELIVERED + KEP + physical yok → tetikler", async () => {
    const res = await run([mkCd("d1", { status: "DELIVERED", channel: "KEP", ...adsFail })], { d1: { physicalPresent: 0, recentPresent: 1 } });
    expect(ids(res, "d1")).toContain("INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY");
  });
  it("DELIVERED + PTT (fiziksel) → S2 TETİKLEMEZ", async () => {
    const res = await run([mkCd("d1", { status: "DELIVERED", channel: "PTT", ...adsFail })], { d1: { recentPresent: 1 } });
    expect(ids(res, "d1")).not.toContain("INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY");
  });
  it("SENT + UETS (henüz teslim değil) → S2 TETİKLEMEZ", async () => {
    const res = await run([mkCd("d1", { status: "SENT", channel: "UETS", ...adsFail })], { d1: { recentPresent: 1 } });
    expect(ids(res, "d1")).not.toContain("INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY");
  });
  it("DELIVERED + UETS ama o adreste physical VERIFIED_PRESENT var → S2 SUSAR", async () => {
    const res = await run([mkCd("d1", { status: "DELIVERED", channel: "UETS", addr: { verified: true, source: "FIELD" } })], { d1: { physicalPresent: 1, recentPresent: 1 } });
    expect(ids(res, "d1")).not.toContain("INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY");
  });
});

describe("D4e-5 — S3 adres doğrulama matrisi", () => {
  it("verified=true + FIELD → S3 SUSAR", async () => {
    const res = await run([mkCd("d1", { addr: { verified: true, source: "FIELD" } })], { d1: { recentPresent: 1 } });
    expect(ids(res, "d1")).not.toContain("INTEL_ADDRESS_UNVERIFIED");
  });
  it("verified=true + UYAP (FIELD değil) → S3 VERİR", async () => {
    const res = await run([mkCd("d1", { addr: { verified: true, source: "UYAP" } })], { d1: { recentPresent: 1 } });
    expect(ids(res, "d1")).toContain("INTEL_ADDRESS_UNVERIFIED");
  });
  it("verified=false → S3 VERİR", async () => {
    const res = await run([mkCd("d1", { addr: { verified: false, source: "FIELD" } })], { d1: { recentPresent: 1 } });
    expect(ids(res, "d1")).toContain("INTEL_ADDRESS_UNVERIFIED");
  });
});

describe("D4e-5 — çoklu-borçlu sıralama + overallLevel", () => {
  it("YÜKSEK + ORTA + temiz → temiz elenir, YÜKSEK üstte, overall YUKSEK", async () => {
    const res = await run(
      [
        mkCd("temiz", { addr: { verified: true, source: "FIELD" } }), // sinyal yok
        mkCd("orta", { addr: { verified: true, source: "FIELD" } }), // yalnız S1 (ORTA)
        mkCd("yuksek", { addr: { verified: false, source: null } }), // S3 (YÜKSEK) + S1
      ],
      { temiz: { recentPresent: 1 }, orta: { recentPresent: 0 }, yuksek: { recentPresent: 0 } }
    );
    expect(res.debtors.map((d: any) => d.debtorId)).toEqual(["yuksek", "orta"]); // temiz elendi, yüksek önce
    expect(res.debtors[0].level).toBe("YUKSEK");
    expect(res.debtors[1].level).toBe("ORTA");
    expect(res.overallLevel).toBe("YUKSEK");
  });
});
