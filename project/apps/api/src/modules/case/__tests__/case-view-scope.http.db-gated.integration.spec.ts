// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: cl-r04-kabul9-case-inline-client.http.db-gated.integration.spec.ts).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { CanActivate, ExecutionContext, ForbiddenException, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import * as request from "supertest";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { StorageModule } from "../../../common/storage/storage.module";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ErrorLogModule } from "../../error-log/error-log.module";
import { MetricsRegistryModule } from "../../metrics-registry/metrics-registry.module";
import { CaseModule } from "../case.module";
import { CaseService } from "../case.service";
import { CASE_VIEW_ALL_KEY, CASE_VIEW_SCOPE_FLAG } from "../case-view-scope";

/**
 * F02 P3-D1 (owner kararı 07.11.2026; OFP-09 ikinci dilimi / E-2) — GET /cases ve GET /cases/:id görünüm kapsamı:
 * gerçek HTTP (CaseModule + CaseController + ValidationPipe) + tek kullanımlık PostgreSQL. JWT yerine DB kimliği
 * (x-test-user-id); pasif hesap 401 (JwtStrategy sözleşmesi).
 *
 * Owner kararları:
 *  - Varsayılan kapsam = AKTİF Dosya Sorumlusu (ilişki satırı olmasa da) ∪ oluşturan ∪ CaseLawyer ∪ CaseStaff canView.
 *  - Büro geneli yalnız AYRI `office.cases.view_all` ALLOW (mevcut grant altyapısı). DENY yalnız büro geneli genişlemeyi
 *    engeller; varsayılan dosya ilişkilerini KALDIRMAZ.
 *  - Rol (ADMIN), rütbe, ReportingLine tek başına erişim üretmez. Kapsam dışı detay 404. Aktör / izin çözümü yoksa bayrak
 *    açıkken ret (403).
 *  - Liste süzgeçleri, toplam ve sayfalama aynı kapsamı kullanır. Bayrak (OFFICE_CASE_VIEW_SCOPE_ENABLED) varsayılan KAPALI;
 *    kapalıyken bugünkü davranış (büro geneli) KORUNUR ve karakterize edilir.
 * Kod okuması gerçek erişim kanıtı değildir; bu spec yalnız yalıtılmış DB'deki davranışı ölçer.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Case view scope requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({ where: { id: String(req.headers["x-test-user-id"]) }, include: { tenant: true } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

type ListBody = { data: Array<{ id: string }>; meta: { total: number; page: number; limit: number; totalPages: number } };

describeDb("F02 P3-D1 — GET /cases + GET /cases/:id görünüm kapsamı (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const t1 = `test-casescope-a-${suffix}`;
  const t2 = `test-casescope-b-${suffix}`;
  const originalFlag = process.env[CASE_VIEW_SCOPE_FLAG];
  let db: PrismaClient;
  let app: INestApplication;
  let service: CaseService;

  /** Büro A aktörleri. */
  const u = {
    admin: "", // ADMIN, kartsız, hiçbir dosyada değil → rol kapsam üretmez
    respLawyer: "", // avukat kartı; C1'in Dosya Sorumlusu (CaseLawyer satırı YOK)
    respStaff: "", // personel kartı; C2'nin Dosya Sorumlusu (CaseStaff satırı YOK)
    creator: "", // kartsız; C3'ü OLUŞTURAN
    linkLawyer: "", // avukat kartı; C4'te CaseLawyer; ayrıca büro B'nin C9'una çapraz CaseLawyer satırı
    linkStaff: "", // personel kartı; C5'te CaseStaff canView=true
    noViewStaff: "", // personel kartı; C6'da CaseStaff canView=false
    passiveCard: "", // aktif hesap + PASİF avukat kartı; C7'nin Dosya Sorumlusu ve C7'de CaseLawyer
    passiveAccount: "", // PASİF hesap; C8'i oluşturan ve C8'in Dosya Sorumlusu (aktif kart)
    multi: "", // C10 Dosya Sorumlusu + C11 oluşturan + C12 CaseStaff canView → sayfalama
    allow: "", // kartsız; office.cases.view_all ALLOW
    deny: "", // avukat kartı; C4'te CaseLawyer; ALLOW + DENY (DENY baskın)
    taskAllow: "", // kartsız; yalnız office.tasks.view_all ALLOW → dosya kapsamı ÜRETMEZ
    nobody: "", // kartsız; hiçbir bağ yok
  };
  /** Büro B aktörü. */
  const v = { allow: "" };
  const c: Record<string, string> = {};
  /** Kart kimlikleri (süzgeç sınaması için). */
  const card = { respLawyer: "" };
  const A_ALL = () => ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "cNull", "c10", "c11", "c12", "cArchivedResp"].filter((k) => k !== "cArchivedResp").map((k) => c[k]).sort();
  const ids = (...keys: string[]) => keys.map((k) => c[k]).sort();

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => db))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    service = app.get(CaseService);

    for (const id of [t1, t2]) await db.tenant.create({ data: { id, name: id, slug: id } });
    const mkUser = async (tenantId: string, label: string, role: "ADMIN" | "USER" = "USER", isActive = true) =>
      (await db.user.create({ data: { tenantId, email: `${label}-${suffix}@example.test`, name: label, surname: "CS", role, isActive } })).id;
    u.admin = await mkUser(t1, "admin", "ADMIN");
    for (const k of ["respLawyer", "respStaff", "creator", "linkLawyer", "linkStaff", "noViewStaff", "passiveCard", "multi", "allow", "deny", "taskAllow", "nobody"] as const) {
      u[k] = await mkUser(t1, k);
    }
    u.passiveAccount = await mkUser(t1, "passiveAccount", "USER", false);
    v.allow = await mkUser(t2, "b-allow");

    const lawyer = async (tenantId: string, userId: string, isActive = true) =>
      (await db.lawyer.create({ data: { tenantId, userId, name: "Av", surname: "CS", isActive } })).id;
    const staff = async (tenantId: string, userId: string) =>
      (await db.staffMember.create({ data: { tenantId, userId, firstName: "Per", lastName: "CS", staffType: "DIGER" } })).id;
    const L = {
      resp: await lawyer(t1, u.respLawyer),
      link: await lawyer(t1, u.linkLawyer),
      passive: await lawyer(t1, u.passiveCard, false),
      passiveAccount: await lawyer(t1, u.passiveAccount),
      deny: await lawyer(t1, u.deny),
      multi: await lawyer(t1, u.multi),
    };
    card.respLawyer = L.resp;
    const S = { resp: await staff(t1, u.respStaff), link: await staff(t1, u.linkStaff), noView: await staff(t1, u.noViewStaff), multi: await staff(t1, u.multi) };

    const mkCase = async (key: string, tenantId: string, data: Record<string, unknown> = {}) => {
      c[key] = (await db.case.create({ data: { tenantId, fileNumber: `CS-${key}-${suffix}`, type: "GENERAL_EXECUTION", ...data } as never })).id;
    };
    await mkCase("c1", t1, { responsibleLawyerId: L.resp, createdById: u.admin });
    await mkCase("c2", t1, { responsibleStaffId: S.resp, status: "CLOSED" });
    await mkCase("c3", t1, { createdById: u.creator });
    await mkCase("c4", t1);
    await mkCase("c5", t1);
    await mkCase("c6", t1);
    await mkCase("c7", t1, { responsibleLawyerId: L.passive });
    await mkCase("c8", t1, { responsibleLawyerId: L.passiveAccount, createdById: u.passiveAccount });
    await mkCase("cNull", t1); // createdById NULL (eski kayıt); hiçbir ilişki yok
    await mkCase("c10", t1, { responsibleLawyerId: L.multi });
    await mkCase("c11", t1, { createdById: u.multi });
    await mkCase("c12", t1);
    await mkCase("cArchivedResp", t1, { responsibleLawyerId: L.resp, isArchived: true });
    await mkCase("c9", t2, { createdById: v.allow });
    await mkCase("c9b", t2);

    await db.caseLawyer.create({ data: { caseId: c.c4, lawyerId: L.link } });
    await db.caseLawyer.create({ data: { caseId: c.c4, lawyerId: L.deny } });
    await db.caseLawyer.create({ data: { caseId: c.c7, lawyerId: L.passive } });
    await db.caseLawyer.create({ data: { caseId: c.c9, lawyerId: L.link } }); // çapraz büro satırı: büro sınırı korunmalı
    await db.caseStaff.create({ data: { caseId: c.c5, staffMemberId: S.link, roleOnCase: "KONTROL", canView: true } });
    await db.caseStaff.create({ data: { caseId: c.c6, staffMemberId: S.noView, roleOnCase: "ARSIV", canView: false } });
    await db.caseStaff.create({ data: { caseId: c.c12, staffMemberId: S.multi, roleOnCase: "KONTROL", canView: true } });

    const grant = (tenantId: string, subjectUserId: string, permissionKey: string, effect: "ALLOW" | "DENY") =>
      db.permissionGrant.create({ data: { tenantId, subjectUserId, permissionKey, effect, scope: "GLOBAL" } });
    await grant(t1, u.allow, CASE_VIEW_ALL_KEY, "ALLOW");
    await grant(t1, u.deny, CASE_VIEW_ALL_KEY, "ALLOW");
    await grant(t1, u.deny, CASE_VIEW_ALL_KEY, "DENY");
    await grant(t1, u.taskAllow, "office.tasks.view_all", "ALLOW");
    await grant(t2, v.allow, CASE_VIEW_ALL_KEY, "ALLOW");
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env[CASE_VIEW_SCOPE_FLAG];
    else process.env[CASE_VIEW_SCOPE_FLAG] = originalFlag;
    await app?.close();
    for (const tenantId of [t1, t2]) {
      await db.permissionGrant.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.staffMember.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.lawyer.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const list = async (actor: string, query = "") => {
    const res = await http().get(`/cases${query}`).set("x-test-user-id", actor);
    expect(res.status).toBe(200);
    const body = res.body as ListBody;
    return { ids: body.data.map((r) => r.id).sort(), total: body.meta.total, meta: body.meta };
  };
  const detail = (actor: string, key: string) => http().get(`/cases/${c[key]}`).set("x-test-user-id", actor);

  describe("bayrak KAPALI (varsayılan) — bugünkü davranış karakterize edilir", () => {
    beforeAll(() => {
      delete process.env[CASE_VIEW_SCOPE_FLAG];
    });

    it("bağsız USER büro A'nın arşivsiz bütün dosyalarını görür; total aynı; büro B görünmez", async () => {
      const r = await list(u.nobody, "?limit=100");
      expect(r.ids).toEqual(A_ALL());
      expect(r.total).toBe(A_ALL().length);
      expect(r.ids).not.toContain(c.c9);
    });

    it("bağsız USER herhangi bir büro A dosyasının detayını açar; büro B dosyası 404", async () => {
      expect((await detail(u.nobody, "c6")).status).toBe(200);
      expect((await detail(u.nobody, "cNull")).status).toBe(200);
      expect((await detail(u.nobody, "c9")).status).toBe(404);
    });

    it("aktörsüz servis çağrısı bayrak kapalıyken büro genelini döner (mevcut çağıranlar kırılmaz)", async () => {
      const r = await service.findAll(t1, { limit: 100 });
      expect(r.data.map((x: { id: string }) => x.id).sort()).toEqual(A_ALL());
      await expect(service.findOneVisible(t1, c.c6)).resolves.toMatchObject({ id: c.c6 });
    });
  });

  describe("bayrak AÇIK — kapsam data + total + sayfalamaya birlikte uygulanır", () => {
    beforeAll(() => {
      process.env[CASE_VIEW_SCOPE_FLAG] = "true";
    });

    it("aktif Dosya Sorumlusu (avukat / personel) ilişki satırı OLMADAN kendi dosyasını listede ve detayda görür", async () => {
      expect(await list(u.respLawyer)).toMatchObject({ ids: ids("c1"), total: 1 });
      expect(await list(u.respStaff)).toMatchObject({ ids: ids("c2"), total: 1 });
      expect((await detail(u.respLawyer, "c1")).status).toBe(200);
      expect((await detail(u.respStaff, "c2")).status).toBe(200);
    });

    it("oluşturan kendi dosyasını görür; createdById NULL dosya ilişkisiz kişiye ve ADMIN'e görünmez", async () => {
      expect(await list(u.creator)).toMatchObject({ ids: ids("c3"), total: 1 });
      expect((await detail(u.creator, "c3")).status).toBe(200);
      expect((await detail(u.creator, "cNull")).status).toBe(404);
    });

    it("CaseLawyer ve CaseStaff(canView=true) → o dosya; canView=false → hiçbir şey", async () => {
      expect(await list(u.linkLawyer)).toMatchObject({ ids: ids("c4"), total: 1 });
      expect(await list(u.linkStaff)).toMatchObject({ ids: ids("c5"), total: 1 });
      expect(await list(u.noViewStaff)).toMatchObject({ ids: [], total: 0 });
      expect((await detail(u.noViewStaff, "c6")).status).toBe(404);
    });

    it("ADMIN rolü tek başına kapsam üretmez: yalnız OLUŞTURDUĞU C1 görünür", async () => {
      expect(await list(u.admin)).toMatchObject({ ids: ids("c1"), total: 1 });
      expect((await detail(u.admin, "c4")).status).toBe(404);
    });

    it("ilişkisiz kişi ve yalnız görev view_all izni olan kişi hiçbir dosya görmez; detay 404 (403 değil, varlık sızmaz)", async () => {
      expect(await list(u.nobody)).toMatchObject({ ids: [], total: 0 });
      expect(await list(u.taskAllow)).toMatchObject({ ids: [], total: 0 });
      const r = await detail(u.nobody, "c4");
      expect(r.status).toBe(404);
      const missing = await http().get(`/cases/yok-${suffix}`).set("x-test-user-id", u.nobody);
      expect(missing.status).toBe(404);
      expect(r.body.message).toBe(missing.body.message);
    });

    it("PASİF kart: Dosya Sorumlusu + CaseLawyer olsa da görünmez", async () => {
      expect(await list(u.passiveCard)).toMatchObject({ ids: [], total: 0 });
      expect((await detail(u.passiveCard, "c7")).status).toBe(404);
    });

    it("PASİF hesap: HTTP'de 401; servis yolunda oluşturan / Dosya Sorumlusu olsa da kapsam boş", async () => {
      expect((await http().get("/cases").set("x-test-user-id", u.passiveAccount)).status).toBe(401);
      const r = await service.findAll(t1, { limit: 100 }, u.passiveAccount);
      expect(r.data).toEqual([]);
      expect(r.meta.total).toBe(0);
      await expect(service.findOneVisible(t1, c.c8, u.passiveAccount)).rejects.toMatchObject({ status: 404 });
    });

    it("office.cases.view_all ALLOW → büro A geneli (büro B değil); ALLOW + DENY → DENY baskın ama C4 ilişkisi KALIR", async () => {
      const a = await list(u.allow, "?limit=100");
      expect(a.ids).toEqual(A_ALL());
      expect(a.total).toBe(A_ALL().length);
      expect((await detail(u.allow, "cNull")).status).toBe(200);
      expect((await detail(u.allow, "c9")).status).toBe(404);
      expect(await list(u.deny)).toMatchObject({ ids: ids("c4"), total: 1 });
      expect((await detail(u.deny, "c4")).status).toBe(200);
      expect((await detail(u.deny, "c5")).status).toBe(404);
    });

    it("iki büro: çapraz CaseLawyer satırı büro sınırını aşmaz; büro B ALLOW yalnız büro B'yi görür", async () => {
      expect((await list(u.linkLawyer, "?limit=100")).ids).not.toContain(c.c9);
      expect((await detail(u.linkLawyer, "c9")).status).toBe(404);
      const b = await list(v.allow, "?limit=100");
      expect(b.ids).toEqual(ids("c9", "c9b"));
      expect((await detail(v.allow, "c1")).status).toBe(404);
    });

    it("toplam ve sayfalama aynı kapsamda: 3 dosyalı kişi limit=2 → 2 + 1, kesişim yok, meta tutarlı", async () => {
      const p1 = await list(u.multi, "?limit=2&page=1");
      const p2 = await list(u.multi, "?limit=2&page=2");
      expect(p1.meta).toEqual({ total: 3, page: 1, limit: 2, totalPages: 2 });
      expect(p2.meta).toEqual({ total: 3, page: 2, limit: 2, totalPages: 2 });
      expect(p1.ids).toHaveLength(2);
      expect(p2.ids).toHaveLength(1);
      expect([...p1.ids, ...p2.ids].sort()).toEqual(ids("c10", "c11", "c12"));
    });

    it("süzgeçler kapsamla KESİŞİR: kapsam dışına çıkamaz; arşiv dahil süzgeci kapsam içi arşivli dosyayı ekler", async () => {
      expect(await list(u.respStaff, "?status=ACTIVE")).toMatchObject({ ids: [], total: 0 });
      expect(await list(u.respStaff, "?status=CLOSED")).toMatchObject({ ids: ids("c2"), total: 1 });
      expect(await list(u.nobody, "?noOwner=true")).toMatchObject({ ids: [], total: 0 });
      expect((await list(u.allow, "?noOwner=true&limit=100")).ids).toEqual(ids("c3", "c4", "c5", "c6", "cNull", "c11", "c12"));
      // Dosya Sorumlusu süzgeci kapsamı genişletmez: C1 linkLawyer için kapsam dışı → boş; ALLOW için C1 (arşivli kayıt hariç)
      expect(await list(u.linkLawyer, `?responsibleLawyerId=${card.respLawyer}`)).toMatchObject({ ids: [], total: 0 });
      expect(await list(u.allow, `?responsibleLawyerId=${card.respLawyer}`)).toMatchObject({ ids: ids("c1"), total: 1 });
      expect(await list(u.respLawyer, "?includeArchived=true")).toMatchObject({ ids: ids("c1", "cArchivedResp"), total: 2 });
    });

    it("FAIL-CLOSED: aktör kimliği olmadan servis çağrısı 403 CASE_VIEW_SCOPE_UNRESOLVED (liste ve detay)", async () => {
      await expect(service.findAll(t1, {})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.findAll(t1, {})).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
      await expect(service.findOneVisible(t1, c.c1)).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
    });

    it("iç findOne çağrısı (güncelleme / sayaç yolları) bu dilimde kapsamsız kalır", async () => {
      await expect(service.findOne(t1, c.c6)).resolves.toMatchObject({ id: c.c6 });
    });
  });
});
