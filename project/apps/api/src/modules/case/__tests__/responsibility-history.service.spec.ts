/**
 * WP-1d-4c-1 — ResponsibilityHistoryService (READ-ONLY timeline) testleri.
 * AuditLog'tan sorumluluk DEĞİŞİM olaylarını üretir; yanlış kesinlik yok; tenant-scoped.
 */

import { NotFoundException } from "@nestjs/common";
import { ResponsibilityHistoryService } from "../responsibility-history.service";

const D = (s: string) => new Date(s);

function mkPrisma(opts: {
  ownerRows?: any[];
  clRows?: any[];
  junction?: Record<string, { caseId: string; lawyerId: string } | null>;
  caseExists?: boolean;
} = {}) {
  const { ownerRows = [], clRows = [], junction = {}, caseExists = true } = opts;
  const findMany = jest.fn(({ where }: any) =>
    Promise.resolve(where.entityType === "CASE" ? ownerRows : where.entityType === "CASE_LAWYER" ? clRows : []),
  );
  return {
    prisma: {
      case: { findFirst: jest.fn().mockResolvedValue(caseExists ? { id: "c1" } : null) },
      auditLog: { findMany },
      caseLawyer: { findUnique: jest.fn(({ where }: any) => Promise.resolve(junction[where.id] ?? null)) },
    },
    findMany,
  };
}

const OWNER = [
  { id: "o1", entityId: "c1", createdAt: D("2026-01-01"), userId: "admin", action: "UPDATE", metadata: { changeType: "OPERATION_OWNER_INITIALIZED" }, oldValues: {}, newValues: { responsibleLawyerId: "law1" } },
  { id: "o2", entityId: "c1", createdAt: D("2026-02-01"), userId: "admin", action: "UPDATE", metadata: { changeType: "OPERATION_OWNER" }, oldValues: { responsibleLawyerId: "law1" }, newValues: { responsibleStaffId: "staff1" } },
];
const CL = [
  { id: "l1", entityId: "cl1", createdAt: D("2026-03-01"), userId: "u1", action: "CREATE", metadata: { caseId: "c1" }, oldValues: {}, newValues: { lawyerId: "law2", isResponsible: true } },
  { id: "l2", entityId: "cl2", createdAt: D("2026-04-01"), userId: "u2", action: "UPDATE", metadata: {}, oldValues: { isResponsible: false }, newValues: { isResponsible: true } },
  { id: "l3", entityId: "cl9", createdAt: D("2026-05-01"), userId: "u3", action: "CREATE", metadata: { caseId: "other-case" }, oldValues: {}, newValues: { lawyerId: "lawX", isResponsible: true } },
];
const JUNCTION = { cl2: { caseId: "c1", lawyerId: "law3" } };

describe("WP-1d-4c-1 ResponsibilityHistoryService", () => {
  it("(1+2) operation owner: initialized + changed olayları old/new + EVENT_CONFIRMED", async () => {
    const { prisma } = mkPrisma({ ownerRows: OWNER });
    const svc = new ResponsibilityHistoryService(prisma as any);
    const res = await svc.getResponsibilityHistory("t1", "c1", { type: "operationOwner" });
    expect(res.events).toHaveLength(2);
    expect(res.events[0]).toMatchObject({ type: "operationOwner", confidence: "EVENT_CONFIRMED", oldValue: { type: "NONE", id: null }, newValue: { type: "LAWYER", id: "law1" } });
    expect(res.events[1]).toMatchObject({ oldValue: { type: "LAWYER", id: "law1" }, newValue: { type: "STAFF", id: "staff1" } });
  });

  it("(3) legal EVENT_CONFIRMED (metadata.caseId===caseId)", async () => {
    const { prisma } = mkPrisma({ clRows: [CL[0]] });
    const svc = new ResponsibilityHistoryService(prisma as any);
    const res = await svc.getResponsibilityHistory("t1", "c1", { type: "legalResponsibleLawyer" });
    expect(res.events).toHaveLength(1);
    expect(res.events[0]).toMatchObject({ type: "legalResponsibleLawyer", confidence: "EVENT_CONFIRMED", newValue: { type: "LAWYER", id: "law2" } });
  });

  it("(4) legal INFERRED (metadata.caseId yok, junction çözüyor) includeInferred=true iken döner", async () => {
    const { prisma } = mkPrisma({ clRows: [CL[1]], junction: JUNCTION });
    const svc = new ResponsibilityHistoryService(prisma as any);
    const res = await svc.getResponsibilityHistory("t1", "c1", { type: "legalResponsibleLawyer" });
    expect(res.events).toHaveLength(1);
    expect(res.events[0]).toMatchObject({ confidence: "INFERRED_FROM_SNAPSHOT", newValue: { type: "LAWYER", id: "law3" } });
  });

  it("(5) includeInferred=false → inferred olay ATLANIR (yalnız EVENT_CONFIRMED)", async () => {
    const { prisma } = mkPrisma({ clRows: [CL[0], CL[1]], junction: JUNCTION });
    const svc = new ResponsibilityHistoryService(prisma as any);
    const all = await svc.getResponsibilityHistory("t1", "c1", { type: "legalResponsibleLawyer", includeInferred: true });
    const confirmedOnly = await svc.getResponsibilityHistory("t1", "c1", { type: "legalResponsibleLawyer", includeInferred: false });
    expect(all.events).toHaveLength(2);
    expect(confirmedOnly.events).toHaveLength(1);
    expect(confirmedOnly.events.every((e) => e.confidence === "EVENT_CONFIRMED")).toBe(true);
  });

  it("(6) from/to → auditLog.findMany createdAt aralığıyla çağrılır", async () => {
    const { prisma, findMany } = mkPrisma({ ownerRows: OWNER });
    const svc = new ResponsibilityHistoryService(prisma as any);
    await svc.getResponsibilityHistory("t1", "c1", { type: "operationOwner", from: D("2026-01-15"), to: D("2026-03-15") });
    const where = findMany.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ gte: D("2026-01-15"), lte: D("2026-03-15") });
  });

  it("(7+8) type filtresi: operationOwner sadece owner; legalResponsibleLawyer sadece legal", async () => {
    const { prisma } = mkPrisma({ ownerRows: OWNER, clRows: [CL[0]] });
    const svc = new ResponsibilityHistoryService(prisma as any);
    const ownerOnly = await svc.getResponsibilityHistory("t1", "c1", { type: "operationOwner" });
    const legalOnly = await svc.getResponsibilityHistory("t1", "c1", { type: "legalResponsibleLawyer" });
    expect(ownerOnly.events.every((e) => e.type === "operationOwner")).toBe(true);
    expect(legalOnly.events.every((e) => e.type === "legalResponsibleLawyer")).toBe(true);
  });

  it("(9) tenant boundary: başka tenant'ın CASE_LAWYER event'i (metadata.caseId=other) ATLANIR", async () => {
    const { prisma } = mkPrisma({ clRows: CL, junction: JUNCTION }); // l3 → other-case
    const svc = new ResponsibilityHistoryService(prisma as any);
    const res = await svc.getResponsibilityHistory("t1", "c1", { type: "legalResponsibleLawyer" });
    expect(res.events.map((e) => e.sourceEventId)).not.toContain("l3");
  });

  it("(9b) dosya bu tenant'ta yoksa → NotFoundException", async () => {
    const { prisma } = mkPrisma({ caseExists: false });
    const svc = new ResponsibilityHistoryService(prisma as any);
    await expect(svc.getResponsibilityHistory("t1", "c1", {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it("(boş) hiç event yok → boş liste + horizon.note", async () => {
    const { prisma } = mkPrisma({});
    const svc = new ResponsibilityHistoryService(prisma as any);
    const res = await svc.getResponsibilityHistory("t1", "c1", {});
    expect(res.events).toHaveLength(0);
    expect(res.horizon.note).toMatch(/kayıtlı sorumluluk değişimi yok|ufku/i);
  });

  it("(sıra) all → owner+legal birleşik, kronolojik (artan effectiveAt)", async () => {
    const { prisma } = mkPrisma({ ownerRows: OWNER, clRows: [CL[0]] });
    const svc = new ResponsibilityHistoryService(prisma as any);
    const res = await svc.getResponsibilityHistory("t1", "c1", {});
    const times = res.events.map((e) => e.effectiveAt);
    expect(times).toEqual([...times].sort());
    expect(res.events).toHaveLength(3); // o1, o2, l1
  });
});
