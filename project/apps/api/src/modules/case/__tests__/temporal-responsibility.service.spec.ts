/**
 * WP-1d-1 — operation-owner temporal query (read-only). Sözleşme: docs/wp1d-temporal-responsibility-query-contract.md §6.
 *
 * auditLog.findFirst iki amaçla çağrılır: orderBy desc = asOf'tan önceki SON owner event;
 * orderBy asc = tenant enstrümantasyon ufku (ilk owner event). Mock orderBy yönüne göre yanıt verir.
 */

import { TemporalResponsibilityService } from "../temporal-responsibility.service";

const ev = (over: Partial<any> = {}) => ({
  id: "ev-1",
  userId: "user-actor-1",
  createdAt: new Date("2026-06-10T00:00:00.000Z"),
  newValues: { responsibleLawyerId: "law-1", responsibleStaffId: null },
  ...over,
});

function makeService(opts: { latest?: any; horizon?: any; snapshot?: any } = {}) {
  const auditFindFirst = jest.fn(async (args: any) =>
    args?.orderBy?.createdAt === "desc" ? (opts.latest ?? null) : (opts.horizon ?? null),
  );
  const caseFindFirst = jest.fn(async () => opts.snapshot ?? null);
  const prisma = { auditLog: { findFirst: auditFindFirst }, case: { findFirst: caseFindFirst } } as any;
  return { service: new TemporalResponsibilityService(prisma), auditFindFirst, caseFindFirst };
}

const ASOF = new Date("2026-06-15T00:00:00.000Z");

describe("WP-1d-1 TemporalResponsibilityService.getOperationOwnerAt", () => {
  it("asOf'tan önce owner event (LAWYER) → EVENT_CONFIRMED + actor + sourceEventId", async () => {
    const { service } = makeService({ latest: ev({ id: "ev-9", userId: "u9", newValues: { responsibleLawyerId: "law-7", responsibleStaffId: null } }) });
    const r = await service.getOperationOwnerAt("t1", "c1", ASOF);
    expect(r.operationOwner).toMatchObject({
      type: "LAWYER", id: "law-7", confidence: "EVENT_CONFIRMED", sourceEventId: "ev-9", changedByUserId: "u9",
    });
  });

  it("STAFF owner event → type STAFF", async () => {
    const { service } = makeService({ latest: ev({ newValues: { responsibleLawyerId: null, responsibleStaffId: "stf-3" } }) });
    const r = await service.getOperationOwnerAt("t1", "c1", ASOF);
    expect(r.operationOwner).toMatchObject({ type: "STAFF", id: "stf-3", confidence: "EVENT_CONFIRMED" });
  });

  it("owner temizlenmiş (her ikisi null) → type NONE, EVENT_CONFIRMED", async () => {
    const { service } = makeService({ latest: ev({ newValues: { responsibleLawyerId: null, responsibleStaffId: null } }) });
    const r = await service.getOperationOwnerAt("t1", "c1", ASOF);
    expect(r.operationOwner).toMatchObject({ type: "NONE", id: null, confidence: "EVENT_CONFIRMED" });
  });

  it("latest-wins + future-ignored: query createdAt:lte=asOf + orderBy desc ister", async () => {
    const { service, auditFindFirst } = makeService({ latest: ev() });
    await service.getOperationOwnerAt("t1", "c1", ASOF);
    const where = auditFindFirst.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ lte: ASOF }); // asOf'tan sonraki event'ler dışlanır
    expect(where.tenantId).toBe("t1"); // tenant boundary
    expect(where.entityId).toBe("c1");
    expect(auditFindFirst.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" }); // latest wins
  });

  it("event yok + asOf ufuk ÖNCESİ → UNKNOWN_BEFORE_HORIZON", async () => {
    // horizon (ilk owner event) asOf'tan SONRA → asOf < horizon
    const { service } = makeService({ latest: null, horizon: ev({ createdAt: new Date("2026-06-20T00:00:00.000Z") }) });
    const r = await service.getOperationOwnerAt("t1", "c1", ASOF);
    expect(r.operationOwner).toMatchObject({ type: "UNKNOWN", id: null, confidence: "UNKNOWN_BEFORE_HORIZON" });
    expect(r.horizon.instrumentationStartedAt).toBe("2026-06-20T00:00:00.000Z");
  });

  it("hiç owner audit'i yok → UNKNOWN_BEFORE_HORIZON", async () => {
    const { service } = makeService({ latest: null, horizon: null });
    const r = await service.getOperationOwnerAt("t1", "c1", ASOF);
    expect(r.operationOwner.confidence).toBe("UNKNOWN_BEFORE_HORIZON");
  });

  it("event yok + asOf ufuk-İÇİ + snapshot owner var → INFERRED_FROM_SNAPSHOT", async () => {
    const { service } = makeService({
      latest: null,
      horizon: ev({ createdAt: new Date("2026-06-01T00:00:00.000Z") }), // ufuk asOf'tan önce
      snapshot: { responsibleLawyerId: null, responsibleStaffId: "stf-cur" },
    });
    const r = await service.getOperationOwnerAt("t1", "c1", ASOF);
    expect(r.operationOwner).toMatchObject({ type: "STAFF", id: "stf-cur", confidence: "INFERRED_FROM_SNAPSHOT" });
  });

  it("event yok + ufuk-içi + dosya bu tenant'ta YOK (cross-tenant/yanlış caseId) → UNKNOWN", async () => {
    const { service, caseFindFirst } = makeService({
      latest: null,
      horizon: ev({ createdAt: new Date("2026-06-01T00:00:00.000Z") }),
      snapshot: null, // case.findFirst tenant-scoped → eşleşmez
    });
    const r = await service.getOperationOwnerAt("t1", "cX", ASOF);
    expect(r.operationOwner.confidence).toBe("UNKNOWN_BEFORE_HORIZON");
    expect(caseFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "cX", tenantId: "t1" }, select: expect.anything() }));
  });
});
