// DebtorModule grafiği `pdf-poppler`'ı yükleyebilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import * as request from "supertest";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { StorageModule } from "../../../common/storage/storage.module";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CASE_VIEW_ALL_KEY, CASE_VIEW_SCOPE_FLAG } from "../../case/case-view-scope";
import { CaseViewScopeService } from "../../case/case-view-scope.service";
import { ErrorLogModule } from "../../error-log/error-log.module";
import { MetricsRegistryModule } from "../../metrics-registry/metrics-registry.module";
import { DebtorModule } from "../debtor.module";

/**
 * F02 P3 Bulgu 3 (09.11.2026) — web'in kullandığı dosyaya bağlı borçlu OKUMALARI D1 dosya kapsamını dolanamaz:
 * gerçek HTTP (DebtorModule + ValidationPipe) + tek kullanımlık PostgreSQL. JWT yerine DB kimliği.
 *
 * D1 sözleşmesi aynen (yeni kural / anahtar / bayrak YOK; CaseViewScopeService). Dosya SUNUCUDAKİ ilişkiden çözülür:
 *  - `case/:caseId`, `case/:caseId/:caseDebtorId`, `.../service/history` → yoldaki dosya kiracı + kapsamla doğrulanır; dosya borçlusu
 *    servis sorgusunda `id + caseId + case.tenantId` ile o dosyaya bağlıdır;
 *  - `case-debtors/:caseDebtorId/active-process-summary` → CaseDebtor satırı (aktör kiracısında) → caseId.
 * Bayrak açıkken kapsam dışı / yok → AYNI 404 gövdesi ("Dosya bulunamadı"); veri sızmaz. Bayrak kapalı: davranış bugünküyle aynı.
 * Mevcut işlem yetkisi (VIEWER yazma reddi) değişmez. Kod okuması gerçek erişim kanıtı değildir; bu spec yalnız yalıtılmış DB'deki davranışı ölçer.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Debtor case view scope requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

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

describeDb("F02 P3 Bulgu 3 — dosyaya bağlı borçlu okumaları dosya görünüm kapsamı (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const suffix = randomUUID().slice(0, 8);
  const tA = `test-dbtscope-a-${suffix}`;
  const tB = `test-dbtscope-b-${suffix}`;
  const MISSING = `yok-${suffix}`;
  const originalFlag = process.env[CASE_VIEW_SCOPE_FLAG];
  let db: PrismaClient;
  let app: INestApplication;

  const u = { resp: "", link: "", staff: "", creator: "", deny: "", allow: "", nobody: "", viewer: "" };
  const v = { allow: "" };
  const c: Record<string, string> = {};
  const cd: Record<string, string> = {};
  const mark = (k: string) => `BRC-${k}-${suffix}`;
  const fileNo = (k: string) => `DS-${k}-${suffix}`;
  const A_CASES = ["c1", "c4", "c5", "c6", "c7"];

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    const identity = new DbUserIdentityGuard(() => db);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, DebtorModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      .overrideGuard(AuthGuard("jwt"))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    for (const id of [tA, tB]) await db.tenant.create({ data: { id, name: id, slug: id } });
    const mkUser = async (tenantId: string, label: string, role: "USER" | "VIEWER" = "USER") =>
      (await db.user.create({ data: { tenantId, email: `${label}-${suffix}@example.test`, name: label, surname: "DS", role } })).id;
    for (const k of ["resp", "link", "staff", "creator", "deny", "allow", "nobody"] as const) u[k] = await mkUser(tA, k);
    u.viewer = await mkUser(tA, "viewer", "VIEWER");
    v.allow = await mkUser(tB, "b-allow");

    const lawyer = async (userId: string) => (await db.lawyer.create({ data: { tenantId: tA, userId, name: "Av", surname: "DS", isActive: true } })).id;
    const L = { resp: await lawyer(u.resp), link: await lawyer(u.link), deny: await lawyer(u.deny), viewer: await lawyer(u.viewer) };
    const S = (await db.staffMember.create({ data: { tenantId: tA, userId: u.staff, firstName: "Per", lastName: "DS", staffType: "DIGER" } })).id;

    const mkCase = async (key: string, tenantId: string, data: Record<string, unknown> = {}) => {
      c[key] = (await db.case.create({ data: { tenantId, fileNumber: fileNo(key), type: "GENERAL_EXECUTION", ...data } as never })).id;
    };
    await mkCase("c1", tA, { responsibleLawyerId: L.resp }); // Dosya Sorumlusu
    await mkCase("c4", tA); // CaseLawyer (link, deny, viewer)
    await mkCase("c5", tA); // CaseStaff canView
    await mkCase("c6", tA); // ilişkisiz
    await mkCase("c7", tA, { createdById: u.creator }); // dosyayı oluşturan
    await mkCase("b1", tB, { createdById: v.allow });
    for (const lw of [L.link, L.deny, L.viewer]) await db.caseLawyer.create({ data: { caseId: c.c4, lawyerId: lw } });
    await db.caseLawyer.create({ data: { caseId: c.b1, lawyerId: L.link } }); // ilişki–dosya uyuşmazlığı: büro A kartı, büro B dosyası
    await db.caseStaff.create({ data: { caseId: c.c5, staffMemberId: S, roleOnCase: "KONTROL", canView: true } });

    for (const k of [...A_CASES, "b1"]) {
      const tenantId = k === "b1" ? tB : tA;
      const debtor = await db.debtor.create({ data: { tenantId, type: "COMPANY", name: mark(k) } as never });
      cd[k] = (await db.caseDebtor.create({ data: { caseId: c[k], debtorId: debtor.id, quickNote: `NOT-${k}-${suffix}` } as never })).id;
      await db.serviceHistory.create({ data: { caseDebtorId: cd[k], toStatus: "SENT", actionDate: new Date("2026-10-01T00:00:00.000Z"), note: `GECMIS-${k}-${suffix}` } });
      await db.tebligat.create({
        data: { tenantId, caseId: c[k], caseDebtorId: cd[k], tebligatType: "ODEME_EMRI", addressType: "BILINEN", addressText: `ADR-${k}-${suffix}`, recipientName: mark(k), channel: "PTT" } as never,
      });
    }

    const grant = (tenantId: string, subjectUserId: string, effect: "ALLOW" | "DENY") =>
      db.permissionGrant.create({ data: { tenantId, subjectUserId, permissionKey: CASE_VIEW_ALL_KEY, effect, scope: "GLOBAL" } });
    await grant(tA, u.allow, "ALLOW");
    await grant(tA, u.deny, "ALLOW");
    await grant(tA, u.deny, "DENY");
    await grant(tB, v.allow, "ALLOW");
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env[CASE_VIEW_SCOPE_FLAG];
    else process.env[CASE_VIEW_SCOPE_FLAG] = originalFlag;
    await app?.close();
    for (const tenantId of [tA, tB]) {
      await db.tebligat.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.permissionGrant.deleteMany({ where: { tenantId } }).catch(() => undefined);
    }
    for (const tenantId of [tA, tB]) {
      await db.serviceHistory.deleteMany({ where: { caseDebtor: { case: { tenantId } } } }).catch(() => undefined);
      await db.caseDebtor.deleteMany({ where: { case: { tenantId } } }).catch(() => undefined);
      await db.debtor.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.staffMember.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.lawyer.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  const get = (actor: string, path: string) => request(app.getHttpServer()).get(path).set("x-test-user-id", actor);
  const text = (res: request.Response) => JSON.stringify(res.body ?? {});
  const on = () => (process.env[CASE_VIEW_SCOPE_FLAG] = "true");
  const off = () => delete process.env[CASE_VIEW_SCOPE_FLAG];

  /** Web'in kullandığı üç dosya kimlikli okuma + nesne kimlikli özet. `k`: dosya anahtarı (aynı dosyanın borçlusu). */
  const ROUTES: Array<{ name: string; path: (k: string) => string; ok: (res: request.Response, k: string) => boolean }> = [
    { name: "case/:caseId", path: (k) => `/debtors/case/${c[k]}?includePassive=true`, ok: (r, k) => Array.isArray(r.body.items) && text(r).includes(mark(k)) },
    { name: "case/:caseId/:caseDebtorId", path: (k) => `/debtors/case/${c[k]}/${cd[k]}`, ok: (r, k) => r.body.caseDebtorId === cd[k] && text(r).includes(mark(k)) },
    { name: "case/:caseId/:caseDebtorId/service/history", path: (k) => `/debtors/case/${c[k]}/${cd[k]}/service/history`, ok: (r, k) => text(r).includes(`GECMIS-${k}-${suffix}`) },
    { name: "case-debtors/:caseDebtorId/active-process-summary", path: (k) => `/debtors/case-debtors/${cd[k]}/active-process-summary`, ok: (r, k) => r.body.caseDebtorId === cd[k] && r.body.activeTebligatCount === 1 },
  ];
  const NOT_FOUND = { statusCode: 404, message: "Dosya bulunamadı", error: "Not Found" };
  const expectHidden = (res: request.Response, k: string) => {
    expect([res.status, res.body]).toEqual([404, NOT_FOUND]);
    expect(Object.keys(res.body).sort()).toEqual(["error", "message", "statusCode"]);
    for (const leak of [mark(k), fileNo(k), `GECMIS-${k}`, `NOT-${k}`, c[k], cd[k]]) expect(text(res)).not.toContain(leak);
  };

  describe("bayrak KAPALI — bugünkü davranış (karakterizasyon)", () => {
    beforeAll(off);

    it.each(ROUTES.map((r) => [r.name, r]))("%s: ilişkisiz kullanıcı kiracının tüm dosyalarını okur (kapsam uygulanmaz)", async (_n, r) => {
      for (const k of A_CASES) {
        const res = await get(u.nobody, r.path(k));
        expect([k, res.status, r.ok(res, k)]).toEqual([k, 200, true]);
      }
    });

    it("olmayan dosya / dosya borçlusu bugünkü servis gövdelerini alır", async () => {
      expect([(await get(u.nobody, `/debtors/case/${MISSING}`)).body.message]).toEqual(["Takip bulunamadı"]);
      expect([(await get(u.nobody, `/debtors/case/${c.c6}/${MISSING}`)).body.message]).toEqual(["Borçlu bulunamadı"]);
      expect([(await get(u.nobody, `/debtors/case/${c.c6}/${MISSING}/service/history`)).body.message]).toEqual(["Borçlu bulunamadı"]);
      expect([(await get(u.nobody, `/debtors/case-debtors/${MISSING}/active-process-summary`)).body.message]).toEqual(["Dosya borçlusu bulunamadı"]);
    });

    it("kiracı sınırı bayraktan bağımsız: büro A kullanıcısı büro B dosyasını / borçlusunu okuyamaz", async () => {
      expect((await get(u.nobody, `/debtors/case/${c.b1}`)).status).toBe(404);
      expect((await get(u.nobody, `/debtors/case/${c.b1}/${cd.b1}`)).status).toBe(404);
      expect((await get(u.nobody, `/debtors/case/${c.b1}/${cd.b1}/service/history`)).status).toBe(404);
      expect((await get(u.nobody, `/debtors/case-debtors/${cd.b1}/active-process-summary`)).status).toBe(404);
    });

    it("dosya–borçlu uyuşmazlığı bayraktan bağımsız: başka dosyanın borçlusu yoldaki dosyayla okunamaz", async () => {
      expect([(await get(u.nobody, `/debtors/case/${c.c4}/${cd.c6}`)).status]).toEqual([404]);
      expect([(await get(u.nobody, `/debtors/case/${c.c4}/${cd.c6}/service/history`)).status]).toEqual([404]);
    });
  });

  describe("bayrak kapalı ilişkisiz kullanıcı = bayrak açık büro geneli izinli kullanıcı (gövde eşitliği)", () => {
    it.each(ROUTES.map((r) => [r.name, r]))("%s", async (_n, r) => {
      off();
      const before = await get(u.nobody, r.path("c6"));
      on();
      const after = await get(u.allow, r.path("c6"));
      off();
      expect([before.status, after.status]).toEqual([200, 200]);
      expect(after.body).toEqual(before.body);
    });
  });

  describe("bayrak AÇIK — görünürlük (D1 dalları)", () => {
    beforeAll(on);
    afterAll(off);
    const VISIBLE: Array<[string, () => string, string[]]> = [
      ["Dosya Sorumlusu", () => u.resp, ["c1"]],
      ["CaseLawyer", () => u.link, ["c4"]],
      ["CaseStaff canView", () => u.staff, ["c5"]],
      ["dosyayı oluşturan", () => u.creator, ["c7"]],
      ["ALLOW + DENY (DENY baskın; ilişki kalır)", () => u.deny, ["c4"]],
      ["büro geneli ALLOW", () => u.allow, A_CASES],
      ["ilişkisiz", () => u.nobody, []],
      ["VIEWER rolü, CaseLawyer", () => u.viewer, ["c4"]],
    ];
    it.each(VISIBLE.flatMap(([ad, who, vis]) => ROUTES.map((r) => [ad, r.name, who, vis, r] as const)))("%s · %s", async (_ad, _rn, who, vis, r) => {
      for (const k of A_CASES) {
        const res = await get(who(), r.path(k));
        if (vis.includes(k)) expect([k, res.status, r.ok(res, k)]).toEqual([k, 200, true]);
        else expectHidden(res, k);
      }
    });

    it("kapsam dışı ve olmayan kaynak AYNI 404 gövdesini alır", async () => {
      const hidden = await get(u.link, ROUTES[0].path("c6"));
      expect((await get(u.link, `/debtors/case/${MISSING}`)).body).toEqual(hidden.body);
      expect((await get(u.link, `/debtors/case/${MISSING}/${cd.c4}`)).body).toEqual(hidden.body);
      expect((await get(u.link, `/debtors/case/${MISSING}/${cd.c4}/service/history`)).body).toEqual(hidden.body);
      expect((await get(u.link, `/debtors/case-debtors/${MISSING}/active-process-summary`)).body).toEqual((await get(u.link, ROUTES[3].path("c6"))).body);
      expect(hidden.body).toEqual(NOT_FOUND);
    });

    it("dosya–borçlu uyuşmazlığı: görünür dosya yoluyla başka (görünmez) dosyanın borçlusu okunamaz, verisi sızmaz", async () => {
      for (const p of [`/debtors/case/${c.c4}/${cd.c6}`, `/debtors/case/${c.c4}/${cd.c6}/service/history`]) {
        const res = await get(u.link, p);
        expect([p, res.status, res.body.message]).toEqual([p, 404, "Borçlu bulunamadı"]);
        for (const leak of [mark("c6"), `GECMIS-c6`, fileNo("c6")]) expect(text(res)).not.toContain(leak);
      }
      expectHidden(await get(u.link, `/debtors/case/${c.c6}/${cd.c4}`), "c6");
      expectHidden(await get(u.link, `/debtors/case/${c.c6}/${cd.c4}/service/history`), "c6");
    });

    it("iki kiracı: büro B izinli kullanıcı yalnız kendi dosyasını görür; büro A ilişkisi büro B dosyasını açmaz", async () => {
      for (const r of ROUTES) {
        const own = await get(v.allow, r.path("b1"));
        expect([r.name, own.status, r.ok(own, "b1")]).toEqual([r.name, 200, true]);
        expectHidden(await get(v.allow, r.path("c4")), "c4");
        expectHidden(await get(u.link, r.path("b1")), "b1");
        expectHidden(await get(u.allow, r.path("b1")), "b1");
      }
    });

    it("servis düzeyi: caseDebtor nesnesi kiracı dışında ya da yoksa görünmez", async () => {
      const svc = app.get(CaseViewScopeService);
      expect(await svc.isCaseObjectVisible(tA, u.allow, "caseDebtor", cd.c6)).toBe(true);
      expect(await svc.isCaseObjectVisible(tA, u.allow, "caseDebtor", cd.b1)).toBe(false);
      expect(await svc.isCaseObjectVisible(tA, u.allow, "caseDebtor", MISSING)).toBe(false);
      expect(await svc.isCaseObjectVisible(tA, u.nobody, "caseDebtor", cd.c6)).toBe(false);
    });

    it("mevcut işlem yetkisi değişmez: VIEWER görünür dosyada okur, yazamaz (403, not aynı)", async () => {
      expect((await get(u.viewer, ROUTES[0].path("c4"))).status).toBe(200);
      const res = await request(app.getHttpServer()).put(`/debtors/case/${c.c4}/${cd.c4}/note`).set("x-test-user-id", u.viewer).send({ text: "VIEWER-YAZDI" });
      expect(res.status).toBe(403);
      expect((await db.caseDebtor.findUnique({ where: { id: cd.c4 }, select: { quickNote: true } }))?.quickNote).toBe(`NOT-c4-${suffix}`);
    });
  });
});
