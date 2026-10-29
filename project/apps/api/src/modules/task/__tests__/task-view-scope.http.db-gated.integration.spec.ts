/**
 * F02-B dilim 3 — GET /tasks görünüm kapsamı: gerçek HTTP (TaskController + ValidationPipe) + tek kullanımlık PostgreSQL.
 * Owner kararları (29–30.10.2026):
 *  - Anahtar `office.tasks.view_all` (F02-B-1 #3047); DENY > ALLOW > NONE. ALLOW → büro geneli.
 *  - Varsayılan kapsam = atanan ∪ oluşturan ∪ dosya bağı (CaseLawyer / CaseStaff canView). Dosyasız görev yalnız
 *    atanan/oluşturan. ADMIN rolü, rütbe, ReportingLine kapsam ÜRETMEZ.
 *  - Geçiş G3: etkinleştirme ayrı yayın kararı → bayrak `OFFICE_TASK_VIEW_SCOPE_ENABLED`; KAPALI iken bugünkü davranış
 *    (büro geneli) KORUNUR ve karakterize edilir. Masraf bayrağından ayrı (kademeli).
 *  - data, meta.total VE meta.summary aynı kapsamda daralır; `assigneeId/status/taskCategory` süzgeçleri kapsamla KESİŞİR.
 * Kapsam dışı kaydın varlığı sızmaz (200 + boş data, total 0, sıfır sayaçlar). Aktörsüz servis çağrısı FAIL-CLOSED 403.
 * Desen: task-list-pagination spec (TestIdentityGuard; istekler sıralı).
 */

import { CanActivate, ExecutionContext, ForbiddenException, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
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
if (process.env.CI && !databaseUrl) throw new Error("Task view scope requires TEST_DATABASE_URL in CI.");
const describeDb = databaseUrl ? describe : describe.skip;

class TestIdentityGuard implements CanActivate {
  constructor(private readonly db: PrismaClient) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const user = await this.db.user.findFirst({ where: { id: String(req.headers["x-test-user-id"]), isActive: true } });
    if (!user) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

type Row = { id: string };
type Meta = { total: number; summary: { pending: number; inProgress: number; operationalOpen: number } };

describeDb("F02-B dilim 3 — GET /tasks görünüm kapsamı (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const tenantId = "test-taskscope-" + suffix;
  const originalFlag = process.env[TASK_VIEW_SCOPE_FLAG];
  let db: PrismaClient;
  let app: INestApplication;
  let service: TaskService;

  /** Aktörler — hepsi aynı büro. */
  const u = {
    admin: "", // ADMIN, kartsız, dosyada değil; T1/T2/T3/T4'ü OLUŞTURAN
    lawyer: "", // USER + Lawyer kartı; C1'de CaseLawyer
    staff: "", // USER + StaffMember kartı; C2'de CaseStaff canView=true
    staffNoView: "", // USER + StaffMember kartı; C3'te CaseStaff canView=false
    assignee: "", // USER kartsız; dosyasız T3'e ATANAN
    creator: "", // USER kartsız; dosyasız T5'i OLUŞTURAN
    allow: "", // USER kartsız; view_all ALLOW
    allowDeny: "", // USER kartsız; ALLOW + DENY (DENY baskın)
    nobody: "", // USER kartsız; hiçbir bağ yok
  };
  const c = { c1: "", c2: "", c3: "" };
  const t = { t1: "", t2: "", t3: "", t4: "", t5: "" };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const module = await Test.createTestingModule({
      controllers: [TaskController],
      providers: [TaskService, WorkScopePermissionService, AuditService, { provide: PrismaService, useValue: db }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new TestIdentityGuard(db))
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    service = app.get(TaskService);

    await db.tenant.create({ data: { id: tenantId, name: tenantId, slug: tenantId } });
    const mkUser = async (label: string, role: "ADMIN" | "USER" = "USER") =>
      (await db.user.create({ data: { tenantId, email: `${label}-${suffix}@example.test`, name: label, surname: "TS", role } })).id;
    u.admin = await mkUser("admin", "ADMIN");
    for (const k of ["lawyer", "staff", "staffNoView", "assignee", "creator", "allow", "allowDeny", "nobody"] as const) u[k] = await mkUser(k);
    for (const k of ["c1", "c2", "c3"] as const) {
      c[k] = (await db.case.create({ data: { tenantId, fileNumber: `TS-${k}-${suffix}`, type: "GENERAL_EXECUTION" } })).id;
    }
    const lawyer = await db.lawyer.create({ data: { tenantId, userId: u.lawyer, name: "Av", surname: "TS" } });
    await db.caseLawyer.create({ data: { caseId: c.c1, lawyerId: lawyer.id } });
    const staff = await db.staffMember.create({ data: { tenantId, userId: u.staff, firstName: "Per", lastName: "TS", staffType: "DIGER" } });
    await db.caseStaff.create({ data: { caseId: c.c2, staffMemberId: staff.id, roleOnCase: "KONTROL", canView: true } });
    const staffNoView = await db.staffMember.create({ data: { tenantId, userId: u.staffNoView, firstName: "Per2", lastName: "TS", staffType: "DIGER" } });
    await db.caseStaff.create({ data: { caseId: c.c3, staffMemberId: staffNoView.id, roleOnCase: "ARSIV", canView: false } });

    const grant = (subjectUserId: string, effect: "ALLOW" | "DENY") =>
      db.permissionGrant.create({ data: { tenantId, subjectUserId, permissionKey: TASK_VIEW_ALL_KEY, effect, scope: "GLOBAL" } });
    await grant(u.allow, "ALLOW");
    await grant(u.allowDeny, "ALLOW");
    await grant(u.allowDeny, "DENY");

    const mkTask = async (title: string, data: Record<string, unknown>) =>
      (await db.task.create({ data: { tenantId, title: `${title} ${suffix}`, createdById: u.admin, ...data } as never })).id;
    t.t1 = await mkTask("T1 dosya C1", { caseId: c.c1, status: "PENDING", taskCategory: "LEGAL_WORKFLOW" });
    t.t2 = await mkTask("T2 dosya C2", { caseId: c.c2, status: "IN_PROGRESS", taskCategory: "OPERATIONAL_COMPLETENESS" });
    t.t3 = await mkTask("T3 dosyasız atanan", { caseId: null, assigneeId: u.assignee, status: "PENDING", taskCategory: "OPERATIONAL_COMPLETENESS" });
    t.t4 = await mkTask("T4 dosya C3", { caseId: c.c3, status: "COMPLETED", taskCategory: "LEGAL_WORKFLOW" });
    t.t5 = await mkTask("T5 dosyasız oluşturan", { caseId: null, createdById: u.creator, status: "PENDING", taskCategory: "LEGAL_WORKFLOW" });
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env[TASK_VIEW_SCOPE_FLAG];
    else process.env[TASK_VIEW_SCOPE_FLAG] = originalFlag;
    await app?.close();
    await db.permissionGrant.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.task.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.staffMember.deleteMany({ where: { tenantId } }).catch(() => undefined); // Tenant FK yok
    await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await db.$disconnect();
  });

  const list = async (actor: string, query = "") => {
    const res = await request(app.getHttpServer()).get(`/tasks${query}`).set("x-test-user-id", actor);
    expect(res.status).toBe(200);
    const body = res.body as { data: Row[]; meta: Meta };
    return { ids: body.data.map((r) => r.id).sort(), total: body.meta.total, summary: body.meta.summary };
  };
  const ids = (...keys: Array<keyof typeof t>) => keys.map((k) => t[k]).sort();
  const ALL = () => ids("t1", "t2", "t3", "t4", "t5");

  describe("bayrak KAPALI (varsayılan) — bugünkü davranış karakterize edilir", () => {
    beforeAll(() => {
      delete process.env[TASK_VIEW_SCOPE_FLAG];
    });

    it("kartsız, bağsız USER büro genelini görür; total ve summary büro geneli (etkinleştirme ayrı yayın kararı)", async () => {
      const r = await list(u.nobody);
      expect(r.ids).toEqual(ALL());
      expect(r.total).toBe(5);
      expect(r.summary).toEqual({ pending: 3, inProgress: 1, operationalOpen: 2 });
    });

    it("aktörsüz servis çağrısı bayrak kapalıyken büro genelini döner (mevcut çağıranlar kırılmaz)", async () => {
      const r = await service.findAll(tenantId, {});
      expect(r.data.map((x) => x.id).sort()).toEqual(ALL());
    });
  });

  describe("bayrak AÇIK — kapsam data + total + summary'ye birlikte uygulanır", () => {
    beforeAll(() => {
      process.env[TASK_VIEW_SCOPE_FLAG] = "true";
    });

    it("ADMIN rolü kapsam üretmez: kartsız ADMIN yalnız OLUŞTURDUĞU görevleri görür (T5 görünmez)", async () => {
      const r = await list(u.admin);
      expect(r.ids).toEqual(ids("t1", "t2", "t3", "t4"));
      expect(r.total).toBe(4);
      expect(r.summary).toEqual({ pending: 2, inProgress: 1, operationalOpen: 2 });
    });

    it("avukat kartı + CaseLawyer → yalnız o dosyanın görevleri; summary aynı kapsamda", async () => {
      const r = await list(u.lawyer);
      expect(r.ids).toEqual(ids("t1"));
      expect(r.total).toBe(1);
      expect(r.summary).toEqual({ pending: 1, inProgress: 0, operationalOpen: 0 });
    });

    it("personel kartı + CaseStaff(canView=true) → o dosya; canView=false → hiçbir şey (200 + boş, total 0, sıfır sayaçlar)", async () => {
      expect((await list(u.staff)).ids).toEqual(ids("t2"));
      const none = await list(u.staffNoView);
      expect(none).toEqual({ ids: [], total: 0, summary: { pending: 0, inProgress: 0, operationalOpen: 0 } });
    });

    it("dosyasız görev yalnız atanan / oluşturan üzerinden görünür; bağsız USER hiçbir şey görmez", async () => {
      expect((await list(u.assignee)).ids).toEqual(ids("t3"));
      expect((await list(u.creator)).ids).toEqual(ids("t5"));
      expect(await list(u.nobody)).toEqual({ ids: [], total: 0, summary: { pending: 0, inProgress: 0, operationalOpen: 0 } });
    });

    it("view_all ALLOW → büro geneli; ALLOW + DENY → DENY baskın → varsayılan kapsam (burada boş)", async () => {
      const a = await list(u.allow);
      expect(a.ids).toEqual(ALL());
      expect(a.summary).toEqual({ pending: 3, inProgress: 1, operationalOpen: 2 });
      expect(await list(u.allowDeny)).toEqual({ ids: [], total: 0, summary: { pending: 0, inProgress: 0, operationalOpen: 0 } });
    });

    it("süzgeçler kapsamla KESİŞİR: assigneeId / status / taskCategory kapsam dışına çıkamaz", async () => {
      expect((await list(u.lawyer, `?assigneeId=${u.assignee}`)).ids).toEqual([]);
      expect((await list(u.allow, `?assigneeId=${u.assignee}`)).ids).toEqual(ids("t3"));
      expect((await list(u.admin, `?status=PENDING`)).ids).toEqual(ids("t1", "t3"));
      expect((await list(u.lawyer, `?taskCategory=OPERATIONAL_COMPLETENESS`)).ids).toEqual([]);
      // status süzgeci summary'yi değiştirmez (F01-A sözleşmesi) ama summary yine kapsam içindedir
      expect((await list(u.admin, `?status=COMPLETED`)).summary).toEqual({ pending: 2, inProgress: 1, operationalOpen: 2 });
    });

    it("FAIL-CLOSED: aktör kimliği olmadan servis çağrısı 403 TASK_VIEW_SCOPE_UNRESOLVED", async () => {
      await expect(service.findAll(tenantId, {})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.findAll(tenantId, {})).rejects.toMatchObject({ response: { code: "TASK_VIEW_SCOPE_UNRESOLVED" } });
    });
  });
});
