// ClientSettlementModule grafiği `pdf-poppler`'ı yükleyebilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
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
import { CaseCollateralModule } from "../../case-collateral/case-collateral.module";
import { CaseInstrumentModule } from "../../case-instrument/case-instrument.module";
import { CaseJudgmentModule } from "../../case-judgment/case-judgment.module";
import { CaseLeaseModule } from "../../case-lease/case-lease.module";
import { ClientSettlementModule } from "../../client-settlement/client-settlement.module";
import { ErrorLogModule } from "../../error-log/error-log.module";
import { MetricsRegistryModule } from "../../metrics-registry/metrics-registry.module";
import { CASE_VIEW_ALL_KEY, CASE_VIEW_SCOPE_FLAG } from "../case-view-scope";
import { CaseViewScopeService } from "../case-view-scope.service";

/**
 * F02 P3-D3b-2 (owner kararı 08.11.2026; D2 artefakt emsali) — KENDİ kimliğiyle okunan dosya nesneleri (teminat / çek-senet /
 * ilam / kira kaydı `:id`, ücret sözleşmesi `:agreementId`, dosya–müvekkil bağı `case-client/:caseClientId`) D1 dosya kapsamını
 * dolanamaz: gerçek HTTP (dört kayıt modülü + ClientSettlementModule + ValidationPipe) + tek kullanımlık PostgreSQL. JWT yerine DB kimliği.
 *
 * D1 sözleşmesi aynen (yeni kural / anahtar / bayrak YOK). Dosya nesnenin SUNUCUDAKİ satırından çözülür:
 * kayıt → caseId; sözleşme → caseClientId → CaseClient → caseId. Nesne aktör kiracısında, dosya da aynı kiracıda ve kapsamda olmalı.
 *  - Teminat / ilam / kira `caseId`'si ve sözleşmenin `caseClientId`'si için FK YOK: başka kiracının dosyasına ya da var olmayan
 *    dosyaya / bağa işaret eden satır kapıdan geçmez.
 *  - Kapsam dışı / uyuşmaz / yok → nesnenin KENDİ servisinin 404 gövdesi (var olmayanla aynı; varlık sızmaz); bağ uçlarında "Dosya bulunamadı".
 *  - Bayrak kapalı: davranış bugünküyle aynı. Mevcut işlem yetkisi (VIEWER yazma reddi, sözleşme yönetim yetkisi) değişmez.
 * Kod okuması gerçek erişim kanıtı değildir; bu spec yalnız yalıtılmış DB'deki davranışı ölçer.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Case own-record view scope requires TEST_DATABASE_URL in CI.");
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

type Ids = Record<"col" | "ins" | "jud" | "lea" | "cc" | "fa", Record<string, string>>;
const ids: Ids = { col: {}, ins: {}, jud: {}, lea: {}, cc: {}, fa: {} };

/** D3b-2 kapsamındaki 7 GET (talimat R01; kod okumasıyla doğrulandı). `nf`: kapsam dışı / yok için beklenen 404 mesajı. */
const ROUTES: Array<{ name: string; path: (k: string) => string; nf: string; ownBody404: boolean }> = [
  { name: "case-collaterals/:id", path: (k) => `/case-collaterals/${ids.col[k] ?? k}`, nf: "Teminat bulunamadi", ownBody404: true },
  { name: "case-instruments/:id", path: (k) => `/case-instruments/${ids.ins[k] ?? k}`, nf: "Kambiyo senedi bulunamadi", ownBody404: true },
  { name: "case-judgments/:id", path: (k) => `/case-judgments/${ids.jud[k] ?? k}`, nf: "Ilam bulunamadi", ownBody404: true },
  { name: "case-leases/:id", path: (k) => `/case-leases/${ids.lea[k] ?? k}`, nf: "Kira sozlesmesi bulunamadi", ownBody404: true },
  { name: "case-fee-agreements/case-client/:caseClientId", path: (k) => `/case-fee-agreements/case-client/${ids.cc[k] ?? k}`, nf: "Dosya bulunamadı", ownBody404: false },
  { name: "case-fee-agreements/case-client/:caseClientId/active", path: (k) => `/case-fee-agreements/case-client/${ids.cc[k] ?? k}/active`, nf: "Dosya bulunamadı", ownBody404: false },
  { name: "case-fee-agreements/:agreementId", path: (k) => `/case-fee-agreements/${ids.fa[k] ?? k}`, nf: "Ücret sözleşmesi bulunamadı", ownBody404: true },
];

describeDb("F02 P3-D3b-2 — kendi kimliğiyle okunan dosya nesneleri dosya görünüm kapsamı (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const suffix = randomUUID().slice(0, 8);
  const tA = `test-ownscope-a-${suffix}`;
  const tB = `test-ownscope-b-${suffix}`;
  const MISSING = `yok-nesne-${suffix}`;
  const originalFlag = process.env[CASE_VIEW_SCOPE_FLAG];
  let db: PrismaClient;
  let app: INestApplication;

  const u = { admin: "", resp: "", creator: "", link: "", staff: "", noView: "", passiveCard: "", allow: "", deny: "", nobody: "", viewer: "" };
  const v = { allow: "" };
  const c: Record<string, string> = {};
  const mark = (kind: string, tag: string) => `${kind}-${tag}-${suffix}`;
  const leaks = (tags: string[]) => tags.flatMap((t) => ["TEM", "CEK", "ILAM", "KIRA", "UCRET"].map((k) => mark(k, t)));

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    const identity = new DbUserIdentityGuard(() => db);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseCollateralModule,
        CaseInstrumentModule,
        CaseJudgmentModule,
        CaseLeaseModule,
        ClientSettlementModule,
      ],
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
      (await db.user.create({ data: { tenantId, email: `${label}-${suffix}@example.test`, name: label, surname: "OS", role } })).id;
    u.admin = await mkUser(tA, "admin", "ADMIN");
    for (const k of ["resp", "creator", "link", "staff", "noView", "passiveCard", "allow", "deny", "nobody"] as const) u[k] = await mkUser(tA, k);
    u.viewer = await mkUser(tA, "viewer", "VIEWER");
    v.allow = await mkUser(tB, "b-allow");

    const lawyer = async (userId: string, isActive = true) => (await db.lawyer.create({ data: { tenantId: tA, userId, name: "Av", surname: "OS", isActive } })).id;
    const staff = async (userId: string) => (await db.staffMember.create({ data: { tenantId: tA, userId, firstName: "Per", lastName: "OS", staffType: "DIGER" } })).id;
    const L = { resp: await lawyer(u.resp), link: await lawyer(u.link), passive: await lawyer(u.passiveCard, false), deny: await lawyer(u.deny), viewer: await lawyer(u.viewer) };
    const S = { staff: await staff(u.staff), noView: await staff(u.noView) };

    const mkCase = async (key: string, tenantId: string, data: Record<string, unknown> = {}) => {
      c[key] = (await db.case.create({ data: { tenantId, fileNumber: `OS-${key}-${suffix}`, type: "GENERAL_EXECUTION", ...data } as never })).id;
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

    const collateral = async (tenantId: string, caseId: string, tag: string) =>
      (await db.caseCollateral.create({ data: { tenantId, caseId, collateralType: "IPOTEK", description: mark("TEM", tag), collateralAmount: 1000 } })).id;
    const agreement = async (tenantId: string, caseClientId: string, tag: string) =>
      (await db.caseFeeAgreement.create({ data: { tenantId, caseClientId, feeType: "FLAT_AMOUNT", flatAmount: 5000, status: "ACTIVE", note: mark("UCRET", tag) } as never })).id;
    const objects = async (tag: string, tenantId: string, caseId: string) => {
      ids.col[tag] = await collateral(tenantId, caseId, tag);
      ids.ins[tag] = (
        await db.caseInstrument.create({
          data: { tenantId, caseId, instrumentType: "CEK", serialNo: mark("CEK", tag), amount: 500, issueDate: new Date("2026-01-15T00:00:00.000Z") },
        })
      ).id;
      ids.jud[tag] = (
        await db.caseJudgment.create({ data: { tenantId, caseId, courtName: mark("ILAM", tag), decisionDate: new Date("2026-02-01T00:00:00.000Z") } as never })
      ).id;
      ids.lea[tag] = (
        await db.caseLease.create({
          data: { tenantId, caseId, propertyAddress: mark("KIRA", tag), startDate: new Date("2026-03-01T00:00:00.000Z"), monthlyRent: 100 } as never,
        })
      ).id;
      const client = await db.client.create({ data: { tenantId, type: "INDIVIDUAL", firstName: "Mvk", lastName: tag } as never });
      ids.cc[tag] = (await db.caseClient.create({ data: { caseId, clientId: client.id } as never })).id;
      ids.fa[tag] = await agreement(tenantId, ids.cc[tag], tag);
    };
    for (const k of ["c1", "c3", "c4", "c5", "c6", "c7"]) await objects(k, tA, c[k]);
    await objects("b1", tB, c.b1);
    // Kayıt–dosya uyuşmazlıkları (FK yok): büro B satırı büro A dosyasında / bağında; büro A satırı var olmayan dosyada / bağda.
    ids.col.crossB = await collateral(tB, c.c4, "crossB");
    ids.fa.crossB = await agreement(tB, ids.cc.c4, "crossB");
    ids.col.orphan = await collateral(tA, `yok-dosya-${suffix}`, "orphan");
    ids.fa.orphan = await agreement(tA, `yok-bag-${suffix}`, "orphan");

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
      await db.caseFeeAgreement.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.caseCollateral.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.caseInstrument.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.caseJudgment.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.caseLease.deleteMany({ where: { tenantId } }).catch(() => undefined);
    }
    for (const tenantId of [tA, tB]) {
      await db.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.client.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.staffMember.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.lawyer.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  const get = (actor: string, path: string) => request(app.getHttpServer()).get(path).set("x-test-user-id", actor);

  /** Kapsam reddi: 404 + nesnenin kendi mesajı; yalnız statusCode / message / error; dosya numarası / kimliği ya da nesne verisi YOK. */
  const expectDenied = (res: request.Response, nf: string, caseKey: string | null, hidden: string[]) => {
    expect([res.status, res.body.message]).toEqual([404, nf]);
    expect(Object.keys(res.body).sort()).toEqual(["error", "message", "statusCode"]);
    const text = JSON.stringify(res.body);
    if (caseKey) {
      expect(text).not.toContain(`OS-${caseKey}-${suffix}`);
      expect(text).not.toContain(c[caseKey]);
    }
    for (const s of leaks(hidden)) expect(text).not.toContain(s);
  };
  const expectPassed = (res: request.Response) => {
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body ?? {})).not.toContain("CASE_VIEW_SCOPE");
  };

  const flagOff: Record<string, { status: number; body: string }> = {};
  const missingOff: Record<string, { status: number; body: unknown }> = {};

  describe("bayrak KAPALI (varsayılan) — bugünkü davranış ve eşitlik", () => {
    beforeAll(() => {
      delete process.env[CASE_VIEW_SCOPE_FLAG];
    });

    it.each(ROUTES.map((r) => [r.name, r] as const))("%s: ilişkisiz kişi kapıya takılmaz; var olmayan nesne servisin kendi yanıtını alır", async (name, r) => {
      const res = await get(u.nobody, r.path("c6"));
      expectPassed(res);
      flagOff[name] = { status: res.status, body: JSON.stringify(res.body) };
      const missing = await get(u.allow, r.path(MISSING));
      missingOff[name] = { status: missing.status, body: missing.body };
      if (r.ownBody404) expect([missing.status, missing.body.message]).toEqual([404, r.nf]);
      else expect(missing.status).toBe(200); // bağ uçlarının servisi bulunamadı vermez (boş sonuç)
    });

    it("karakterizasyon: ilişkisiz kişi kapsam dışı nesneyi; büro B kişisi büro A dosyasındaki büro B satırını; var olmayan dosyayı / bağı gösteren satırlar bugünkü gibi okunur", async () => {
      for (const r of ROUTES) expect(JSON.stringify((await get(u.nobody, r.path("c6"))).body)).toMatch(new RegExp(`-c6-${suffix}`));
      expect(JSON.stringify((await get(v.allow, `/case-collaterals/${ids.col.crossB}`)).body)).toContain(mark("TEM", "crossB"));
      expect(JSON.stringify((await get(v.allow, `/case-fee-agreements/${ids.fa.crossB}`)).body)).toContain(mark("UCRET", "crossB"));
      expect(JSON.stringify((await get(v.allow, `/case-fee-agreements/case-client/${ids.cc.c4}`)).body)).toContain(mark("UCRET", "crossB"));
      expect(JSON.stringify((await get(u.allow, `/case-collaterals/${ids.col.orphan}`)).body)).toContain(mark("TEM", "orphan"));
      expect(JSON.stringify((await get(u.allow, `/case-fee-agreements/${ids.fa.orphan}`)).body)).toContain(mark("UCRET", "orphan"));
    });

    describe("eşitlik: bayrak kapalı ilişkisiz kişi = bayrak açık ALLOW'lu kişi", () => {
      beforeAll(() => {
        process.env[CASE_VIEW_SCOPE_FLAG] = "true";
      });
      afterAll(() => {
        delete process.env[CASE_VIEW_SCOPE_FLAG];
      });
      it("karşılaştırma bayrak açıkken ve 7 kayıtla koşar", () => {
        expect(process.env[CASE_VIEW_SCOPE_FLAG]).toBe("true");
        expect(Object.keys(flagOff)).toHaveLength(ROUTES.length);
      });
      it.each(ROUTES.map((r) => [r.name, r] as const))("%s: aynı durum kodu ve aynı gövde", async (name, r) => {
        const res = await get(u.allow, r.path("c6"));
        expect(res.status).toBe(flagOff[name].status);
        expect(JSON.stringify(res.body)).toBe(flagOff[name].body);
      });
    });
  });

  describe("bayrak AÇIK — kapı nesne okunmadan ÖNCE, dosyayı nesnenin satırından çözer", () => {
    beforeAll(() => {
      process.env[CASE_VIEW_SCOPE_FLAG] = "true";
    });

    it.each(ROUTES.map((r) => [r.name, r] as const))("%s: ilişkisiz kişi nesnenin kendi 404'ünü alır (veri sızmaz); CaseLawyer geçer", async (_n, r) => {
      expectDenied(await get(u.nobody, r.path("c6")), r.nf, "c6", ["c6"]);
      expectDenied(await get(u.nobody, r.path("c4")), r.nf, "c4", ["c4", "crossB"]);
      expectPassed(await get(u.link, r.path("c4")));
    });

    it.each(ROUTES.map((r) => [r.name, r] as const))("%s: var olmayan nesne = kapsam dışı AYNI gövde (kendi servisinin 404'ü)", async (name, r) => {
      const out = await get(u.nobody, r.path("c6"));
      const missing = await get(u.allow, r.path(MISSING));
      expect([missing.status, missing.body]).toEqual([404, out.body]);
      if (r.ownBody404) expect(out.body).toEqual(missingOff[name].body);
    });

    it("D1 dalları aynen: Dosya Sorumlusu, oluşturan, CaseStaff canView geçer; canView=false, pasif kart, ADMIN rolü 404", async () => {
      const col = (x: string, k: string) => get(x, `/case-collaterals/${ids.col[k]}`);
      for (const [actor, k] of [[u.resp, "c1"], [u.creator, "c3"], [u.staff, "c5"]] as const) {
        const res = await col(actor, k);
        expectPassed(res);
        expect(JSON.stringify(res.body)).toContain(mark("TEM", k));
      }
      expectDenied(await col(u.noView, "c6"), "Teminat bulunamadi", "c6", ["c6"]);
      expectDenied(await col(u.passiveCard, "c7"), "Teminat bulunamadi", "c7", ["c7"]);
      expectDenied(await col(u.admin, "c4"), "Teminat bulunamadi", "c4", ["c4"]);
      expectPassed(await get(u.staff, `/case-fee-agreements/${ids.fa.c5}`));
    });

    it("liste kapsamla aynı: bağ listesi yalnız o bağın, aktör kiracısının sözleşmelerini verir; ALLOW kapsam dışı bağı okur", async () => {
      const mine = JSON.stringify((await get(u.link, `/case-fee-agreements/case-client/${ids.cc.c4}`)).body);
      expect(mine).toContain(mark("UCRET", "c4"));
      expect(mine).not.toMatch(new RegExp(`-(c6|crossB|orphan)-${suffix}`));
      expect(JSON.stringify((await get(u.allow, `/case-fee-agreements/case-client/${ids.cc.c6}/active`)).body)).toContain(mark("UCRET", "c6"));
    });

    it("ALLOW + DENY → DENY baskın ama C4 ilişkisi KALIR; büro B ALLOW büro A nesnesine 404, kendi nesnesine geçer", async () => {
      expectPassed(await get(u.deny, `/case-leases/${ids.lea.c4}`));
      expectDenied(await get(u.deny, `/case-judgments/${ids.jud.c6}`), "Ilam bulunamadi", "c6", ["c6"]);
      expectDenied(await get(v.allow, `/case-fee-agreements/${ids.fa.c4}`), "Ücret sözleşmesi bulunamadı", "c4", ["c4"]);
      const own = await get(v.allow, `/case-fee-agreements/${ids.fa.b1}`);
      expectPassed(own);
      expect(JSON.stringify(own.body)).toContain(mark("UCRET", "b1"));
    });

    it("ilişki–dosya uyuşmazlığı: büro A kartının büro B dosyasındaki CaseLawyer satırı nesne erişimi üretmez (7 uç)", async () => {
      for (const r of ROUTES) expectDenied(await get(u.link, r.path("b1")), r.nf, "b1", ["b1"]);
    });

    it("kayıt–dosya uyuşmazlığı: büro A dosyasındaki / bağındaki büro B satırı büro B kişisine açılmaz (dosya kiracısı belirleyici)", async () => {
      expectDenied(await get(v.allow, `/case-collaterals/${ids.col.crossB}`), "Teminat bulunamadi", "c4", ["crossB", "c4"]);
      expectDenied(await get(v.allow, `/case-fee-agreements/${ids.fa.crossB}`), "Ücret sözleşmesi bulunamadı", "c4", ["crossB", "c4"]);
      expectDenied(await get(v.allow, `/case-fee-agreements/case-client/${ids.cc.c4}`), "Dosya bulunamadı", "c4", ["crossB", "c4"]);
      expectDenied(await get(v.allow, `/case-fee-agreements/case-client/${ids.cc.c4}/active`), "Dosya bulunamadı", "c4", ["crossB", "c4"]);
    });

    it("servis düzeyi: nesne aktörün kiracısında değilse dosya görünür olsa bile false (handler'ın kendi kiracı süzgecine dayanılmaz)", async () => {
      const scope = app.get(CaseViewScopeService, { strict: false });
      // büro A'daki link C4'ü görür; büro B'nin C4'e işaret eden satırları büro A aktörüne görünür SAYILMAZ.
      expect(await scope.isCaseObjectVisible(tA, u.link, "caseCollateral", ids.col.c4)).toBe(true);
      expect(await scope.isCaseObjectVisible(tA, u.link, "caseCollateral", ids.col.crossB)).toBe(false);
      expect(await scope.isCaseObjectVisible(tA, u.link, "caseFeeAgreement", ids.fa.c4)).toBe(true);
      expect(await scope.isCaseObjectVisible(tA, u.link, "caseFeeAgreement", ids.fa.crossB)).toBe(false);
      expect(await scope.isCaseObjectVisible(tB, v.allow, "caseClient", ids.cc.c4)).toBe(false);
    });

    it("kayıt–dosya uyuşmazlığı: var olmayan dosyayı / bağı gösteren büro A satırları ALLOW'lu kişiye de açılmaz", async () => {
      expectDenied(await get(u.allow, `/case-collaterals/${ids.col.orphan}`), "Teminat bulunamadi", null, ["orphan"]);
      expectDenied(await get(u.allow, `/case-fee-agreements/${ids.fa.orphan}`), "Ücret sözleşmesi bulunamadı", null, ["orphan"]);
    });

    it("mevcut işlem yetkisi ayrıca korunur: VIEWER kapsam içini okur, kapsam dışına 404 alır; yazma reddi (403) değişmez", async () => {
      expectPassed(await get(u.viewer, `/case-fee-agreements/${ids.fa.c4}`));
      expectDenied(await get(u.viewer, `/case-fee-agreements/${ids.fa.c6}`), "Ücret sözleşmesi bulunamadı", "c6", ["c6"]);
      const before = await db.caseFeeAgreement.count({ where: { tenantId: tA } });
      const write = await request(app.getHttpServer())
        .post("/case-fee-agreements")
        .set("x-test-user-id", u.viewer)
        .send({ caseClientId: ids.cc.c4, feeType: "FLAT_AMOUNT", flatAmount: 1 });
      expect([write.status, write.body.code]).toEqual([403, "VIEWER_WRITE_DENIED"]);
      expect(await db.caseFeeAgreement.count({ where: { tenantId: tA } })).toBe(before);
    });

    it("yazım uçları kapsam kapısı taşımaz: sözleşme sonlandırma servisin kendi yetki kuralına gider (kapının 404'ü değil), satır değişmez", async () => {
      const res = await request(app.getHttpServer()).post(`/case-fee-agreements/${ids.fa.c6}/terminate`).set("x-test-user-id", u.nobody).send({});
      expect(res.status).not.toBe(200);
      expect(res.body?.message).not.toBe("Ücret sözleşmesi bulunamadı");
      expect((await db.caseFeeAgreement.findUnique({ where: { id: ids.fa.c6 } }))?.status).toBe("ACTIVE");
    });
  });
});
