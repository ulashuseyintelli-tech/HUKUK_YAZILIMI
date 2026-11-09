// TebligatModule grafiği `pdf-poppler`'ı yükleyebilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
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
import { TebligatModule } from "../tebligat.module";

/**
 * F02 P3 Tebligat (R12 Kabul A sonrası, 09.11.2026) — dosyaya bağlı tebligat OKUMALARI D1 dosya kapsamını dolanamaz:
 * gerçek HTTP (TebligatModule + ValidationPipe) + tek kullanımlık PostgreSQL. JWT yerine DB kimliği.
 *
 * D1 sözleşmesi aynen (yeni kural / anahtar / bayrak YOK; CaseViewScopeService). Dosya SUNUCUDAKİ ilişkiden çözülür:
 *  - `case/:caseId`, `check-priority/:caseId` → yoldaki dosya kiracı + kapsamla doğrulanır;
 *  - `:id` → tebligat satırı (aktör kiracısında) → caseId; `case-debtor/:caseDebtorId` → CaseDebtor → caseId;
 *  - `summary?caseId=` → dosya doğrulanır; `summary` (caseId yok) → yalnız kapsamdaki dosyaların satırları sayılır.
 * Kapsam dışı / yok → AYNI 404 gövdesi (detayda "Tebligat bulunamadı", diğerlerinde "Dosya bulunamadı"); veri sızmaz.
 * Bayrak kapalı: davranış bugünküyle aynı (karakterizasyon). Mevcut işlem yetkisi (VIEWER yazma reddi) değişmez.
 * Kod okuması gerçek erişim kanıtı değildir; bu spec yalnız yalıtılmış DB'deki davranışı ölçer.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Tebligat case view scope requires TEST_DATABASE_URL in CI.");
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

describeDb("F02 P3 Tebligat — dosyaya bağlı tebligat okumaları dosya görünüm kapsamı (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const suffix = randomUUID().slice(0, 8);
  const tA = `test-tebscope-a-${suffix}`;
  const tB = `test-tebscope-b-${suffix}`;
  const MISSING = `yok-${suffix}`;
  const originalFlag = process.env[CASE_VIEW_SCOPE_FLAG];
  let db: PrismaClient;
  let app: INestApplication;

  const u = { resp: "", link: "", staff: "", deny: "", allow: "", nobody: "", viewer: "" };
  const v = { allow: "" };
  const c: Record<string, string> = {};
  const teb: Record<string, string> = {};
  const cd: Record<string, string> = {};
  const mark = (tag: string) => `TEB-${tag}-${suffix}`;
  const fileNo = (k: string) => `TS-${k}-${suffix}`;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    const identity = new DbUserIdentityGuard(() => db);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, TebligatModule],
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
      (await db.user.create({ data: { tenantId, email: `${label}-${suffix}@example.test`, name: label, surname: "TS", role } })).id;
    for (const k of ["resp", "link", "staff", "deny", "allow", "nobody"] as const) u[k] = await mkUser(tA, k);
    u.viewer = await mkUser(tA, "viewer", "VIEWER");
    v.allow = await mkUser(tB, "b-allow");

    const lawyer = async (userId: string) => (await db.lawyer.create({ data: { tenantId: tA, userId, name: "Av", surname: "TS", isActive: true } })).id;
    const L = { resp: await lawyer(u.resp), link: await lawyer(u.link), deny: await lawyer(u.deny), viewer: await lawyer(u.viewer) };
    const S = (await db.staffMember.create({ data: { tenantId: tA, userId: u.staff, firstName: "Per", lastName: "TS", staffType: "DIGER" } })).id;

    const mkCase = async (key: string, tenantId: string, data: Record<string, unknown> = {}) => {
      c[key] = (await db.case.create({ data: { tenantId, fileNumber: fileNo(key), type: "GENERAL_EXECUTION", ...data } as never })).id;
    };
    await mkCase("c1", tA, { responsibleLawyerId: L.resp });
    await mkCase("c4", tA);
    await mkCase("c5", tA);
    await mkCase("c6", tA);
    await mkCase("b1", tB, { createdById: v.allow });
    for (const lw of [L.link, L.deny, L.viewer]) await db.caseLawyer.create({ data: { caseId: c.c4, lawyerId: lw } });
    await db.caseLawyer.create({ data: { caseId: c.b1, lawyerId: L.link } }); // ilişki–dosya uyuşmazlığı: büro A kartı, büro B dosyası
    await db.caseStaff.create({ data: { caseId: c.c5, staffMemberId: S, roleOnCase: "KONTROL", canView: true } });

    const caseDebtor = async (tenantId: string, caseKey: string) => {
      const debtor = await db.debtor.create({ data: { tenantId, type: "COMPANY", name: `Borclu-${caseKey}-${suffix}` } as never });
      return (await db.caseDebtor.create({ data: { caseId: c[caseKey], debtorId: debtor.id } as never })).id;
    };
    const tebligat = async (tag: string, tenantId: string, caseKey: string, caseDebtorId: string | null, extra: Record<string, unknown> = {}) =>
      (
        await db.tebligat.create({
          data: {
            tenantId,
            caseId: c[caseKey],
            caseDebtorId,
            tebligatType: "ODEME_EMRI",
            addressType: "BILINEN",
            addressText: `ADR-${tag}-${suffix}`,
            recipientName: mark(tag),
            channel: "PTT",
            ...extra,
          } as never,
        })
      ).id;
    for (const k of ["c1", "c4", "c5", "c6"]) {
      cd[k] = await caseDebtor(tA, k);
      teb[k] = await tebligat(k, tA, k, cd[k], k === "c6" ? { pttResult: "ADRESTE_BULUNAMADI", pttResultDate: new Date("2026-10-01T00:00:00.000Z") } : {});
    }
    cd.b1 = await caseDebtor(tB, "b1");
    teb.b1 = await tebligat("b1", tB, "b1", cd.b1);
    // Kayıt–dosya uyuşmazlıkları (Tebligat.caseDebtorId ↔ caseId arasında DB kısıtı yok; Tebligat ↔ Case kiracısı eşleşmez):
    teb.mix = await tebligat("mix", tA, "c6", cd.c4); // görünür borçlu (C4), görünmez dosya (C6)
    teb.crossB = await tebligat("crossB", tB, "c4", null); // büro B satırı, büro A dosyası

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

  /** Dosya kimlikli okuma uçları (dosya → `caseKey`); `nf`: kapsam dışı / yok için beklenen 404 mesajı. */
  const CASE_ROUTES: Array<{ name: string; path: (caseKey: string) => string }> = [
    { name: "case/:caseId", path: (k) => `/tebligat/case/${c[k] ?? k}` },
    { name: "check-priority/:caseId", path: (k) => `/tebligat/check-priority/${c[k] ?? k}` },
    { name: "summary?caseId=", path: (k) => `/tebligat/summary?caseId=${c[k] ?? k}` },
  ];
  /** Kendi kimliğiyle okunanlar (`k` → nesne). */
  const OBJECT_ROUTES: Array<{ name: string; path: (k: string) => string; nf: string }> = [
    { name: ":id", path: (k) => `/tebligat/${teb[k] ?? k}`, nf: "Tebligat bulunamadı" },
    { name: "case-debtor/:caseDebtorId", path: (k) => `/tebligat/case-debtor/${cd[k] ?? k}`, nf: "Dosya bulunamadı" },
  ];
  const ALL_FOR = (k: string) => [
    ...CASE_ROUTES.map((r) => ({ name: r.name, path: r.path(k), nf: "Dosya bulunamadı" })),
    ...OBJECT_ROUTES.map((r) => ({ name: r.name, path: r.path(k), nf: r.nf })),
  ];

  /** Kapsam reddi: 404 + beklenen mesaj; yalnız statusCode / message / error; dosya no / kimlik / tebligat verisi YOK. */
  const expectDenied = (res: request.Response, nf: string, caseKey: string | null, hidden: string[]) => {
    expect([res.status, res.body.message]).toEqual([404, nf]);
    expect(Object.keys(res.body).sort()).toEqual(["error", "message", "statusCode"]);
    const t = text(res);
    if (caseKey) {
      expect(t).not.toContain(fileNo(caseKey));
      expect(t).not.toContain(c[caseKey]);
    }
    for (const h of hidden) expect(t).not.toContain(mark(h));
  };
  const expectPassed = (res: request.Response) => {
    expect(res.status).toBe(200);
    expect(text(res)).not.toContain("CASE_VIEW_SCOPE");
  };
  const total = async (actor: string) => {
    const res = await get(actor, "/tebligat/summary");
    expect(res.status).toBe(200);
    return res.body.total as number;
  };

  const flagOff: Record<string, { status: number; body: string }> = {};

  describe("bayrak KAPALI (varsayılan) — bugünkü davranış (karakterizasyon) ve eşitlik", () => {
    beforeAll(() => {
      delete process.env[CASE_VIEW_SCOPE_FLAG];
    });

    it("ilişkisiz kişi C6'nın tebligatını beş uçtan da okur (kapı yok, ek sorgu yok)", async () => {
      for (const r of ALL_FOR("c6")) {
        const res = await get(u.nobody, r.path);
        expectPassed(res);
        flagOff[r.name] = { status: res.status, body: text(res) };
      }
      expect(text(await get(u.nobody, `/tebligat/${teb.c6}`))).toContain(mark("c6"));
      expect(text(await get(u.nobody, `/tebligat/case/${c.c6}`))).toContain(mark("c6"));
      expect((await get(u.nobody, `/tebligat/check-priority/${c.c6}`)).body.previousAttempts).toHaveLength(1);
      expect((await get(u.nobody, `/tebligat/summary?caseId=${c.c6}`)).body.total).toBe(2); // C6 + mix
    });

    it("var olmayan nesne bugünkü yanıtı alır: detay 404 'Tebligat bulunamadı'; dosya / borçlu listeleri 200 boş", async () => {
      const missing = await get(u.allow, `/tebligat/${MISSING}`);
      expect([missing.status, missing.body.message]).toEqual([404, "Tebligat bulunamadı"]);
      expect([(await get(u.allow, `/tebligat/case/${MISSING}`)).body]).toEqual([[]]);
      expect([(await get(u.allow, `/tebligat/case-debtor/${MISSING}`)).body]).toEqual([[]]);
    });

    it("karakterizasyon: özet kiracının tümünü sayar; borçlu listesi başka dosyadaki satırı da verir; büro B kendi satırını büro A dosyasında okur", async () => {
      expect(await total(u.nobody)).toBe(5); // C1, C4, C5, C6, mix
      expect(await total(v.allow)).toBe(2); // b1 + crossB
      expect(text(await get(u.link, `/tebligat/case-debtor/${cd.c4}`))).toContain(mark("mix"));
      expect(text(await get(v.allow, `/tebligat/${teb.crossB}`))).toContain(mark("crossB"));
      expect(text(await get(v.allow, `/tebligat/case/${c.c4}`))).toContain(mark("crossB"));
    });

    describe("eşitlik: bayrak kapalı ilişkisiz kişi = bayrak açık ALLOW'lu kişi", () => {
      beforeAll(() => {
        process.env[CASE_VIEW_SCOPE_FLAG] = "true";
      });
      afterAll(() => {
        delete process.env[CASE_VIEW_SCOPE_FLAG];
      });
      it("karşılaştırma bayrak açıkken ve beş uçla koşar", () => {
        expect(process.env[CASE_VIEW_SCOPE_FLAG]).toBe("true");
        expect(Object.keys(flagOff)).toHaveLength(5);
      });
      it.each(ALL_FOR("c6").map((r) => [r.name] as const))("%s: aynı durum kodu ve aynı gövde", async (name) => {
        const r = ALL_FOR("c6").find((x) => x.name === name)!; // kimlikler beforeAll'da oluşur → yol test anında
        const res = await get(u.allow, r.path);
        expect(res.status).toBe(flagOff[name].status);
        expect(text(res)).toBe(flagOff[name].body);
      });
    });
  });

  describe("bayrak AÇIK — kapı tebligat okunmadan ÖNCE, dosyayı sunucudaki ilişkiden çözer", () => {
    beforeAll(() => {
      process.env[CASE_VIEW_SCOPE_FLAG] = "true";
    });

    it.each(ALL_FOR("c6").map((r) => [r.name, r] as const))("%s: ilişkisiz kişi 404 alır (veri sızmaz); CaseLawyer kendi dosyasında geçer", async (name) => {
      const r6 = ALL_FOR("c6").find((x) => x.name === name)!;
      const r4 = ALL_FOR("c4").find((x) => x.name === name)!;
      expectDenied(await get(u.nobody, r6.path), r6.nf, "c6", ["c6", "mix"]);
      expectDenied(await get(u.nobody, r4.path), r4.nf, "c4", ["c4"]);
      expectPassed(await get(u.link, r4.path));
    });

    it.each(ALL_FOR(MISSING).map((r) => [r.name, r] as const))("%s: var olmayan nesne = kapsam dışı AYNI gövde", async (name, r) => {
      const out = await get(u.nobody, ALL_FOR("c6").find((x) => x.name === name)!.path);
      const missing = await get(u.allow, r.path);
      expect([missing.status, missing.body]).toEqual([404, out.body]);
    });

    it("detay gövdesi bugünkü 'bulunamadı' ile birebir aynı (kapsam dışı ayırt edilemez)", async () => {
      delete process.env[CASE_VIEW_SCOPE_FLAG];
      const before = (await get(u.allow, `/tebligat/${MISSING}`)).body;
      process.env[CASE_VIEW_SCOPE_FLAG] = "true";
      expect((await get(u.nobody, `/tebligat/${teb.c6}`)).body).toEqual(before);
    });

    it("D1 dalları aynen: Dosya Sorumlusu ve CaseStaff canView geçer; ALLOW + DENY → DENY baskın ama C4 ilişkisi kalır", async () => {
      for (const [actor, k] of [[u.resp, "c1"], [u.staff, "c5"], [u.deny, "c4"]] as const) {
        const res = await get(actor, `/tebligat/${teb[k]}`);
        expectPassed(res);
        expect(text(res)).toContain(mark(k));
      }
      expectDenied(await get(u.deny, `/tebligat/case/${c.c6}`), "Dosya bulunamadı", "c6", ["c6", "mix"]);
    });

    it("liste / özet / detay tutarlı: borçlu listesi görünmez dosyadaki satırı vermez; o satırın detayı da 404; özet yalnız kapsamı sayar", async () => {
      const list = await get(u.link, `/tebligat/case-debtor/${cd.c4}`);
      expectPassed(list);
      expect(text(list)).toContain(mark("c4"));
      expect(text(list)).not.toContain(mark("mix"));
      expectDenied(await get(u.link, `/tebligat/${teb.mix}`), "Tebligat bulunamadı", "c6", ["mix"]);
      const byCase = await get(u.link, `/tebligat/case/${c.c4}`);
      expect((byCase.body as Array<{ id: string }>).map((t) => t.id)).toEqual([teb.c4]);
      expect((await get(u.link, `/tebligat/summary?caseId=${c.c4}`)).body.total).toBe(1);
      expect(await total(u.link)).toBe(1); // yalnız C4
      expect(await total(u.nobody)).toBe(0);
      expect(await total(u.deny)).toBe(1); // DENY → varsayılan kapsam: C4
      expect(await total(u.allow)).toBe(5); // ALLOW → büro geneli (kiracı içi)
    });

    it("iki kiracı: büro B ALLOW büro A dosyasına / borçlusuna 404 alır; büro A dosyasındaki büro B satırı açılmaz; kendi satırı açılır", async () => {
      expectDenied(await get(v.allow, `/tebligat/case/${c.c4}`), "Dosya bulunamadı", "c4", ["c4", "crossB"]);
      expectDenied(await get(v.allow, `/tebligat/summary?caseId=${c.c4}`), "Dosya bulunamadı", "c4", ["c4", "crossB"]);
      expectDenied(await get(v.allow, `/tebligat/check-priority/${c.c4}`), "Dosya bulunamadı", "c4", ["c4"]);
      expectDenied(await get(v.allow, `/tebligat/case-debtor/${cd.c4}`), "Dosya bulunamadı", "c4", ["c4"]);
      expectDenied(await get(v.allow, `/tebligat/${teb.crossB}`), "Tebligat bulunamadı", "c4", ["crossB"]);
      expectDenied(await get(v.allow, `/tebligat/${teb.c4}`), "Tebligat bulunamadı", "c4", ["c4"]);
      const own = await get(v.allow, `/tebligat/${teb.b1}`);
      expectPassed(own);
      expect(text(own)).toContain(mark("b1"));
      expect(await total(v.allow)).toBe(1); // yalnız b1; crossB'nin dosyası büro A'da
    });

    it("ilişki–dosya uyuşmazlığı: büro A kartının büro B dosyasındaki CaseLawyer satırı tebligat erişimi üretmez", async () => {
      for (const r of ALL_FOR("b1")) expectDenied(await get(u.link, r.path), r.nf, "b1", ["b1"]);
    });

    it("servis düzeyi: tebligat / borçlu satırı aktörün kiracısında değilse dosya görünür olsa bile false", async () => {
      const scope = app.get(CaseViewScopeService, { strict: false });
      expect(await scope.isCaseObjectVisible(tA, u.link, "tebligat", teb.c4)).toBe(true);
      expect(await scope.isCaseObjectVisible(tA, u.link, "tebligat", teb.crossB)).toBe(false);
      expect(await scope.isCaseObjectVisible(tA, u.link, "caseDebtor", cd.c4)).toBe(true);
      expect(await scope.isCaseObjectVisible(tA, u.link, "caseDebtor", cd.b1)).toBe(false);
      expect(await scope.isCaseObjectVisible(tB, v.allow, "caseDebtor", cd.c4)).toBe(false);
    });

    it("gölgedeki pending-actions erişilebilir KILINMADI: hâlâ ':id' kapısına düşer ve 404 alır", async () => {
      const res = await get(u.allow, "/tebligat/pending-actions");
      expect([res.status, res.body.message]).toEqual([404, "Tebligat bulunamadı"]);
    });

    it("mevcut işlem yetkisi ayrıca korunur: VIEWER kapsam içini okur, kapsam dışına 404 alır; yazma reddi (403) değişmez", async () => {
      expectPassed(await get(u.viewer, `/tebligat/case/${c.c4}`));
      expectDenied(await get(u.viewer, `/tebligat/case/${c.c6}`), "Dosya bulunamadı", "c6", ["c6"]);
      const before = await db.tebligat.count({ where: { tenantId: tA } });
      const write = await request(app.getHttpServer())
        .post("/tebligat")
        .set("x-test-user-id", u.viewer)
        .send({ caseId: c.c4, tebligatType: "ODEME_EMRI", addressType: "BILINEN", addressText: "x", recipientName: "x", channel: "PTT" });
      expect([write.status, write.body.code]).toEqual([403, "VIEWER_WRITE_DENIED"]);
      expect(await db.tebligat.count({ where: { tenantId: tA } })).toBe(before);
    });
  });
});
