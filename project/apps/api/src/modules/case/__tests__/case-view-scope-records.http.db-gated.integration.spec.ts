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
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CaseCollateralModule } from "../../case-collateral/case-collateral.module";
import { CaseInstrumentModule } from "../../case-instrument/case-instrument.module";
import { CaseJudgmentModule } from "../../case-judgment/case-judgment.module";
import { CaseLeaseModule } from "../../case-lease/case-lease.module";
import { CASE_VIEW_ALL_KEY, CASE_VIEW_SCOPE_FLAG } from "../case-view-scope";

/**
 * F02 P3-D3b-1 (owner kararı 08.11.2026) — dosya KAYITLARININ (teminat, çek/senet, ilam, kira) dosya kimlikli okuma yolları
 * D1 dosya kapsamını dolanamaz: gerçek HTTP (dört kayıt modülü + ValidationPipe) + tek kullanımlık PostgreSQL. JWT yerine DB kimliği.
 *
 * D1 sözleşmesi aynen (yeni kural / anahtar / bayrak YOK): aktif Dosya Sorumlusu ∪ oluşturan ∪ CaseLawyer ∪ CaseStaff canView;
 * büro geneli yalnız `office.cases.view_all` ALLOW; DENY ilişkileri kaldırmaz; bayrak `OFFICE_CASE_VIEW_SCOPE_ENABLED` varsayılan KAPALI.
 *  - Dosya kimliği yoldan gelir ama güvenilmez: kapı dosyayı kiracı + kapsam ile DB'den doğrular; kapsam dışı ve yok → aynı 404,
 *    kayıt okunmadan ÖNCE (yanıtta teminat / çek / ilam / kira verisi YOK).
 *  - Kayıt–dosya uyuşmazlığı: teminat / ilam / kira tablolarında `caseId` için dosyaya yabancı anahtar YOK. Kayıt satırının kiracısı
 *    dosyanınkinden farklı olabilir ya da satır var olmayan dosyayı gösterebilir → dosya kiracısı ve varlığı belirleyicidir (404).
 *  - Bayrak kapalı: davranış bugünküyle aynı (ilişkisiz kişi = ALLOW'lu kişi).
 *  - Mevcut işlem yetkisi ayrıca korunur: VIEWER yazma reddi (ViewerWriteDenyGuard) değişmez; yazım uçları kapsam kapısı taşımaz.
 * Kod okuması gerçek erişim kanıtı değildir; bu spec yalnız yalıtılmış DB'deki davranışı ölçer.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Case record view scope requires TEST_DATABASE_URL in CI.");
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

/** D3b-1 kapsamındaki 8 GET (talimat R01; kod okumasıyla doğrulandı). Hepsi deterministik → bayrak kapalı eşitlikte gövde de karşılaştırılır. */
const ROUTES: Array<{ name: string; path: (id: string) => string; list: boolean }> = [
  { name: "case-collaterals/case/:caseId", path: (id) => `/case-collaterals/case/${id}`, list: true },
  { name: "case-collaterals/case/:caseId/total", path: (id) => `/case-collaterals/case/${id}/total`, list: false },
  { name: "case-instruments/case/:caseId", path: (id) => `/case-instruments/case/${id}`, list: true },
  { name: "case-instruments/case/:caseId/total", path: (id) => `/case-instruments/case/${id}/total`, list: false },
  { name: "case-judgments/case/:caseId", path: (id) => `/case-judgments/case/${id}`, list: true },
  { name: "case-judgments/case/:caseId/total", path: (id) => `/case-judgments/case/${id}/total`, list: false },
  { name: "case-leases/case/:caseId", path: (id) => `/case-leases/case/${id}`, list: true },
  { name: "case-leases/case/:caseId/debt", path: (id) => `/case-leases/case/${id}/debt`, list: false },
];
const LISTS = ROUTES.filter((r) => r.list);

describeDb("F02 P3-D3b-1 — dosya kayıtlarının dosya kimlikli okuma yolları dosya görünüm kapsamı (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const suffix = randomUUID().slice(0, 8);
  const tA = `test-recscope-a-${suffix}`;
  const tB = `test-recscope-b-${suffix}`;
  const ORPHAN = `yok-dosya-${suffix}`; // kayıt satırının gösterdiği ama var olmayan dosya kimliği
  const originalFlag = process.env[CASE_VIEW_SCOPE_FLAG];
  let db: PrismaClient;
  let app: INestApplication;

  const u = { admin: "", resp: "", creator: "", link: "", staff: "", noView: "", passiveCard: "", allow: "", deny: "", nobody: "", viewer: "" };
  const v = { allow: "" };
  const c: Record<string, string> = {};
  /** Etiket → kayıt metni ve tutarı (tutarlar toplam uçlarındaki sızıntıyı ayırt eder). */
  const AMT: Record<string, number> = { c1: 1111, c3: 3333, c4: 4444, c5: 5555, c6: 6666, c7: 7777, b1: 8181, crossB: 2222, orphan: 9999 };
  const mark = (kind: string, tag: string) => `${kind}-${tag}-${suffix}`;
  const recordIds: Record<string, string> = {};

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    const identity = new DbUserIdentityGuard(() => db);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), CaseCollateralModule, CaseInstrumentModule, CaseJudgmentModule, CaseLeaseModule],
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
    const mkUser = async (tenantId: string, label: string, role: "ADMIN" | "USER" | "VIEWER" = "USER") =>
      (await db.user.create({ data: { tenantId, email: `${label}-${suffix}@example.test`, name: label, surname: "RS", role } })).id;
    u.admin = await mkUser(tA, "admin", "ADMIN");
    for (const k of ["resp", "creator", "link", "staff", "noView", "passiveCard", "allow", "deny", "nobody"] as const) u[k] = await mkUser(tA, k);
    u.viewer = await mkUser(tA, "viewer", "VIEWER");
    v.allow = await mkUser(tB, "b-allow");

    const lawyer = async (userId: string, isActive = true) => (await db.lawyer.create({ data: { tenantId: tA, userId, name: "Av", surname: "RS", isActive } })).id;
    const staff = async (userId: string) => (await db.staffMember.create({ data: { tenantId: tA, userId, firstName: "Per", lastName: "RS", staffType: "DIGER" } })).id;
    const L = { resp: await lawyer(u.resp), link: await lawyer(u.link), passive: await lawyer(u.passiveCard, false), deny: await lawyer(u.deny), viewer: await lawyer(u.viewer) };
    const S = { staff: await staff(u.staff), noView: await staff(u.noView) };

    const mkCase = async (key: string, tenantId: string, data: Record<string, unknown> = {}) => {
      c[key] = (await db.case.create({ data: { tenantId, fileNumber: `RS-${key}-${suffix}`, type: "GENERAL_EXECUTION", ...data } as never })).id;
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
    await db.caseLawyer.create({ data: { caseId: c.c4, lawyerId: L.viewer } });
    await db.caseLawyer.create({ data: { caseId: c.c7, lawyerId: L.passive } });
    await db.caseLawyer.create({ data: { caseId: c.b1, lawyerId: L.link } }); // ilişki–dosya uyuşmazlığı: büro A kartı, büro B dosyası
    await db.caseStaff.create({ data: { caseId: c.c5, staffMemberId: S.staff, roleOnCase: "KONTROL", canView: true } });
    await db.caseStaff.create({ data: { caseId: c.c6, staffMemberId: S.noView, roleOnCase: "ARSIV", canView: false } });

    /** Dört kayıt türü; `instrument` false → çek/senet yazılmaz (CaseInstrument.caseId dosyaya yabancı anahtar taşır). */
    const records = async (tag: string, tenantId: string, caseId: string, instrument = true) => {
      const amount = AMT[tag];
      recordIds[`col-${tag}`] = (
        await db.caseCollateral.create({ data: { tenantId, caseId, collateralType: "IPOTEK", description: mark("TEM", tag), collateralAmount: amount } })
      ).id;
      if (instrument) {
        await db.caseInstrument.create({
          data: { tenantId, caseId, instrumentType: "CEK", serialNo: mark("CEK", tag), amount, issueDate: new Date("2026-01-15T00:00:00.000Z") },
        });
      }
      await db.caseJudgment.create({ data: { tenantId, caseId, courtName: mark("ILAM", tag), decisionDate: new Date("2026-02-01T00:00:00.000Z"), judgmentAmount: amount } as never });
      await db.caseLease.create({
        data: { tenantId, caseId, propertyAddress: mark("KIRA", tag), startDate: new Date("2026-03-01T00:00:00.000Z"), monthlyRent: amount, rentPeriods: [{ amount, isPaid: false }] } as never,
      });
    };
    for (const k of ["c1", "c3", "c4", "c5", "c6", "c7"]) await records(k, tA, c[k]);
    await records("b1", tB, c.b1);
    await db.caseCollateral.create({
      data: { tenantId: tB, caseId: c.c4, collateralType: "IPOTEK", description: mark("TEM", "crossB"), collateralAmount: AMT.crossB },
    }); // çapraz kiracılı kayıt satırı: büro B satırı, büro A dosyası
    await db.caseInstrument.create({
      data: { tenantId: tB, caseId: c.c4, instrumentType: "CEK", serialNo: mark("CEK", "crossB"), amount: AMT.crossB, issueDate: new Date("2026-01-15T00:00:00.000Z") },
    });
    await records("orphan", tA, ORPHAN, false); // var olmayan dosyayı gösteren büro A satırları

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
      await db.caseCollateral.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.caseInstrument.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.caseJudgment.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.caseLease.deleteMany({ where: { tenantId } }).catch(() => undefined);
    }
    for (const tenantId of [tA, tB]) {
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
  const leaks = (tags: string[]) => tags.flatMap((t) => [mark("TEM", t), mark("CEK", t), mark("ILAM", t), mark("KIRA", t), String(AMT[t])]);

  /** Kapsam reddi: 404 "Dosya bulunamadı"; yanıtta dosya numarası / kimliği ya da kayıt verisi (metin, tutar) YOK. */
  const expectDenied = (res: request.Response, caseKey: string | null, hidden: string[]) => {
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Dosya bulunamadı");
    expect(Object.keys(res.body).sort()).toEqual(["error", "message", "statusCode"]);
    const text = JSON.stringify(res.body);
    if (caseKey) {
      expect(text).not.toContain(`RS-${caseKey}-${suffix}`);
      expect(text).not.toContain(c[caseKey]);
    }
    for (const s of leaks(hidden)) expect(text).not.toContain(s);
  };
  /** Kapı geçti: 200 ve kapı / kapsam izi yok. */
  const expectPassed = (res: request.Response) => {
    expect(res.status).toBe(200);
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

    it("karakterizasyon: ilişkisiz kişi kapsam dışı dosyanın kayıtlarını, büro B kişisi büro A dosyasındaki büro B satırını, var olmayan dosyayı gösteren satırlar da bugünkü gibi okunur", async () => {
      for (const r of LISTS) expect(JSON.stringify((await get(u.nobody, r.path(c.c6))).body)).toMatch(new RegExp(`-c6-${suffix}`));
      expect((await get(u.nobody, `/case-collaterals/case/${c.c6}/total`)).body).toEqual({ totalAmount: AMT.c6, count: 1 });
      expect(JSON.stringify((await get(v.allow, `/case-collaterals/case/${c.c4}`)).body)).toContain(mark("TEM", "crossB"));
      expect(JSON.stringify((await get(u.allow, `/case-collaterals/case/${ORPHAN}`)).body)).toContain(mark("TEM", "orphan"));
      // Handler bugün dosya varlığını denetlemez: var olmayan dosya 200 + boş sonuç (bayrak açıkkenki 404 kapıdan gelir).
      const none = await get(u.allow, `/case-instruments/case/yok-${suffix}/total`);
      expect([none.status, none.body]).toEqual([200, { total: 0 }]);
    });

    describe("eşitlik: bayrak kapalı ilişkisiz kişi = bayrak açık ALLOW'lu kişi", () => {
      beforeAll(() => {
        process.env[CASE_VIEW_SCOPE_FLAG] = "true";
      });
      afterAll(() => {
        delete process.env[CASE_VIEW_SCOPE_FLAG];
      });
      it("karşılaştırma bayrak açıkken ve 8 kayıtla koşar", () => {
        expect(process.env[CASE_VIEW_SCOPE_FLAG]).toBe("true");
        expect(Object.keys(flagOff)).toHaveLength(ROUTES.length);
      });
      it.each(ROUTES.map((r) => [r.name, r] as const))("%s: aynı durum kodu ve aynı gövde", async (name, r) => {
        const res = await get(u.allow, r.path(c.c6));
        expect(res.status).toBe(flagOff[name].status);
        expect(JSON.stringify(res.body)).toBe(flagOff[name].body);
      });
    });
  });

  describe("bayrak AÇIK — kapı kayıt okunmadan ÖNCE çalışır", () => {
    beforeAll(() => {
      process.env[CASE_VIEW_SCOPE_FLAG] = "true";
    });

    it.each(ROUTES.map((r) => [r.name, r] as const))("%s: ilişkisiz kişi 404 (veri sızmaz); CaseLawyer geçer", async (_n, r) => {
      expectDenied(await get(u.nobody, r.path(c.c6)), "c6", ["c6"]);
      expectDenied(await get(u.nobody, r.path(c.c4)), "c4", ["c4", "crossB"]);
      expectPassed(await get(u.link, r.path(c.c4)));
    });

    it("D1 dalları kayıtlarda aynen: Dosya Sorumlusu, oluşturan, CaseStaff canView geçer; canView=false, pasif kart, ADMIN rolü 404", async () => {
      const col = (x: string, k: string) => get(x, `/case-collaterals/case/${c[k]}`);
      for (const [actor, k] of [[u.resp, "c1"], [u.creator, "c3"], [u.staff, "c5"]] as const) {
        const res = await col(actor, k);
        expectPassed(res);
        expect(JSON.stringify(res.body)).toContain(mark("TEM", k));
      }
      expectDenied(await col(u.noView, "c6"), "c6", ["c6"]);
      expectDenied(await col(u.passiveCard, "c7"), "c7", ["c7"]);
      expectDenied(await col(u.admin, "c4"), "c4", ["c4"]);
    });

    it("liste kapsamla aynı: kapsam içi kişi yalnız o dosyanın, kendi kiracısının kayıtlarını alır; ALLOW kapsam dışı dosyanınkini alır", async () => {
      for (const r of LISTS) {
        const text = JSON.stringify((await get(u.link, r.path(c.c4))).body);
        expect(text).toMatch(new RegExp(`-c4-${suffix}`));
        expect(text).not.toMatch(new RegExp(`-(c6|crossB|orphan)-${suffix}`));
        expect(JSON.stringify((await get(u.allow, r.path(c.c6))).body)).toMatch(new RegExp(`-c6-${suffix}`));
      }
      expect((await get(u.link, `/case-collaterals/case/${c.c4}/total`)).body).toEqual({ totalAmount: AMT.c4, count: 1 });
      expect((await get(u.link, `/case-instruments/case/${c.c4}/total`)).body).toEqual({ total: AMT.c4 });
    });

    it("ALLOW + DENY → DENY baskın ama C4 ilişkisi KALIR; büro B ALLOW büro A dosyasına 404, kendi dosyasına geçer", async () => {
      expectPassed(await get(u.deny, `/case-leases/case/${c.c4}`));
      expectDenied(await get(u.deny, `/case-judgments/case/${c.c6}`), "c6", ["c6"]);
      expectDenied(await get(v.allow, `/case-leases/case/${c.c4}`), "c4", ["c4"]);
      const own = await get(v.allow, `/case-collaterals/case/${c.b1}`);
      expectPassed(own);
      expect(JSON.stringify(own.body)).toContain(mark("TEM", "b1"));
    });

    it("ilişki–dosya uyuşmazlığı: büro A kartının büro B dosyasındaki CaseLawyer satırı kayıt erişimi üretmez", async () => {
      for (const r of ROUTES) expectDenied(await get(u.link, r.path(c.b1)), "b1", ["b1"]);
    });

    it("kayıt–dosya uyuşmazlığı: büro A dosyasındaki büro B kayıt satırı büro B kişisine açılmaz (dosya kiracısı belirleyici)", async () => {
      for (const p of ["case-collaterals", "case-instruments"]) {
        expectDenied(await get(v.allow, `/${p}/case/${c.c4}`), "c4", ["c4", "crossB"]);
        expectDenied(await get(v.allow, `/${p}/case/${c.c4}/total`), "c4", ["c4", "crossB"]);
      }
    });

    it("kayıt–dosya uyuşmazlığı: var olmayan dosyayı gösteren satırlar ALLOW'lu kişiye de açılmaz (dosya varlığı belirleyici)", async () => {
      for (const r of ROUTES.filter((x) => !x.name.startsWith("case-instruments"))) expectDenied(await get(u.allow, r.path(ORPHAN)), null, ["orphan"]);
    });

    it("var olmayan dosya kimliği kapsam dışıyla AYNI 404 gövdesini alır (8 uç)", async () => {
      const out = await get(u.nobody, `/case-collaterals/case/${c.c6}`);
      for (const r of ROUTES) {
        const missing = await get(u.allow, r.path(`yok-${suffix}`));
        expect([r.name, missing.status, missing.body]).toEqual([r.name, 404, out.body]);
      }
    });

    it("mevcut işlem yetkisi ayrıca korunur: VIEWER kapsam içi dosyayı okur, kapsam dışına 404 alır; yazma reddi (403) değişmez", async () => {
      expectPassed(await get(u.viewer, `/case-judgments/case/${c.c4}`));
      expectDenied(await get(u.viewer, `/case-judgments/case/${c.c6}`), "c6", ["c6"]);
      const write = await request(app.getHttpServer())
        .post("/case-collaterals")
        .set("x-test-user-id", u.viewer)
        .send({ caseId: c.c4, collateralType: "IPOTEK", description: "viewer-yazma" });
      expect([write.status, write.body.code]).toEqual([403, "VIEWER_WRITE_DENIED"]);
      expect(await db.caseCollateral.count({ where: { tenantId: tA, description: "viewer-yazma" } })).toBe(0);
    });

    it("D3b-2 ile kapandı: kendi kimlikli `:id` okuması da kapsam dışı kişiye kaydın kendi 404'ünü verir (ayrıntı D3b-2 spec'inde)", async () => {
      const res = await get(u.nobody, `/case-collaterals/${recordIds["col-c6"]}`);
      expect([res.status, res.body.message]).toEqual([404, "Teminat bulunamadi"]);
      expect(JSON.stringify(res.body)).not.toContain(mark("TEM", "c6"));
    });
  });
});
