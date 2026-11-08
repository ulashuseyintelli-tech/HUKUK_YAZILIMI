// Belge modülleri grafiği pdf-poppler'a uzanabilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as request from "supertest";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { StorageModule } from "../../../common/storage/storage.module";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { DocumentModule } from "../../document/document.module";
import { ErrorLogModule } from "../../error-log/error-log.module";
import { MetricsRegistryModule } from "../../metrics-registry/metrics-registry.module";
import { PdfModule } from "../../pdf/pdf.module";
import { TemplateEngineModule } from "../../template-engine/template-engine.module";
import { CASE_VIEW_ALL_KEY, CASE_VIEW_SCOPE_FLAG } from "../case-view-scope";
import { CaseViewScopeService } from "../case-view-scope.service";

/**
 * F02 P3-D2 (owner kararı 08.11.2026) — dosyaya bağlı belge OKUMA yolları D1 dosya kapsamını dolanamaz: gerçek HTTP
 * (DocumentModule + TemplateEngineModule + PdfModule + ValidationPipe) + tek kullanımlık PostgreSQL. JWT yerine DB kimliği.
 *
 * Sözleşme (D1 kararları aynen): aktif Dosya Sorumlusu ∪ oluşturan ∪ CaseLawyer ∪ CaseStaff canView; büro geneli yalnız
 * `office.cases.view_all` ALLOW; DENY ilişkileri kaldırmaz; bayrak `OFFICE_CASE_VIEW_SCOPE_ENABLED` varsayılan KAPALI.
 *  - Dosya kimliği yoldan gelir ama güvenilmez: kapı kiracı + kapsam ile DB'den doğrular; kapsam dışı ve yok → aynı 404,
 *    dosya içeriği / önizleme / indirme üretilmeden ÖNCE (yanıtta içerik, dosya numarası, Content-Disposition YOK).
 *  - Artefakt indirmede dosya artefakt satırından çözülür (artefakt + dosya aynı kiracıda ve kapsamda); uyuşmazlık 404.
 *  - Bayrak kapalı: davranış bugünküyle aynı (kapsam dışı kişi her şeyi alır; ALLOW'lu kişiyle aynı yanıt).
 * Kod okuması gerçek erişim kanıtı değildir; bu spec yalnız yalıtılmış DB'deki davranışı ölçer.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Case document view scope requires TEST_DATABASE_URL in CI.");
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

describeDb("F02 P3-D2 — dosyaya bağlı belge okuma yolları dosya görünüm kapsamı (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const tA = `test-docscope-a-${suffix}`;
  const tB = `test-docscope-b-${suffix}`;
  const originalFlag = process.env[CASE_VIEW_SCOPE_FLAG];
  const dir = mkdtempSync(join(tmpdir(), "p3d2-art-"));
  let db: PrismaClient;
  let app: INestApplication;
  let scope: CaseViewScopeService;

  const u = { admin: "", resp: "", creator: "", link: "", staff: "", noView: "", passiveCard: "", allow: "", deny: "", nobody: "" };
  const v = { allow: "" };
  const c: Record<string, string> = {};
  const a = { c4: "", c6: "", mismatch: "" };
  const SECRET = { c4: `ART-C4-${suffix}`, c6: `ART-C6-${suffix}`, mismatch: `ART-MISMATCH-${suffix}` };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        DocumentModule,
        TemplateEngineModule,
        PdfModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => db))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    scope = app.get(CaseViewScopeService);

    for (const id of [tA, tB]) await db.tenant.create({ data: { id, name: id, slug: id } });
    const mkUser = async (tenantId: string, label: string, role: "ADMIN" | "USER" = "USER") =>
      (await db.user.create({ data: { tenantId, email: `${label}-${suffix}@example.test`, name: label, surname: "DS", role } })).id;
    u.admin = await mkUser(tA, "admin", "ADMIN");
    for (const k of ["resp", "creator", "link", "staff", "noView", "passiveCard", "allow", "deny", "nobody"] as const) u[k] = await mkUser(tA, k);
    v.allow = await mkUser(tB, "b-allow");

    const lawyer = async (userId: string, isActive = true) => (await db.lawyer.create({ data: { tenantId: tA, userId, name: "Av", surname: "DS", isActive } })).id;
    const staff = async (userId: string) => (await db.staffMember.create({ data: { tenantId: tA, userId, firstName: "Per", lastName: "DS", staffType: "DIGER" } })).id;
    const L = { resp: await lawyer(u.resp), link: await lawyer(u.link), passive: await lawyer(u.passiveCard, false), deny: await lawyer(u.deny) };
    const S = { staff: await staff(u.staff), noView: await staff(u.noView) };

    const mkCase = async (key: string, tenantId: string, data: Record<string, unknown> = {}) => {
      c[key] = (await db.case.create({ data: { tenantId, fileNumber: `DS-${key}-${suffix}`, type: "GENERAL_EXECUTION", ...data } as never })).id;
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
    await db.caseStaff.create({ data: { caseId: c.c5, staffMemberId: S.staff, roleOnCase: "KONTROL", canView: true } });
    await db.caseStaff.create({ data: { caseId: c.c6, staffMemberId: S.noView, roleOnCase: "ARSIV", canView: false } });

    const grant = (tenantId: string, subjectUserId: string, effect: "ALLOW" | "DENY") =>
      db.permissionGrant.create({ data: { tenantId, subjectUserId, permissionKey: CASE_VIEW_ALL_KEY, effect, scope: "GLOBAL" } });
    await grant(tA, u.allow, "ALLOW");
    await grant(tA, u.deny, "ALLOW");
    await grant(tA, u.deny, "DENY");
    await grant(tB, v.allow, "ALLOW");

    const mkArtifact = async (key: keyof typeof a, tenantId: string, caseId: string, secret: string) => {
      const filePath = join(dir, `${key}.txt`);
      writeFileSync(filePath, secret);
      a[key] = (await db.documentArtifact.create({
        data: {
          tenantId, caseId, documentType: "TAKIP_TALEBI", format: "TXT", templateVersion: "v1", dataHash: `h-${key}-${suffix}`,
          status: "READY", filePath, fileName: `${key}-${suffix}.txt`, fileSize: secret.length,
        },
      })).id;
    };
    await mkArtifact("c4", tA, c.c4, SECRET.c4);
    await mkArtifact("c6", tA, c.c6, SECRET.c6);
    // Belge–dosya–kiracı UYUŞMAZLIĞI: artefakt büro A'da, bağlı olduğu dosya büro B'de (veri tutarsızlığı senaryosu).
    await mkArtifact("mismatch", tA, c.b1, SECRET.mismatch);
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env[CASE_VIEW_SCOPE_FLAG];
    else process.env[CASE_VIEW_SCOPE_FLAG] = originalFlag;
    await app?.close();
    for (const tenantId of [tA, tB]) {
      await db.documentArtifact.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.permissionGrant.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.staffMember.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.lawyer.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await db.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());
  const get = (actor: string, path: string) => http().get(path).set("x-test-user-id", actor);
  const post = (actor: string, path: string, body: object) => http().post(path).set("x-test-user-id", actor).send(body);

  /** Dosya kimliği yolda olan temsilî okuma uçları (her controller'dan; GET + yazımsız POST üretimi). */
  const CASE_ROUTES: Array<{ name: string; call: (actor: string, caseId: string) => request.Test }> = [
    { name: "GET documents/case/:caseId/preview-data", call: (x, id) => get(x, `/documents/case/${id}/preview-data`) },
    { name: "GET documents/case/:caseId/payment-order", call: (x, id) => get(x, `/documents/case/${id}/payment-order`) },
    { name: "GET documents/case/:caseId/available-templates", call: (x, id) => get(x, `/documents/case/${id}/available-templates`) },
    { name: "POST documents/case/:caseId/seizure-notice", call: (x, id) => post(x, `/documents/case/${id}/seizure-notice`, { targetType: "BANKA", targetDetails: {} }) },
    { name: "GET template-engine/takip-talebi/case/:caseId", call: (x, id) => get(x, `/template-engine/takip-talebi/case/${id}`) },
    { name: "GET template-engine/case/:caseId/pdf", call: (x, id) => get(x, `/template-engine/case/${id}/pdf?type=takip-talebi`) },
    { name: "GET template-engine/case/:caseId/udf/download", call: (x, id) => get(x, `/template-engine/case/${id}/udf/download?type=takip-talebi`) },
    { name: "GET template-engine/karsiliksiz-cek/case/:caseId/preview", call: (x, id) => get(x, `/template-engine/karsiliksiz-cek/case/${id}/preview`) },
    { name: "GET template-engine/cases/:caseId/documents", call: (x, id) => get(x, `/template-engine/cases/${id}/documents`) },
    { name: "GET pdf/takip-talebi/:caseId", call: (x, id) => get(x, `/pdf/takip-talebi/${id}`) },
  ];

  /** Kapsam reddi: 404, eksik dosyayla aynı gövde; içerik / dosya numarası / indirme başlığı YOK. */
  const expectDenied = async (res: request.Response, caseKey: string) => {
    expect(res.status).toBe(404);
    expect(res.headers["content-disposition"]).toBeUndefined();
    expect(String(res.headers["content-type"] ?? "")).toContain("application/json");
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(`DS-${caseKey}-${suffix}`);
    expect(text).not.toContain(c[caseKey]);
    expect(res.body.message).toBe("Dosya bulunamadı");
  };
  /** Kapı geçti: kapsam reddi / çözümlenemeyen kapsam YOK (belgenin kendi veri kapısı 4xx verebilir). */
  const expectPassed = (res: request.Response) => {
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(401);
    expect(JSON.stringify(res.body ?? {})).not.toContain("CASE_VIEW_SCOPE_UNRESOLVED");
    expect(res.status === 403 && /CASE_VIEW_SCOPE/.test(JSON.stringify(res.body))).toBe(false);
  };

  describe("bayrak KAPALI (varsayılan) — bugünkü davranış ve eşitlik", () => {
    const flagOff: Record<string, { status: number; body: string }> = {};
    beforeAll(() => {
      delete process.env[CASE_VIEW_SCOPE_FLAG];
    });

    it.each(CASE_ROUTES.map((r) => [r.name, r] as const))("%s: ilişkisiz kişi kapıya takılmaz (bugünkü davranış)", async (name, r) => {
      const res = await r.call(u.nobody, c.c6);
      expectPassed(res);
      flagOff[name] = { status: res.status, body: name.includes("/documents") ? JSON.stringify(res.body) : "" };
    });

    it("artefakt listesi ve indirme ilişkisiz kişiye açık (kişi kapsamı bayrağa bağlı); uyuşmaz artefakt bayrak kapalıyken de İNMEZ (P3 kiracı eşleşmesi)", async () => {
      const list = await get(u.nobody, `/template-engine/cases/${c.c6}/documents`);
      expect(list.status).toBe(200);
      expect(list.body.map((x: { id: string }) => x.id)).toEqual([a.c6]);
      const dl = await get(u.nobody, `/template-engine/documents/${a.c6}/download`);
      expect(dl.status).toBe(200);
      expect(dl.text ?? dl.body.toString()).toContain(SECRET.c6);
      // P3 (owner kararı 08.11.2026): aktör ↔ artefakt ↔ bağlı dosya kiracı eşleşmesi bayraktan BAĞIMSIZ zorunlu (eski 200 kaldırıldı).
      const mm = await get(u.nobody, `/template-engine/documents/${a.mismatch}/download`);
      expect([mm.status, mm.body, mm.headers["content-disposition"]]).toEqual([404, { message: "Doküman bulunamadı" }, undefined]);
      expect(JSON.stringify(mm.body)).not.toContain(SECRET.mismatch);
    });

    it("bayrak kapalıyken kapsam servisi DB'ye hiç sorgu atmaz (ek yük ve davranış farkı yok)", async () => {
      const spy = jest.spyOn((scope as unknown as { prisma: PrismaClient }).prisma.case, "findFirst");
      await scope.assertCaseVisible(tA, undefined, c.c6);
      await expect(scope.isArtifactVisible(tA, undefined, a.c6)).resolves.toBe(true);
      await expect(scope.scopeWhere(tA, undefined)).resolves.toBeNull();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    describe("eşitlik: bayrak kapalı ilişkisiz kişi = bayrak açık ALLOW'lu kişi", () => {
      beforeAll(() => {
        process.env[CASE_VIEW_SCOPE_FLAG] = "true"; // karşılaştırma bayrak AÇIKKEN yapılır (kapalı sonuçlar yukarıda kaydedildi)
      });
      afterAll(() => {
        delete process.env[CASE_VIEW_SCOPE_FLAG];
      });
      it("karşılaştırma bayrak açıkken koşar", () => {
        expect(process.env[CASE_VIEW_SCOPE_FLAG]).toBe("true");
        expect(Object.keys(flagOff)).toHaveLength(CASE_ROUTES.length);
      });
      it.each(CASE_ROUTES.map((r) => [r.name, r] as const))("%s: aynı durum kodu (liste uçlarında aynı gövde)", async (name, r) => {
        const res = await r.call(u.allow, c.c6);
        expect(res.status).toBe(flagOff[name].status);
        if (name.includes("/documents")) expect(JSON.stringify(res.body)).toBe(flagOff[name].body);
      });
    });
  });

  describe("bayrak AÇIK — kapı içerikten ÖNCE çalışır", () => {
    beforeAll(() => {
      process.env[CASE_VIEW_SCOPE_FLAG] = "true";
    });

    it.each(CASE_ROUTES.map((r) => [r.name, r] as const))("%s: ilişkisiz kişi 404 (içerik / bağlantı sızmaz); CaseLawyer geçer", async (_name, r) => {
      await expectDenied(await r.call(u.nobody, c.c4), "c4");
      expectPassed(await r.call(u.link, c.c4));
    });

    it("D1 kapsam dalları belge yolunda aynen: Dosya Sorumlusu, oluşturan, CaseStaff canView geçer; canView=false, pasif kart, ADMIN rolü 404", async () => {
      const preview = (x: string, k: string) => get(x, `/documents/case/${c[k]}/preview-data`);
      expectPassed(await preview(u.resp, "c1"));
      expectPassed(await preview(u.creator, "c3"));
      expectPassed(await preview(u.staff, "c5"));
      await expectDenied(await preview(u.noView, "c6"), "c6");
      await expectDenied(await preview(u.passiveCard, "c7"), "c7");
      await expectDenied(await preview(u.admin, "c4"), "c4");
      await expectDenied(await preview(u.resp, "c4"), "c4");
    });

    it("ALLOW → büro A geneli; ALLOW + DENY → DENY baskın ama C4 ilişkisi KALIR; büro B ALLOW büro A dosyasına 404", async () => {
      expectPassed(await get(u.allow, `/documents/case/${c.c6}/preview-data`));
      expectPassed(await get(u.deny, `/documents/case/${c.c4}/preview-data`));
      await expectDenied(await get(u.deny, `/documents/case/${c.c6}/preview-data`), "c6");
      await expectDenied(await get(v.allow, `/documents/case/${c.c4}/preview-data`), "c4");
      expectPassed(await get(v.allow, `/documents/case/${c.b1}/preview-data`));
    });

    it("var olmayan dosya kimliği kapsam dışıyla AYNI 404 gövdesini alır", async () => {
      const out = await get(u.nobody, `/documents/case/${c.c4}/preview-data`);
      const missing = await get(u.allow, `/documents/case/yok-${suffix}/preview-data`);
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual(out.body);
    });

    it("artefakt listesi: kapsam içi kişi yalnız o dosyanın artefaktlarını alır; liste kapsamla aynı", async () => {
      const l = await get(u.link, `/template-engine/cases/${c.c4}/documents`);
      expect(l.status).toBe(200);
      expect(l.body.map((x: { id: string }) => x.id)).toEqual([a.c4]);
      const all = await get(u.allow, `/template-engine/cases/${c.c6}/documents`);
      expect(all.body.map((x: { id: string }) => x.id)).toEqual([a.c6]);
      await expectDenied(await get(u.link, `/template-engine/cases/${c.c6}/documents`), "c6");
    });

    it("artefakt indirme: dosya artefakt satırından çözülür; kapsam dışı, uyuşmaz ve var olmayan belge AYNI 404 — içerik yok", async () => {
      const ok = await get(u.link, `/template-engine/documents/${a.c4}/download`);
      expect(ok.status).toBe(200);
      expect(ok.text ?? ok.body.toString()).toContain(SECRET.c4);
      const denied = await get(u.link, `/template-engine/documents/${a.c6}/download`);
      const missing = await get(u.link, `/template-engine/documents/yok-${suffix}/download`);
      const mismatch = await get(u.allow, `/template-engine/documents/${a.mismatch}/download`);
      for (const r of [denied, missing, mismatch]) {
        expect(r.status).toBe(404);
        expect(r.body).toEqual({ message: "Doküman bulunamadı" });
        expect(r.headers["content-disposition"]).toBeUndefined();
        expect(JSON.stringify(r.body)).not.toMatch(/ART-/);
      }
      expect((await get(u.deny, `/template-engine/documents/${a.c4}/download`)).status).toBe(200);
      expect((await get(u.deny, `/template-engine/documents/${a.c6}/download`)).status).toBe(404);
      expect((await get(v.allow, `/template-engine/documents/${a.c4}/download`)).status).toBe(404);
    });

    it("mevcut işlem yetkisi korunur: kapsam kapısı VIEWER yazım reddinin YERİNE geçmez (önce 403 VIEWER)", async () => {
      const viewer = (await db.user.create({ data: { tenantId: tA, email: `viewer-${suffix}@example.test`, name: "viewer", surname: "DS", role: "VIEWER" } })).id;
      await db.permissionGrant.create({ data: { tenantId: tA, subjectUserId: viewer, permissionKey: CASE_VIEW_ALL_KEY, effect: "ALLOW", scope: "GLOBAL" } });
      const r = await post(viewer, `/documents/case/${c.c4}/seizure-notice`, { targetType: "BANKA", targetDetails: {} });
      expect(r.status).toBe(403);
      expect(JSON.stringify(r.body)).not.toContain("CASE_VIEW_SCOPE");
    });

    it("FAIL-CLOSED: aktör kimliği olmadan kapsam servisi 403 CASE_VIEW_SCOPE_UNRESOLVED", async () => {
      await expect(scope.assertCaseVisible(tA, undefined, c.c4)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(scope.isArtifactVisible(tA, null, a.c4)).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
    });
  });
});
