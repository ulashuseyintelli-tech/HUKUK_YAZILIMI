/** 2b / KI-048: actual TaskController/service, scope resolver, audit writer and disposable PostgreSQL.
 * Only JWT cryptography is replaced by a DB-backed test identity seam. No live DB/provider is used. */
import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import * as request from "supertest";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { PrismaService } from "../../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { WorkScopePermissionService } from "../../work-scope-permission/work-scope-permission.service";
import { TaskController } from "../task.controller";
import { TaskService } from "../task.service";
import { TASK_VIEW_ALL_KEY, TASK_VIEW_SCOPE_FLAG } from "../task-view-scope";

const databaseUrl = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !databaseUrl) throw new Error("Task cancellation acceptance requires TEST_DATABASE_URL in CI.");
const describeDb = databaseUrl ? describe : describe.skip;

class DbIdentity implements CanActivate {
  constructor(private readonly db: PrismaClient) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const actor = await this.db.user.findFirst({ where: { id: String(req.headers["x-test-user-id"]), isActive: true } });
    if (!actor) throw new UnauthorizedException();
    req.user = actor;
    return true;
  }
}

describeDb("2b / KI-048 — reasoned task cancellation (real HTTP/disposable DB)", () => {
  jest.setTimeout(120_000);
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const tenant = `test-task-cancel-${suffix}`, otherTenant = `test-task-cancel-other-${suffix}`;
  const tenants = [tenant, otherTenant];
  const originalFlag = process.env[TASK_VIEW_SCOPE_FLAG];
  const u = { creator: "", admin: "", assigned: "", stranger: "", viewer: "", inactive: "", foreign: "", partner: "", manager: "" };
  let db: PrismaClient, app: INestApplication, service: TaskService;
  let caseId: string, otherCaseId: string;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const module = await Test.createTestingModule({ controllers: [TaskController], providers: [
      TaskService, WorkScopePermissionService, AuditService, { provide: PrismaService, useValue: db },
    ] }).overrideGuard(JwtAuthGuard).useValue(new DbIdentity(db)).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    service = app.get(TaskService);
    for (const id of tenants) await db.tenant.create({ data: { id, name: id, slug: id } });
    for (const key of Object.keys(u) as Array<keyof typeof u>) {
      u[key] = (await db.user.create({ data: { tenantId: key === "foreign" ? otherTenant : tenant,
        email: `${key}-${suffix}@example.test`, name: key, surname: "2b", role: key === "admin" ? "ADMIN" : key === "viewer" ? "VIEWER" : "USER", isActive: key !== "inactive" } })).id;
    }
    caseId = (await db.case.create({ data: { tenantId: tenant, fileNumber: `2b-${suffix}`, type: "GENERAL_EXECUTION" } })).id;
    otherCaseId = (await db.case.create({ data: { tenantId: otherTenant, fileNumber: `2b-other-${suffix}`, type: "GENERAL_EXECUTION" } })).id;
    for (const rank of ["PARTNER", "MANAGER"] as const) {
      const lawyer = await db.lawyer.create({ data: { tenantId: tenant, userId: u[rank === "PARTNER" ? "partner" : "manager"], lawyerRank: rank, name: rank, surname: "2b" } });
      await db.caseLawyer.create({ data: { caseId, lawyerId: lawyer.id } });
    }
  });

  beforeEach(async () => {
    delete process.env[TASK_VIEW_SCOPE_FLAG];
    await db.permissionGrant.deleteMany({ where: { tenantId: tenant, permissionKey: TASK_VIEW_ALL_KEY } });
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env[TASK_VIEW_SCOPE_FLAG]; else process.env[TASK_VIEW_SCOPE_FLAG] = originalFlag;
    await app?.close();
    if (db) {
      await db.taskCancellationEvent.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.auditLog.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.task.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.permissionGrant.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.caseLawyer.deleteMany({ where: { caseId: { in: [caseId, otherCaseId].filter(Boolean) } } });
      await db.case.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.lawyer.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.user.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.tenant.deleteMany({ where: { id: { in: tenants } } });
      await db.$disconnect();
    }
  });

  const task = (data: Record<string, unknown> = {}) => db.task.create({ data: {
    tenantId: tenant, caseId, createdById: u.creator, title: "2b cancellation", status: "PENDING", ...data,
  } as any });
  const cancel = (id: string, actor = u.creator, body: unknown = { reason: "Plan değişti" }) =>
    request(app.getHttpServer()).post(`/tasks/${id}/cancel`).set("x-test-user-id", actor).send(body as any);
  const history = (id: string, actor = u.creator, query = "") =>
    request(app.getHttpServer()).get(`/tasks/${id}/cancellations${query}`).set("x-test-user-id", actor);
  const snapshot = async (id: string) => JSON.stringify(await Promise.all([
    db.task.findUnique({ where: { id } }), db.taskCancellationEvent.findMany({ where: { taskId: id }, orderBy: { id: "asc" } }),
    db.auditLog.findMany({ where: { tenantId: tenant, entityType: "TASK", entityId: id }, orderBy: { id: "asc" } }),
    db.escalationEvent.findMany({ where: { taskId: id }, orderBy: { id: "asc" } }),
    db.caseTaskEscalationEvent.findMany({ where: { taskId: id }, orderBy: { id: "asc" } }),
  ]));
  async function denied(id: string, req: PromiseLike<request.Response>, status: number) {
    const before = await snapshot(id);
    const result = await req;
    expect(result.status).toBe(status);
    expect(await snapshot(id)).toBe(before);
    return result;
  }

  it("creator cancels atomically, keeps task/escalation histories and stores raw reason only in domain", async () => {
    const row = await task({ status: "IN_PROGRESS" });
    await db.escalationEvent.create({ data: { tenantId: tenant, taskId: row.id, eventType: "TIER_ADVANCED", toLevel: "STAFF" } });
    await db.caseTaskEscalationEvent.create({ data: { tenantId: tenant, taskId: row.id, caseId, eventType: "TIER_ADVANCED", toLevel: "RESPONSIBLE" } });
    const reason = "Talep sahibiyle değerlendirildi <script>secret</script>";
    const res = await cancel(row.id, u.creator, { reason: `  ${reason}  ` });
    expect(res.status).toBe(201);
    expect(res.body.task).toMatchObject({ id: row.id, status: "CANCELLED", createdById: u.creator });
    const event = await db.taskCancellationEvent.findUniqueOrThrow({ where: { id: res.body.cancellationId } });
    expect(event).toMatchObject({ tenantId: tenant, taskId: row.id, actorUserId: u.creator, actorRole: "USER", authoritySource: "CREATOR", fromStatus: "IN_PROGRESS", toStatus: "CANCELLED", reason });
    const logs = await db.auditLog.findMany({ where: { tenantId: tenant, entityId: row.id, action: "TASK_CANCELLED" } });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(reason);
    expect(logs[0].metadata).toMatchObject({ cancellationId: event.id, reasonHash: createHash("sha256").update(reason).digest("hex") });
    expect(await db.escalationEvent.count({ where: { taskId: row.id } })).toBe(1);
    expect(await db.caseTaskEscalationEvent.count({ where: { taskId: row.id } })).toBe(1);
  });

  it("same-tenant ADMIN retains cancellation when current scope flag is off", async () => {
    const row = await task({ createdById: null });
    expect((await cancel(row.id, u.admin)).status).toBe(201);
    expect(await db.taskCancellationEvent.findFirst({ where: { taskId: row.id } })).toMatchObject({ actorUserId: u.admin, authoritySource: "ADMIN" });
  });

  it("ADMIN does not bypass enabled object scope", async () => {
    process.env[TASK_VIEW_SCOPE_FLAG] = "true";
    const row = await task();
    await denied(row.id, cancel(row.id, u.admin), 404);
  });

  it("view_all ALLOW supplies scope but ADMIN supplies the separate action authority", async () => {
    process.env[TASK_VIEW_SCOPE_FLAG] = "true";
    await db.permissionGrant.create({ data: { tenantId: tenant, subjectUserId: u.admin, permissionKey: TASK_VIEW_ALL_KEY, effect: "ALLOW", scope: "GLOBAL" } });
    expect((await cancel((await task()).id, u.admin)).status).toBe(201);
  });

  it("DENY overrides ALLOW and keeps an unrelated ADMIN outside scope", async () => {
    process.env[TASK_VIEW_SCOPE_FLAG] = "true";
    for (const effect of ["ALLOW", "DENY"] as const) await db.permissionGrant.create({ data: { tenantId: tenant, subjectUserId: u.admin, permissionKey: TASK_VIEW_ALL_KEY, effect, scope: "GLOBAL" } });
    const row = await task();
    await denied(row.id, cancel(row.id, u.admin), 404);
  });

  it.each(["assigned", "partner", "manager", "stranger"] as const)("%s does not gain cancellation from assignment/title/case access", async key => {
    process.env[TASK_VIEW_SCOPE_FLAG] = "true";
    const row = await task({ assigneeId: u[key] });
    await denied(row.id, cancel(row.id, u[key]), 403);
  });

  it("view_all USER still has no cancellation action on somebody else's task", async () => {
    process.env[TASK_VIEW_SCOPE_FLAG] = "true";
    await db.permissionGrant.create({ data: { tenantId: tenant, subjectUserId: u.stranger, permissionKey: TASK_VIEW_ALL_KEY, effect: "ALLOW", scope: "GLOBAL" } });
    const row = await task();
    await denied(row.id, cancel(row.id, u.stranger), 403);
  });

  it("VIEWER cannot cancel even their own task", async () => {
    const row = await task({ createdById: u.viewer });
    await denied(row.id, cancel(row.id, u.viewer), 403);
  });

  it("inactive account is denied at HTTP and direct service entry", async () => {
    const row = await task({ createdById: u.inactive });
    await denied(row.id, cancel(row.id, u.inactive), 401);
    const before = await snapshot(row.id);
    await expect(service.cancel(tenant, row.id, u.inactive, { reason: "test" })).rejects.toMatchObject({ status: 403 });
    expect(await snapshot(row.id)).toBe(before);
  });

  it("foreign-tenant actor cannot cancel or read history", async () => {
    const row = await task();
    await denied(row.id, cancel(row.id, u.foreign), 404);
    await denied(row.id, history(row.id, u.foreign), 404);
  });

  it("server rejects a task whose actual case belongs to another tenant", async () => {
    const row = await task({ caseId: otherCaseId });
    await denied(row.id, cancel(row.id), 404);
  });

  it.each([{}, { reason: "  " }, { reason: "x".repeat(2001) }, { reason: { text: "not string" } }, { reason: "a\u0000b" }])("invalid reason is rejected without any record change (%#)", async body => {
    const row = await task();
    await denied(row.id, cancel(row.id, u.creator, body), 400);
  });

  it("request cannot forge actor, tenant, status or authority source", async () => {
    const row = await task();
    await denied(row.id, cancel(row.id, u.assigned, { reason: "test", userId: u.admin, tenantId: tenant, toStatus: "CANCELLED", authoritySource: "ADMIN" }), 400);
  });

  it("legacy physical DELETE cannot remove task or escalation records", async () => {
    const row = await task();
    await db.escalationEvent.create({ data: { tenantId: tenant, taskId: row.id, eventType: "TIER_ADVANCED", toLevel: "STAFF" } });
    await denied(row.id, request(app.getHttpServer()).delete(`/tasks/${row.id}`).set("x-test-user-id", u.admin), 405);
  });

  it("generic PUT cannot bypass reason/action checks with a mixed cancellation payload", async () => {
    const row = await task();
    await denied(row.id, request(app.getHttpServer()).put(`/tasks/${row.id}`).set("x-test-user-id", u.assigned).send({ status: "CANCELLED", assigneeId: u.assigned, title: "Changed" }), 400);
  });

  it("generic create cannot create CANCELLED without history", async () => {
    const before = await db.task.count({ where: { tenantId: tenant } });
    const res = await request(app.getHttpServer()).post("/tasks").set("x-test-user-id", u.creator).send({ title: "Bad initial cancellation", status: "CANCELLED" });
    expect(res.status).toBe(400);
    expect(await db.task.count({ where: { tenantId: tenant } })).toBe(before);
  });

  it("unchanged CANCELLED round trip changes ordinary fields without recancelling", async () => {
    const row = await task();
    expect((await cancel(row.id)).status).toBe(201);
    const events = await db.taskCancellationEvent.findMany({ where: { taskId: row.id } });
    const res = await request(app.getHttpServer()).put(`/tasks/${row.id}`).set("x-test-user-id", u.creator).send({ title: "New title", status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "CANCELLED", title: "New title" });
    expect(await db.taskCancellationEvent.findMany({ where: { taskId: row.id } })).toEqual(events);
    expect(await db.auditLog.count({ where: { entityId: row.id, action: "TASK_CANCELLED" } })).toBe(1);
  });

  it("normal completion/reopening survive and later cancellation appends, never overwrites history", async () => {
    const row = await task();
    expect((await cancel(row.id, u.creator, { reason: "İlk iptal" })).status).toBe(201);
    await service.update(tenant, row.id, u.creator, { status: "COMPLETED" } as any);
    expect(await db.task.findUnique({ where: { id: row.id } })).toMatchObject({ status: "COMPLETED", completedByUserId: u.creator, resolutionType: "MANUAL" });
    const cancelled = await cancel(row.id, u.creator, { reason: "İkinci iptal" });
    expect(cancelled.status).toBe(201);
    expect(await db.taskCancellationEvent.findUnique({ where: { id: cancelled.body.cancellationId } })).toMatchObject({ fromStatus: "COMPLETED", previousCompletedByUserId: u.creator, previousResolutionType: "MANUAL" });
    await service.update(tenant, row.id, u.creator, { status: "PENDING" } as any);
    expect(await db.task.findUnique({ where: { id: row.id } })).toMatchObject({ status: "PENDING", completedAt: null, completedByUserId: null, resolutionType: null });
    expect((await db.taskCancellationEvent.findMany({ where: { taskId: row.id }, orderBy: { createdAt: "asc" } })).map(event => event.reason)).toEqual(["İlk iptal", "İkinci iptal"]);
  });

  it("real audit insert failure rolls back task, domain history and success audit", async () => {
    const row = await task();
    const before = await snapshot(row.id);
    const name = `task2b_audit_fault_${suffix}`;
    await db.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tenantId" = '${tenant}' AND NEW."action" = 'TASK_CANCELLED' THEN RAISE EXCEPTION 'task2b injected audit failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
    try { expect((await cancel(row.id)).status).toBe(500); } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "AuditLog"`);
      await db.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
    expect(await snapshot(row.id)).toBe(before);
  });

  it("concurrent cancellation commits once; loser conflicts without duplicate history/audit", async () => {
    const row = await task();
    const responses = await Promise.all([cancel(row.id, u.creator, { reason: "A" }), cancel(row.id, u.creator, { reason: "B" })]);
    expect(responses.map(res => res.status).sort()).toEqual([201, 409]);
    expect(await db.taskCancellationEvent.count({ where: { taskId: row.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: row.id, action: "TASK_CANCELLED" } })).toBe(1);
  });

  it("history read is scoped, paginated and contains no raw AuditLog payload", async () => {
    const row = await task();
    expect((await cancel(row.id)).status).toBe(201);
    await service.update(tenant, row.id, u.creator, { status: "PENDING" } as any);
    expect((await cancel(row.id)).status).toBe(201);
    process.env[TASK_VIEW_SCOPE_FLAG] = "true";
    await denied(row.id, history(row.id, u.stranger), 404);
    const first = await history(row.id, u.creator, "?page=1&limit=1"), second = await history(row.id, u.creator, "?page=2&limit=1");
    expect(first.status).toBe(200); expect(second.status).toBe(200);
    expect(first.body.meta).toMatchObject({ total: 2, page: 1, limit: 1, totalPages: 2 });
    expect(first.body.data).toHaveLength(1); expect(second.body.data).toHaveLength(1);
    expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    expect(first.body.data[0]).toMatchObject({ actorName: "creator 2b", fromStatus: "PENDING", toStatus: "CANCELLED" });
    for (const field of ["metadata", "oldValues", "newValues"]) expect(first.body.data[0]).not.toHaveProperty(field);
    expect((await history(row.id, u.creator, "?limit=101")).status).toBe(400);
    expect((await history(row.id, u.creator, "?page=0")).status).toBe(400);
  });

  it("database binds event tenant to actual task and restricts deletion after cancellation", async () => {
    const row = await task();
    await expect(db.taskCancellationEvent.create({ data: { tenantId: otherTenant, taskId: row.id, actorUserId: u.foreign, actorRole: "USER", authoritySource: "CREATOR", fromStatus: "PENDING", reason: "wrong tenant" } })).rejects.toMatchObject({ code: "P2003" });
    expect((await cancel(row.id)).status).toBe(201);
    const before = await snapshot(row.id);
    await expect(db.task.delete({ where: { id: row.id } })).rejects.toMatchObject({ code: "P2003" });
    expect(await snapshot(row.id)).toBe(before);
  });
});
