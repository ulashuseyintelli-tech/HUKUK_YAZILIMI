/**
 * ASSIGN-4b drift onarımı — saf karar (planCaseDriftFix) + argüman kilidi (parseDriftRepairArgs).
 *
 * Kararın create() dedupe'iyle BİREBİR aynı olduğunu (planResponsible REUSE) ve 4 durumun
 * doğru sınıflandığını kanıtlar. Yazma (runDriftRepair) DB e2e ile doğrulanır (rfa016 deseni).
 */
import {
  planCaseDriftFix,
  parseDriftRepairArgs,
  runDriftRepair,
  DRIFT_AUDIT_SOURCE,
  DriftCaseLawyer,
} from "../case-responsible-drift.core";

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

describe("runDriftRepair — APPLY yazımı + D2 audit (mock prisma, DB'siz)", () => {
  function mockPrisma(cases: unknown[]) {
    const updates: any[] = [];
    const audits: any[] = [];
    const prisma = {
      case: { findMany: async () => cases },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          caseLawyer: { update: async (a: any) => { updates.push(a); } },
          auditLog: { create: async (a: any) => { audits.push(a.data); } },
        }),
    };
    return { prisma, updates, audits };
  }
  const opts = { apply: true, tenantId: "t1", allTenants: false, confirmProd: false };

  it("MULTI → diğer sorumlu demote + tek DEMOTE audit (keepId zaten sorumlu → keep-audit yok)", async () => {
    const { prisma, updates, audits } = mockPrisma([
      { id: "c1", fileNumber: "F1", tenantId: "t1", lawyers: [
        { id: "r1", isResponsible: true, lawyer: { lawyerRank: "PARTNER" } },
        { id: "r2", isResponsible: true, lawyer: { lawyerRank: "LAWYER" } },
      ] },
    ]);
    const rep = await runDriftRepair(prisma as never, opts, {});
    expect(rep.appliedDemotes).toBe(1);
    expect(updates).toHaveLength(2); // keepId(no-op update) + 1 demote
    // keepId(r1, PARTNER) zaten sorumlu → audit YOK; yalnız r2 demote → audit
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ entityType: "CASE_LAWYER", entityId: "r2", action: "UPDATE" });
    expect(audits[0].newValues.reason).toBe("DRIFT_REPAIR_DEMOTE");
    expect(audits[0].metadata.source).toBe(DRIFT_AUDIT_SOURCE);
    expect(audits[0].metadata.caseId).toBe("c1");
  });

  it("ZERO → öncelikli promote + tek PROMOTE audit", async () => {
    const { prisma, audits } = mockPrisma([
      { id: "c2", fileNumber: "F2", tenantId: "t1", lawyers: [
        { id: "a", isResponsible: false, lawyer: { lawyerRank: "LAWYER" } },
        { id: "b", isResponsible: false, lawyer: { lawyerRank: "AUTHORIZED" } },
      ] },
    ]);
    await runDriftRepair(prisma as never, opts, {});
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ entityId: "b", action: "UPDATE" }); // AUTHORIZED > LAWYER
    expect(audits[0].newValues.reason).toBe("DRIFT_REPAIR_PROMOTE");
    expect(audits[0].metadata.source).toBe(DRIFT_AUDIT_SOURCE);
  });

  it("DRY-RUN → ne update ne audit", async () => {
    const { prisma, updates, audits } = mockPrisma([
      { id: "c3", fileNumber: "F3", tenantId: "t1", lawyers: [
        { id: "x", isResponsible: true, lawyer: { lawyerRank: "PARTNER" } },
        { id: "y", isResponsible: true, lawyer: { lawyerRank: "LAWYER" } },
      ] },
    ]);
    await runDriftRepair(prisma as never, { ...opts, apply: false }, {});
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("OK (tam 1 sorumlu) → drift yok, update/audit yok", async () => {
    const { prisma, updates, audits } = mockPrisma([
      { id: "c4", fileNumber: "F4", tenantId: "t1", lawyers: [
        { id: "p", isResponsible: true, lawyer: { lawyerRank: "PARTNER" } },
        { id: "q", isResponsible: false, lawyer: { lawyerRank: "LAWYER" } },
      ] },
    ]);
    const rep = await runDriftRepair(prisma as never, opts, {});
    expect(rep.driftCases).toBe(0);
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
});
