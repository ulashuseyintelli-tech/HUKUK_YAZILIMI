/**
 * ASSIGN-4b drift onarımı — saf karar (planCaseDriftFix) + argüman kilidi (parseDriftRepairArgs).
 *
 * Kararın create() dedupe'iyle BİREBİR aynı olduğunu (planResponsible REUSE) ve 4 durumun
 * doğru sınıflandığını kanıtlar. Yazma (runDriftRepair) DB e2e ile doğrulanır (rfa016 deseni).
 */
import { planCaseDriftFix, parseDriftRepairArgs, runDriftRepair, DriftCaseLawyer } from "../case-responsible-drift.core";

describe("planCaseDriftFix — drift sınıflandırma + onarım planı (saf)", () => {
  it("avukatsız dosya → EMPTY, no-op (ASSIGN-4b bilinçli istisnası)", () => {
    const plan = planCaseDriftFix([]);
    expect(plan.kind).toBe("EMPTY");
    expect(plan.isDrift).toBe(false);
    expect(plan.keepId).toBeNull();
    expect(plan.demoteIds).toEqual([]);
  });

  it("tam 1 sorumlu → OK, DOKUNMA (keepId/demote yok)", () => {
    const lawyers: DriftCaseLawyer[] = [
      { id: "a", lawyerRank: "PARTNER", isResponsible: true },
      { id: "b", lawyerRank: "LAWYER", isResponsible: false },
    ];
    const plan = planCaseDriftFix(lawyers);
    expect(plan.kind).toBe("OK");
    expect(plan.isDrift).toBe(false);
    expect(plan.keepId).toBeNull();
    expect(plan.demoteIds).toEqual([]);
  });

  it("0 sorumlu + avukat var → ZERO_RESPONSIBLE, önceliğe göre 1 promote, demote yok", () => {
    const lawyers: DriftCaseLawyer[] = [
      { id: "law", lawyerRank: "LAWYER", isResponsible: false },
      { id: "aut", lawyerRank: "AUTHORIZED", isResponsible: false },
    ];
    const plan = planCaseDriftFix(lawyers);
    expect(plan.kind).toBe("ZERO_RESPONSIBLE");
    expect(plan.isDrift).toBe(true);
    expect(plan.responsibleBefore).toBe(0);
    expect(plan.keepId).toBe("aut"); // AUTHORIZED > LAWYER
    expect(plan.demoteIds).toEqual([]); // kimse sorumlu değildi → demote yok
  });

  it("0 sorumlu, tek avukat → o avukat promote edilir", () => {
    const plan = planCaseDriftFix([{ id: "solo", lawyerRank: "INTERN", isResponsible: false }]);
    expect(plan.kind).toBe("ZERO_RESPONSIBLE");
    expect(plan.keepId).toBe("solo");
    expect(plan.demoteIds).toEqual([]);
  });

  it(">1 sorumlu → MULTI_RESPONSIBLE, önceliğe göre 1 koru, gerisi demote", () => {
    const lawyers: DriftCaseLawyer[] = [
      { id: "law", lawyerRank: "LAWYER", isResponsible: true },
      { id: "par", lawyerRank: "PARTNER", isResponsible: true },
      { id: "x", lawyerRank: "AUTHORIZED", isResponsible: false },
    ];
    const plan = planCaseDriftFix(lawyers);
    expect(plan.kind).toBe("MULTI_RESPONSIBLE");
    expect(plan.isDrift).toBe(true);
    expect(plan.responsibleBefore).toBe(2);
    expect(plan.keepId).toBe("par"); // PARTNER, sorumlular arasında en öncelikli
    expect(plan.demoteIds).toEqual(["law"]); // diğer sorumlu düşürülür; sorumlu-olmayan x'e dokunulmaz
  });

  it(">1 sorumlu, keepId DAİMA mevcut sorumlulardan biri olur (sorumlu-olmayan yükseltilmez)", () => {
    const lawyers: DriftCaseLawyer[] = [
      { id: "r1", lawyerRank: "LAWYER", isResponsible: true },
      { id: "r2", lawyerRank: "LAWYER", isResponsible: true },
      { id: "high", lawyerRank: "PARTNER", isResponsible: false }, // daha yüksek rank ama sorumlu DEĞİL
    ];
    const plan = planCaseDriftFix(lawyers);
    expect(["r1", "r2"]).toContain(plan.keepId); // PARTNER 'high' SEÇİLMEZ
    expect(plan.keepId).toBe("r1"); // eş rank sorumlular → İLK
    expect(plan.demoteIds).toEqual(["r2"]);
  });

  it("tüm sorumlular eş rank → İLK kayıt korunur, gerisi demote", () => {
    const lawyers: DriftCaseLawyer[] = [
      { id: "first", lawyerRank: "MANAGER", isResponsible: true },
      { id: "second", lawyerRank: "MANAGER", isResponsible: true },
      { id: "third", lawyerRank: "MANAGER", isResponsible: true },
    ];
    const plan = planCaseDriftFix(lawyers);
    expect(plan.keepId).toBe("first");
    expect(plan.demoteIds).toEqual(["second", "third"]);
  });
});

describe("parseDriftRepairArgs — scope/yazma kilidi (backfill sözleşmesi)", () => {
  it("--tenant <id> → dry-run, tek tenant", () => {
    const o = parseDriftRepairArgs(["--tenant", "t1"]);
    expect(o).toMatchObject({ apply: false, tenantId: "t1", allTenants: false });
  });

  it("--all-tenants → dry-run, global", () => {
    const o = parseDriftRepairArgs(["--all-tenants"]);
    expect(o).toMatchObject({ apply: false, allTenants: true });
    expect(o.tenantId).toBeUndefined();
  });

  it("scope verilmezse → throw (zorunlu)", () => {
    expect(() => parseDriftRepairArgs([])).toThrow(/Scope zorunlu/);
  });

  it("--tenant + --all-tenants birlikte → throw", () => {
    expect(() => parseDriftRepairArgs(["--tenant", "t1", "--all-tenants"])).toThrow(/aynı anda/);
  });

  it("--apply --tenant <id> → izinli (tek tenant yazımı kilitsiz)", () => {
    const o = parseDriftRepairArgs(["--apply", "--tenant", "t1"]);
    expect(o).toMatchObject({ apply: true, tenantId: "t1" });
  });

  it("--apply --all-tenants (confirm yok) → throw (global yazım kilidi)", () => {
    expect(() => parseDriftRepairArgs(["--apply", "--all-tenants"])).toThrow(/confirm-prod-backfill/);
  });

  it("--apply --all-tenants --confirm-prod-backfill → izinli", () => {
    const o = parseDriftRepairArgs(["--apply", "--all-tenants", "--confirm-prod-backfill"]);
    expect(o).toMatchObject({ apply: true, allTenants: true, confirmProd: true });
  });

  it("--out <path> okunur", () => {
    const o = parseDriftRepairArgs(["--all-tenants", "--out", "rapor.json"]);
    expect(o.out).toBe("rapor.json");
  });
});

describe("runDriftRepair — deterministik sıralama (orderBy wiring)", () => {
  it("lawyers select'i orderBy [createdAt ASC, id ASC] içerir (eşit-rank tie-break deterministik, örtük DB sırası YOK)", async () => {
    let captured: any;
    const prisma = {
      case: {
        findMany: async (args: any) => {
          captured = args;
          return [];
        },
      },
      $transaction: async (fn: any) => fn({ caseLawyer: { update: async () => ({}) } }),
    };
    const opts = parseDriftRepairArgs(["--all-tenants"]); // dry-run
    const report = await runDriftRepair(prisma as any, opts, {});

    expect(captured.select.lawyers.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(report.scannedCases).toBe(0); // mock boş döndü → query şekli kanıtlandı, yazma yok
  });
});
