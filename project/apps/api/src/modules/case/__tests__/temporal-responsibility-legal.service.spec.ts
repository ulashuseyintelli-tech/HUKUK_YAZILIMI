/**
 * WP-1d-2 — legal-responsible-lawyer temporal query (read-only, best-effort).
 * Sözleşme: docs/wp1d-temporal-responsibility-query-contract.md §3.2/§6.
 *
 * CASE_LAWYER audit'leri kronolojik replay → asOf'taki Hukuki Sorumlu Avukat. caseId eşleme:
 * metadata.caseId (reliable→EVENT_CONFIRMED) / canlı junction (INFERRED) / eşlenemez (ignore).
 * lawyerId: CREATE/DELETE event'lerinden map + canlı junction fallback (promote/update lawyerId taşımaz).
 */

import { TemporalResponsibilityService } from "../temporal-responsibility.service";

const D = (s: string) => new Date(s);
const ASOF = D("2026-06-15T00:00:00.000Z");

const clEvent = (over: Partial<any> = {}) => ({
  id: "e1", entityId: "cl1", userId: "u1", action: "UPDATE",
  createdAt: D("2026-06-10T00:00:00.000Z"),
  metadata: { caseId: "c1" }, newValues: {}, oldValues: null,
  ...over,
});

function makeSvc(opts: { events?: any[]; horizon?: any; junctions?: Record<string, any>; snapshot?: any; caseInTenant?: any } = {}) {
  const findMany = jest.fn(async () => opts.events ?? []);
  const auditFindFirst = jest.fn(async () => opts.horizon ?? null);
  const clFindUnique = jest.fn(async ({ where }: any) => (opts.junctions ?? {})[where.id] ?? null);
  const clFindFirst = jest.fn(async () => opts.snapshot ?? null);
  const caseFindFirst = jest.fn(async () => opts.caseInTenant ?? null);
  const prisma = {
    auditLog: { findMany, findFirst: auditFindFirst },
    caseLawyer: { findUnique: clFindUnique, findFirst: clFindFirst },
    case: { findFirst: caseFindFirst },
  } as any;
  return { service: new TemporalResponsibilityService(prisma), findMany, clFindUnique, caseFindFirst };
}

describe("WP-1d-2 TemporalResponsibilityService.getLegalResponsibleLawyerAt", () => {
  it("metadata.caseId CREATE responsible → EVENT_CONFIRMED + lawyer", async () => {
    const { service } = makeSvc({ events: [clEvent({ action: "CREATE", newValues: { lawyerId: "law-1", isResponsible: true } })] });
    const r = await service.getLegalResponsibleLawyerAt("t1", "c1", ASOF);
    expect(r.legalResponsibleLawyer).toMatchObject({ lawyerId: "law-1", confidence: "EVENT_CONFIRMED" });
  });

  it("metadata.caseId UPDATE false→true → EVENT_CONFIRMED + lawyer (map'ten çözülür)", async () => {
    const { service } = makeSvc({ events: [
      clEvent({ id: "e0", action: "CREATE", createdAt: D("2026-06-09T00:00:00.000Z"), newValues: { lawyerId: "law-1", isResponsible: false } }),
      clEvent({ id: "e1", action: "UPDATE", newValues: { isResponsible: true } }),
    ] });
    const r = await service.getLegalResponsibleLawyerAt("t1", "c1", ASOF);
    expect(r.legalResponsibleLawyer).toMatchObject({ lawyerId: "law-1", confidence: "EVENT_CONFIRMED", sourceEventId: "e1" });
  });

  it("metadata.caseId UPDATE true→false → lawyer null, EVENT_CONFIRMED", async () => {
    const { service } = makeSvc({ events: [
      clEvent({ id: "e0", action: "CREATE", createdAt: D("2026-06-09T00:00:00.000Z"), newValues: { lawyerId: "law-1", isResponsible: true } }),
      clEvent({ id: "e1", action: "UPDATE", newValues: { isResponsible: false } }),
    ] });
    const r = await service.getLegalResponsibleLawyerAt("t1", "c1", ASOF);
    expect(r.legalResponsibleLawyer).toMatchObject({ lawyerId: null, confidence: "EVENT_CONFIRMED" });
  });

  it("DELETE responsible lawyer → lawyer null", async () => {
    const { service } = makeSvc({ events: [
      clEvent({ id: "e0", action: "CREATE", createdAt: D("2026-06-09T00:00:00.000Z"), newValues: { lawyerId: "law-1", isResponsible: true } }),
      clEvent({ id: "e1", action: "DELETE", oldValues: { lawyerId: "law-1", isResponsible: true } }),
    ] });
    const r = await service.getLegalResponsibleLawyerAt("t1", "c1", ASOF);
    expect(r.legalResponsibleLawyer.lawyerId).toBeNull();
  });

  it("latest event wins (sonraki responsible)", async () => {
    const { service } = makeSvc({ events: [
      clEvent({ id: "e0", entityId: "cl1", createdAt: D("2026-06-09T00:00:00.000Z"), action: "CREATE", newValues: { lawyerId: "law-1", isResponsible: true } }),
      clEvent({ id: "e1", entityId: "cl2", createdAt: D("2026-06-12T00:00:00.000Z"), action: "CREATE", newValues: { lawyerId: "law-2", isResponsible: true } }),
    ] });
    const r = await service.getLegalResponsibleLawyerAt("t1", "c1", ASOF);
    expect(r.legalResponsibleLawyer.lawyerId).toBe("law-2");
  });

  it("future-ignored + tenant boundary: query createdAt:lte=asOf + tenantId", async () => {
    const { service, findMany } = makeSvc({ events: [clEvent({ action: "CREATE", newValues: { lawyerId: "law-1", isResponsible: true } })] });
    await service.getLegalResponsibleLawyerAt("t1", "c1", ASOF);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "t1", entityType: "CASE_LAWYER", createdAt: { lte: ASOF } });
  });

  it("eski event (metadata.caseId YOK) + canlı junction eşleşir → INFERRED_FROM_SNAPSHOT + lawyer", async () => {
    const { service } = makeSvc({
      events: [clEvent({ metadata: null, action: "CREATE", newValues: { isResponsible: true } })],
      junctions: { cl1: { caseId: "c1", lawyerId: "law-9" } },
    });
    const r = await service.getLegalResponsibleLawyerAt("t1", "c1", ASOF);
    expect(r.legalResponsibleLawyer).toMatchObject({ lawyerId: "law-9", confidence: "INFERRED_FROM_SNAPSHOT" });
  });

  it("eski event + junction silinmiş (eşleşmez) → ignore → UNKNOWN_BEFORE_HORIZON", async () => {
    const { service } = makeSvc({
      events: [clEvent({ metadata: null, action: "CREATE", newValues: { isResponsible: true } })],
      junctions: {}, // findUnique null
      horizon: null,
    });
    const r = await service.getLegalResponsibleLawyerAt("t1", "c1", ASOF);
    expect(r.legalResponsibleLawyer.confidence).toBe("UNKNOWN_BEFORE_HORIZON");
  });

  it("hiç event yok → UNKNOWN_BEFORE_HORIZON", async () => {
    const { service } = makeSvc({ events: [], horizon: null });
    const r = await service.getLegalResponsibleLawyerAt("t1", "c1", ASOF);
    expect(r.legalResponsibleLawyer).toMatchObject({ lawyerId: null, confidence: "UNKNOWN_BEFORE_HORIZON" });
  });

  it("reliable event yok + asOf ufuk-içi + snapshot responsible var → INFERRED_FROM_SNAPSHOT", async () => {
    const { service } = makeSvc({
      events: [], // bu case için event yok
      horizon: clEvent({ createdAt: D("2026-06-01T00:00:00.000Z") }), // ufuk asOf'tan önce
      caseInTenant: { id: "c1" },
      snapshot: { lawyerId: "law-cur" },
    });
    const r = await service.getLegalResponsibleLawyerAt("t1", "c1", ASOF);
    expect(r.legalResponsibleLawyer).toMatchObject({ lawyerId: "law-cur", confidence: "INFERRED_FROM_SNAPSHOT" });
  });

  it("wrong caseId / cross-tenant (case bu tenant'ta yok) → UNKNOWN_BEFORE_HORIZON", async () => {
    const { service } = makeSvc({
      events: [clEvent({ metadata: { caseId: "other" }, action: "CREATE", newValues: { lawyerId: "law-x", isResponsible: true } })],
      horizon: clEvent({ createdAt: D("2026-06-01T00:00:00.000Z") }),
      caseInTenant: null, // case.findFirst tenant-scoped → eşleşmez
    });
    const r = await service.getLegalResponsibleLawyerAt("t1", "cX", ASOF);
    expect(r.legalResponsibleLawyer.confidence).toBe("UNKNOWN_BEFORE_HORIZON");
  });
});
