// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
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
import { CaseBalanceModule } from "../../case-balance/case-balance.module";
import { ErrorLogModule } from "../../error-log/error-log.module";
import { GroupModule } from "../../group/group.module";
import { MetricsRegistryModule } from "../../metrics-registry/metrics-registry.module";
import { CaseModule } from "../case.module";
import { CASE_VIEW_ALL_KEY, CASE_VIEW_SCOPE_FLAG } from "../case-view-scope";

/**
 * F02 P3-D3 (owner kararı 08.11.2026) — dosya ALT KAYNAĞI okuma yolları D1 / D2 dosya kapsamını dolanamaz: gerçek HTTP
 * (CaseModule + DebtorModule + CaseBalanceModule + GroupModule + ValidationPipe) + tek kullanımlık PostgreSQL. JWT yerine DB kimliği.
 *
 * D1 sözleşmesi aynen: aktif Dosya Sorumlusu ∪ oluşturan ∪ CaseLawyer ∪ CaseStaff canView; büro geneli yalnız `office.cases.view_all`
 * ALLOW; DENY ilişkileri kaldırmaz; bayrak `OFFICE_CASE_VIEW_SCOPE_ENABLED` varsayılan KAPALI.
 *  - Dosya kimliği yoldan gelir ama güvenilmez: kapı kiracı + kapsam ile DB'den doğrular; kapsam dışı ve yok → aynı 404, alt kaynak
 *    okunmadan ÖNCE (yanıtta not / borçlu / grup / avukat verisi YOK).
 *  - Alt kaynak satırı başka kiracının dosyasına bağlıysa (çapraz kiracı CaseLawyer) dosya kiracısı belirleyicidir → 404.
 *  - Bayrak kapalı: davranış bugünküyle aynı (ilişkisiz kişi = ALLOW'lu kişi).
 * Kod okuması gerçek erişim kanıtı değildir; bu spec yalnız yalıtılmış DB'deki davranışı ölçer.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Case sub-resource view scope requires TEST_DATABASE_URL in CI.");
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

/** D3 kapsamındaki 18 GET (talimat R01; kod okumasıyla doğrulandı). `body`: bayrak kapalı eşitlikte gövdesi de karşılaştırılanlar. */
const ROUTES: Array<{ name: string; path: (id: string) => string; body?: boolean }> = [
  { name: "cases/:id/responsible-person", path: (id) => `/cases/${id}/responsible-person`, body: true },
  { name: "cases/:id/responsibility-at", path: (id) => `/cases/${id}/responsibility-at?asOf=2026-11-01T00:00:00.000Z` },
  { name: "cases/:id/responsibility-history", path: (id) => `/cases/${id}/responsibility-history` },
  { name: "cases/:id/notes", path: (id) => `/cases/${id}/notes`, body: true },
  { name: "cases/:id/timeline", path: (id) => `/cases/${id}/timeline` },
  { name: "cases/:id/debtors/notifications", path: (id) => `/cases/${id}/debtors/notifications`, body: true },
  { name: "cases/:id/lawyers", path: (id) => `/cases/${id}/lawyers`, body: true },
  { name: "cases/:id/staff", path: (id) => `/cases/${id}/staff`, body: true },
  { name: "cases/:id/dues", path: (id) => `/cases/${id}/dues`, body: true },
  { name: "cases/:id/collections", path: (id) => `/cases/${id}/collections` },
  { name: "cases/:id/finance-summary", path: (id) => `/cases/${id}/finance-summary` },
  { name: "cases/:id/calculation-summary", path: (id) => `/cases/${id}/calculation-summary?date=2026-11-01` },
  { name: "cases/:id/debtor-balances", path: (id) => `/cases/${id}/debtor-balances` },
  { name: "cases/:caseId/balance", path: (id) => `/cases/${id}/balance` },
  { name: "cases/:caseId/balance/ledger", path: (id) => `/cases/${id}/balance/ledger` },
  { name: "cases/:caseId/groups", path: (id) => `/cases/${id}/groups`, body: true },
  { name: "cases/:caseId/debtors", path: (id) => `/cases/${id}/debtors`, body: true },
  { name: "cases/:caseId/debtors/statistics", path: (id) => `/cases/${id}/debtors/statistics`, body: true },
];

describeDb("F02 P3-D3 — dosya alt kaynağı okuma yolları dosya görünüm kapsamı (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const suffix = randomUUID().slice(0, 8);
  const tA = `test-subscope-a-${suffix}`;
  const tB = `test-subscope-b-${suffix}`;
  const originalFlag = process.env[CASE_VIEW_SCOPE_FLAG];
  let db: PrismaClient;
  let app: INestApplication;

  const u = { admin: "", resp: "", creator: "", link: "", staff: "", noView: "", passiveCard: "", allow: "", deny: "", nobody: "" };
  const v = { allow: "" };
  const c: Record<string, string> = {};
  const MARK = { noteC4: `NOTE-C4-${suffix}`, noteC6: `NOTE-C6-${suffix}`, debtorC6: `BORCLU-C6-${suffix}`, groupC6: `GRUP-C6-${suffix}` };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    const identity = new DbUserIdentityGuard(() => db);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule, CaseBalanceModule, GroupModule],
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
    const mkUser = async (tenantId: string, label: string, role: "ADMIN" | "USER" = "USER") =>
      (await db.user.create({ data: { tenantId, email: `${label}-${suffix}@example.test`, name: label, surname: "SS", role } })).id;
    u.admin = await mkUser(tA, "admin", "ADMIN");
    for (const k of ["resp", "creator", "link", "staff", "noView", "passiveCard", "allow", "deny", "nobody"] as const) u[k] = await mkUser(tA, k);
    v.allow = await mkUser(tB, "b-allow");

    const lawyer = async (userId: string, isActive = true) => (await db.lawyer.create({ data: { tenantId: tA, userId, name: "Av", surname: "SS", isActive } })).id;
    const staff = async (userId: string) => (await db.staffMember.create({ data: { tenantId: tA, userId, firstName: "Per", lastName: "SS", staffType: "DIGER" } })).id;
    const L = { resp: await lawyer(u.resp), link: await lawyer(u.link), passive: await lawyer(u.passiveCard, false), deny: await lawyer(u.deny) };
    const S = { staff: await staff(u.staff), noView: await staff(u.noView) };

    const mkCase = async (key: string, tenantId: string, data: Record<string, unknown> = {}) => {
      c[key] = (await db.case.create({ data: { tenantId, fileNumber: `SS-${key}-${suffix}`, type: "GENERAL_EXECUTION", ...data } as never })).id;
    };
    await mkCase("c1", tA, { responsibleLawyerId: L.resp });
    await mkCase("c3", tA, { createdById: u.creator });
    await mkCase("c4", tA);
    await mkCase("c5", tA);
    await mkCase("c6", tA);
    await mkCase("c7", tA, { responsibleLawyerId: L.passive });
    await mkCase("b1", tB, { createdById: v.allow });
    await db.caseLawyer.create({ data: { caseId: c.c4, lawyerId: L.link } });
    await db.caseLawyer.create({ data: { caseId: c.c4, lawyerId: L.deny } });
    await db.caseLawyer.create({ data: { caseId: c.c7, lawyerId: L.passive } });
    await db.caseLawyer.create({ data: { caseId: c.b1, lawyerId: L.link } }); // alt kaynak–dosya uyuşmazlığı: büro A kartı, büro B dosyası
    await db.caseStaff.create({ data: { caseId: c.c5, staffMemberId: S.staff, roleOnCase: "KONTROL", canView: true } });
    await db.caseStaff.create({ data: { caseId: c.c6, staffMemberId: S.noView, roleOnCase: "ARSIV", canView: false } });

    // Alt kaynak verisi: not (CaseLifecycle NOTE_ADDED), borçlu (CaseDebtor), grup (CaseGroup).
    const note = (caseId: string, text: string) =>
      db.caseLifecycle.create({ data: { caseId, stage: "INITIAL", action: "NOTE_ADDED", description: text } as never });
    await note(c.c4, MARK.noteC4);
    await note(c.c6, MARK.noteC6);
    const debtor = await db.debtor.create({ data: { tenantId: tA, type: "COMPANY", name: MARK.debtorC6 } as never });
    await db.caseDebtor.create({ data: { caseId: c.c6, debtorId: debtor.id } as never });
    const group = await db.groupDefinition.create({ data: { tenantId: tA, name: MARK.groupC6 } as never });
    await db.caseGroup.create({ data: { caseId: c.c6, groupId: group.id } });

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
      await db.permissionGrant.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.groupDefinition.deleteMany({ where: { tenantId } } as never).catch(() => undefined);
      await db.debtor.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.staffMember.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.lawyer.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  const get = (actor: string, path: string) => request(app.getHttpServer()).get(path).set("x-test-user-id", actor);
  const SECRETS = () => [MARK.noteC6, MARK.debtorC6, MARK.groupC6];

  /** Kapsam reddi: 404 "Dosya bulunamadı"; dosya numarası, kimliği ya da alt kaynak verisi YOK. */
  const expectDenied = (res: request.Response, caseKey: string) => {
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Dosya bulunamadı");
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(`SS-${caseKey}-${suffix}`);
    expect(text).not.toContain(c[caseKey]);
    for (const s of SECRETS()) expect(text).not.toContain(s);
  };
  /** Kapı geçti: kapı reddi (404 "Dosya bulunamadı") / 401 / kapsam 403 YOK (alt kaynağın kendi kuralı başka kod verebilir). */
  const expectPassed = (res: request.Response) => {
    expect(res.status).not.toBe(401);
    expect(res.status === 404 && res.body?.message === "Dosya bulunamadı").toBe(false);
    expect(JSON.stringify(res.body ?? {})).not.toContain("CASE_VIEW_SCOPE");
  };

  describe("bayrak KAPALI (varsayılan) — bugünkü davranış ve eşitlik", () => {
    const flagOff: Record<string, { status: number; body: string }> = {};
    beforeAll(() => {
      delete process.env[CASE_VIEW_SCOPE_FLAG];
    });

    it.each(ROUTES.map((r) => [r.name, r] as const))("%s: ilişkisiz kişi kapıya takılmaz", async (name, r) => {
      const res = await get(u.nobody, r.path(c.c6));
      expectPassed(res);
      flagOff[name] = { status: res.status, body: JSON.stringify(res.body) };
    });

    it("ilişkisiz kişi bayrak kapalıyken kapsam dışı dosyanın alt kaynak verisini bugünkü gibi alır (karakterizasyon)", async () => {
      expect(JSON.stringify((await get(u.nobody, `/cases/${c.c6}/notes`)).body)).toContain(MARK.noteC6);
      expect(JSON.stringify((await get(u.nobody, `/cases/${c.c6}/debtors`)).body)).toContain(MARK.debtorC6);
      expect(JSON.stringify((await get(u.nobody, `/cases/${c.c6}/groups`)).body)).toContain(MARK.groupC6);
    });

    describe("eşitlik: bayrak kapalı ilişkisiz kişi = bayrak açık ALLOW'lu kişi", () => {
      beforeAll(() => {
        process.env[CASE_VIEW_SCOPE_FLAG] = "true";
      });
      afterAll(() => {
        delete process.env[CASE_VIEW_SCOPE_FLAG];
      });
      it("karşılaştırma bayrak açıkken ve 18 kayıtla koşar", () => {
        expect(process.env[CASE_VIEW_SCOPE_FLAG]).toBe("true");
        expect(Object.keys(flagOff)).toHaveLength(ROUTES.length);
      });
      it.each(ROUTES.map((r) => [r.name, r] as const))("%s: aynı durum kodu (deterministik uçlarda aynı gövde)", async (name, r) => {
        const res = await get(u.allow, r.path(c.c6));
        expect(res.status).toBe(flagOff[name].status);
        if (r.body) expect(JSON.stringify(res.body)).toBe(flagOff[name].body);
      });
    });
  });

  describe("bayrak AÇIK — kapı alt kaynak okunmadan ÖNCE çalışır", () => {
    beforeAll(() => {
      process.env[CASE_VIEW_SCOPE_FLAG] = "true";
    });

    it.each(ROUTES.map((r) => [r.name, r] as const))("%s: ilişkisiz kişi 404 (veri sızmaz); CaseLawyer geçer", async (_n, r) => {
      expectDenied(await get(u.nobody, r.path(c.c6)), "c6");
      expectDenied(await get(u.nobody, r.path(c.c4)), "c4");
      expectPassed(await get(u.link, r.path(c.c4)));
    });

    it("D1 dalları alt kaynakta aynen: Dosya Sorumlusu, oluşturan, CaseStaff canView geçer; canView=false, pasif kart, ADMIN rolü 404", async () => {
      const notes = (x: string, k: string) => get(x, `/cases/${c[k]}/notes`);
      expectPassed(await notes(u.resp, "c1"));
      expectPassed(await notes(u.creator, "c3"));
      expectPassed(await notes(u.staff, "c5"));
      expectDenied(await notes(u.noView, "c6"), "c6");
      expectDenied(await notes(u.passiveCard, "c7"), "c7");
      expectDenied(await notes(u.admin, "c4"), "c4");
    });

    it("liste kapsamla aynı: kapsam içi kişi yalnız o dosyanın notunu alır; ALLOW kapsam dışı dosyanın notunu alır", async () => {
      const mine = await get(u.link, `/cases/${c.c4}/notes`);
      expect(mine.status).toBe(200);
      expect(JSON.stringify(mine.body)).toContain(MARK.noteC4);
      expect(JSON.stringify(mine.body)).not.toContain(MARK.noteC6);
      expect(JSON.stringify((await get(u.allow, `/cases/${c.c6}/notes`)).body)).toContain(MARK.noteC6);
      expect(JSON.stringify((await get(u.allow, `/cases/${c.c6}/debtors`)).body)).toContain(MARK.debtorC6);
    });

    it("ALLOW + DENY → DENY baskın ama C4 ilişkisi KALIR; büro B ALLOW büro A dosyasına 404", async () => {
      expectPassed(await get(u.deny, `/cases/${c.c4}/lawyers`));
      expectDenied(await get(u.deny, `/cases/${c.c6}/groups`), "c6");
      expectDenied(await get(v.allow, `/cases/${c.c4}/notes`), "c4");
      expectPassed(await get(v.allow, `/cases/${c.b1}/notes`));
    });

    it("alt kaynak–dosya uyuşmazlığı: büro A kartının büro B dosyasındaki CaseLawyer satırı erişim üretmez (dosya kiracısı belirleyici)", async () => {
      expectDenied(await get(u.link, `/cases/${c.b1}/lawyers`), "b1");
      expectDenied(await get(u.link, `/cases/${c.b1}/notes`), "b1");
      expectDenied(await get(u.allow, `/cases/${c.b1}/debtors`), "b1");
    });

    it("var olmayan dosya kimliği kapsam dışıyla AYNI 404 gövdesini alır (alt kaynak servislerinin farklı mesajları kullanılmaz)", async () => {
      const out = await get(u.nobody, `/cases/${c.c6}/debtors`);
      for (const p of [`/cases/yok-${suffix}/debtors`, `/cases/yok-${suffix}/notes`, `/cases/yok-${suffix}/balance`]) {
        const missing = await get(u.allow, p);
        expect(missing.status).toBe(404);
        expect(missing.body).toEqual(out.body);
      }
    });

    it("reddedilen istek alt kaynak handler'ının yan etkisini üretmez: responsibility-at tanılama denetim kaydı (izinli istekte yazıldığı kanıtlanır)", async () => {
      const count = () => db.auditLog.count({ where: { tenantId: tA, action: "PERMISSION_WOULD_DENY" } });
      const t0 = await count();
      expectPassed(await get(u.link, `/cases/${c.c4}/responsibility-at`));
      const t1 = await count();
      expect(t1).toBe(t0 + 1); // yan etki gerçekten var (boş kanıt değil)
      expectDenied(await get(u.nobody, `/cases/${c.c6}/responsibility-at`), "c6");
      expect(await count()).toBe(t1);
    });
  });
});
