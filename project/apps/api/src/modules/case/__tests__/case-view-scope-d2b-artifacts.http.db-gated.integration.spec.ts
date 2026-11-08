// TemplateEngineModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
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
import { ErrorLogModule } from "../../error-log/error-log.module";
import { MetricsRegistryModule } from "../../metrics-registry/metrics-registry.module";
import { TemplateEngineModule } from "../../template-engine/template-engine.module";
import { CASE_VIEW_ALL_KEY, CASE_VIEW_SCOPE_FLAG } from "../case-view-scope";

/**
 * F02 P3 — kalan iki belge erişim açığı (owner kararları 08.11.2026), gerçek HTTP (TemplateEngineModule + ValidationPipe) +
 * tek kullanımlık PostgreSQL. JWT yerine DB kimliği.
 *  D2b `POST template-engine/cases/:caseId/documents/:format`: dosya görünüm kapsamı (bayrak açıkken) mevcut işlem yetkilerine EK
 *    koşul; kimlik + VIEWER reddinden SONRA, render / DocumentArtifact + DOCUMENT_GENERATED kaydından ÖNCE. Kapsam dışı → 404 ve SIFIR
 *    kalıcı çıktı. Tek başına üretim yetkisi vermez (VIEWER kapsam içinde de 403).
 *  D2 artefakt ↔ bağlı dosya ↔ aktör kiracı eşleşmesi bayraktan BAĞIMSIZ (indirme, liste, üretim önbelleği): eksik / uyuşmaz ilişkide
 *    içerik ve indirme başlığı yok, mevcut "Doküman bulunamadı" 404'ü. Kişi kapsamı (kim hangi dosyayı görür) bayrağa bağlı kalır.
 * Kod okuması gerçek erişim kanıtı değildir; bu spec yalnız yalıtılmış DB'deki davranışı ölçer.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("D2b / artifact tenant match requires TEST_DATABASE_URL in CI.");
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

describeDb("F02 P3 — D2b belge üretim ucu kapsamı + artefakt/dosya/aktör kiracı eşleşmesi (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const suffix = randomUUID().slice(0, 8);
  const tA = `test-d2b-a-${suffix}`;
  const tB = `test-d2b-b-${suffix}`;
  const originalFlag = process.env[CASE_VIEW_SCOPE_FLAG];
  const dir = mkdtempSync(join(tmpdir(), "p3d2b-art-"));
  let db: PrismaClient;
  let app: INestApplication;

  const u = { link: "", nobody: "", allow: "", viewer: "" };
  const v = { allow: "" };
  const c: Record<string, string> = {};
  const a: Record<string, string> = {};
  const SECRET = { c4: `ART-C4-${suffix}`, mmA: `ART-MM-A-${suffix}`, mmB: `ART-MM-B-${suffix}`, cache: `ART-CACHE-B-${suffix}` };

  const mkArtifact = async (key: string, tenantId: string, caseId: string, secret: string, extra: Record<string, unknown> = {}) => {
    const filePath = join(dir, `${key}.txt`);
    writeFileSync(filePath, secret);
    a[key] = (
      await db.documentArtifact.create({
        data: {
          tenantId, caseId, documentType: "TAKIP_TALEBI", format: "TXT", templateVersion: "v1", dataHash: `h-${key}-${suffix}`,
          status: "READY", filePath, fileName: `${key}-${suffix}.txt`, fileSize: secret.length, ...extra,
        } as never,
      })
    ).id;
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, TemplateEngineModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => db))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    for (const id of [tA, tB]) await db.tenant.create({ data: { id, name: id, slug: id } });
    const mkUser = async (tenantId: string, label: string, role: "USER" | "VIEWER" = "USER") =>
      (await db.user.create({ data: { tenantId, email: `${label}-${suffix}@example.test`, name: label, surname: "DB", role } })).id;
    u.link = await mkUser(tA, "link");
    u.nobody = await mkUser(tA, "nobody");
    u.allow = await mkUser(tA, "allow");
    u.viewer = await mkUser(tA, "viewer", "VIEWER");
    v.allow = await mkUser(tB, "b-allow");
    const lawyer = async (userId: string) => (await db.lawyer.create({ data: { tenantId: tA, userId, name: "Av", surname: "DB" } })).id;
    const mkCase = async (key: string, tenantId: string, data: Record<string, unknown> = {}) => {
      c[key] = (await db.case.create({ data: { tenantId, fileNumber: `DB-${key}-${suffix}`, type: "GENERAL_EXECUTION", ...data } as never })).id;
    };
    await mkCase("c4", tA);
    await mkCase("c6", tA);
    await mkCase("c8", tA);
    await mkCase("b1", tB, { createdById: v.allow });
    // Belgenin kendi veri kapısı: operasyonel çıktı aktif borçlu ister (kapsamla ilgisiz; üretimin gerçekten çalıştığını göstermek için).
    for (const k of ["c4", "c6", "c8"]) {
      const debtor = await db.debtor.create({ data: { tenantId: tA, type: "COMPANY", name: `Borclu-${k}-${suffix}` } as never });
      await db.caseDebtor.create({ data: { caseId: c[k], debtorId: debtor.id } as never });
    }
    await db.caseLawyer.create({ data: { caseId: c.c4, lawyerId: await lawyer(u.link) } });
    await db.caseLawyer.create({ data: { caseId: c.c4, lawyerId: await lawyer(u.viewer) } });
    for (const [tenantId, subjectUserId] of [[tA, u.allow], [tA, u.viewer], [tB, v.allow]] as const) {
      await db.permissionGrant.create({ data: { tenantId, subjectUserId, permissionKey: CASE_VIEW_ALL_KEY, effect: "ALLOW", scope: "GLOBAL" } });
    }

    await mkArtifact("c4", tA, c.c4, SECRET.c4);
    await mkArtifact("mmA", tA, c.b1, SECRET.mmA); // büro A satırı, büro B dosyası
    await mkArtifact("mmB", tB, c.c4, SECRET.mmB); // büro B satırı, büro A dosyası
    await mkArtifact("noFile", tA, c.c4, "yok", { filePath: null }); // eksik içerik ilişkisi (dosya yolu yok)
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env[CASE_VIEW_SCOPE_FLAG];
    else process.env[CASE_VIEW_SCOPE_FLAG] = originalFlag;
    await app?.close();
    for (const tenantId of [tA, tB]) {
      await db.documentArtifact.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.permissionGrant.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    }
    for (const tenantId of [tA, tB]) {
      await db.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.debtor.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.lawyer.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await db.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());
  const get = (actor: string, path: string) => http().get(path).set("x-test-user-id", actor);
  const generate = (actor: string, caseId: string, format = "xml") =>
    http().post(`/template-engine/cases/${caseId}/documents/${format}?type=takip-talebi`).set("x-test-user-id", actor).send({}).buffer(true);
  /** Kalıcı çıktı: DocumentArtifact satırı + DOCUMENT_GENERATED denetim kaydı (dosya içeriği bu uçta diske yazılmaz). */
  const persisted = async (tenantId: string, caseId: string) => ({
    artifacts: await db.documentArtifact.count({ where: { caseId, documentType: "TAKIP_TALEBI", format: "XML" } }),
    audits: await db.auditLog.count({ where: { tenantId, action: "DOCUMENT_GENERATED", metadata: { path: ["caseId"], equals: caseId } } }),
  });
  const NOT_FOUND_DOC = { message: "Doküman bulunamadı" };
  const expectNoDocument = (res: request.Response, hidden: string[]) => {
    expect([res.status, res.body, res.headers["content-disposition"]]).toEqual([404, NOT_FOUND_DOC, undefined]);
    for (const s of hidden) expect(JSON.stringify(res.body) + String(res.text ?? "")).not.toContain(s);
  };
  const expectScopeDenied = (res: request.Response, caseKey: string) => {
    expect([res.status, res.body.message, res.headers["content-disposition"]]).toEqual([404, "Dosya bulunamadı", undefined]);
    expect(JSON.stringify(res.body)).not.toContain(c[caseKey]);
    expect(JSON.stringify(res.body)).not.toContain(`DB-${caseKey}-${suffix}`);
  };

  describe("bayrak KAPALI — kiracı eşleşmesi yine zorunlu; kişi kapsamı yok (bugünkü gibi)", () => {
    beforeAll(() => {
      delete process.env[CASE_VIEW_SCOPE_FLAG];
    });

    it("aynı kiracı geçerli yol değişmez: ilişkisiz kişi aynı kiracının artefaktını indirir ve listeler (kişi kapsamı bayrağa bağlı)", async () => {
      const dl = await get(u.nobody, `/template-engine/documents/${a.c4}/download`);
      expect(dl.status).toBe(200);
      expect(dl.headers["content-disposition"]).toContain(`c4-${suffix}.txt`);
      expect(dl.text ?? dl.body.toString()).toContain(SECRET.c4);
      const list = await get(u.nobody, `/template-engine/cases/${c.c4}/documents`);
      expect(list.body.map((x: { id: string }) => x.id).sort()).toEqual([a.c4, a.noFile].sort());
    });

    it("uyuşmaz artefakt İNMEZ (iki yön): büro A satırı + büro B dosyası; büro B satırı + büro A dosyası → içerik / başlık yok, mevcut 404", async () => {
      expectNoDocument(await get(u.nobody, `/template-engine/documents/${a.mmA}/download`), [SECRET.mmA]);
      expectNoDocument(await get(v.allow, `/template-engine/documents/${a.mmB}/download`), [SECRET.mmB]);
    });

    it("eksik içerik ilişkisi ve var olmayan artefakt AYNI 404 gövdesini alır", async () => {
      expectNoDocument(await get(u.link, `/template-engine/documents/${a.noFile}/download`), []);
      expectNoDocument(await get(u.link, `/template-engine/documents/yok-${suffix}/download`), []);
    });

    it("liste: uyuşmaz satır listelenmez (büro A kişisi büro B dosyasının kimliğiyle büro A satırını görmez; büro B kişisi kendi dosyasında yalnız eşleşeni)", async () => {
      expect((await get(u.nobody, `/template-engine/cases/${c.b1}/documents`)).body).toEqual([]);
      expect((await get(v.allow, `/template-engine/cases/${c.c4}/documents`)).body).toEqual([]);
      expect((await get(v.allow, `/template-engine/cases/${c.b1}/documents`)).body).toEqual([]);
    });

    it("D2b bayrak kapalı: ilişkisiz kişi üretir (bugünkü işlem yetkisi; kapsam yalnız bayrakla), kalıcı çıktı oluşur", async () => {
      const before = await persisted(tA, c.c6);
      const res = await generate(u.nobody, c.c6);
      expect({ status: res.status, body: res.status === 201 ? undefined : res.body }).toEqual({ status: 201, body: undefined });
      expect(await persisted(tA, c.c6)).toEqual({ artifacts: before.artifacts + 1, audits: before.audits + 1 });
    });

    it("üretim önbelleği kiracıya bağlı: aynı dosyanın önbellek anahtarına yazılmış BAŞKA kiracı satırının dosyası dönmez", async () => {
      // 1) Gerçek veri parmak izini elde et (büro A üretimi), 2) satırı büro B'ye ait ve içerikli bir satırla değiştir (veri tutarsızlığı).
      expect((await generate(u.link, c.c8)).status).toBe(201);
      const own = await db.documentArtifact.findFirstOrThrow({ where: { caseId: c.c8, format: "XML" } });
      await db.documentArtifact.delete({ where: { id: own.id } });
      const filePath = join(dir, "cache-b.txt");
      writeFileSync(filePath, SECRET.cache);
      await db.documentArtifact.create({
        data: { tenantId: tB, caseId: c.c8, documentType: own.documentType, format: "XML", templateVersion: own.templateVersion, dataHash: own.dataHash, status: "READY", filePath, fileName: "cache-b.xml", fileSize: SECRET.cache.length },
      });
      const res = await generate(u.link, c.c8);
      expect(res.status).toBe(201);
      expect(res.headers["x-from-cache"]).toBe("false");
      expect(String(res.text ?? "")).not.toContain(SECRET.cache);
      expect(String(res.text ?? "")).toContain("<"); // gerçek üretim çıktısı (XML) — boş yanıt değil
    });
  });

  describe("bayrak AÇIK — D2b kapısı render / kayıttan ÖNCE; kiracı eşleşmesi + kişi kapsamı", () => {
    beforeAll(() => {
      process.env[CASE_VIEW_SCOPE_FLAG] = "true";
    });

    it("D2b: kapsam dışı kişi 404 ve SIFIR kalıcı çıktı (artefakt satırı yok, DOCUMENT_GENERATED yok, indirme başlığı yok)", async () => {
      const before = await persisted(tA, c.c6);
      for (const format of ["xml", "docx", "pdf"]) expectScopeDenied(await generate(u.nobody, c.c6, format), "c6");
      expect(await persisted(tA, c.c6)).toEqual(before);
    });

    it("D2b: yetkili (CaseLawyer) üretir; ALLOW büro geneli üretir; kalıcı çıktı yalnız izinli istekte", async () => {
      const b4 = await persisted(tA, c.c4);
      const r1 = await generate(u.link, c.c4);
      expect(r1.status).toBe(201);
      expect(r1.headers["content-disposition"]).toContain(`takip-talebi-${c.c4}.xml`);
      expect(await persisted(tA, c.c4)).toEqual({ artifacts: b4.artifacts + 1, audits: b4.audits + 1 });
      const b6 = await persisted(tA, c.c6);
      expect((await generate(u.allow, c.c6)).status).toBe(201);
      expect((await persisted(tA, c.c6)).audits).toBe(b6.audits + 1);
    });

    it("D2b: iki kiracı — büro B ALLOW büro A dosyasına 404, sıfır çıktı; var olmayan dosya kapsam dışıyla AYNI 404", async () => {
      const before = await persisted(tA, c.c4);
      const cross = await generate(v.allow, c.c4);
      expectScopeDenied(cross, "c4");
      expect(await persisted(tA, c.c4)).toEqual(before);
      expect(await db.auditLog.count({ where: { tenantId: tB, action: "DOCUMENT_GENERATED" } })).toBe(0);
      const missing = await generate(u.allow, `yok-${suffix}`);
      expect([missing.status, missing.body]).toEqual([404, (await generate(u.nobody, c.c6)).body]);
    });

    it("D2b: mevcut işlem yetkisi korunur — VIEWER kapsam İÇİNDE de 403 (kapsam tek başına üretim yetkisi vermez); kapsam dışında da önce 403", async () => {
      const before = await persisted(tA, c.c4);
      for (const caseKey of ["c4", "c6"]) {
        const res = await generate(u.viewer, c[caseKey]);
        expect([caseKey, res.status, res.body.code]).toEqual([caseKey, 403, "VIEWER_WRITE_DENIED"]);
      }
      expect(await persisted(tA, c.c4)).toEqual(before);
    });

    it("indirme: uyuşmaz artefakt ALLOW'lu kişiye de inmez; aynı 404 gövdesi; kişi kapsamı bayrakla çalışır", async () => {
      expectNoDocument(await get(u.allow, `/template-engine/documents/${a.mmA}/download`), [SECRET.mmA]);
      expectNoDocument(await get(v.allow, `/template-engine/documents/${a.mmB}/download`), [SECRET.mmB]);
      expectNoDocument(await get(u.nobody, `/template-engine/documents/${a.c4}/download`), [SECRET.c4]);
      const ok = await get(u.link, `/template-engine/documents/${a.c4}/download`);
      expect(ok.status).toBe(200);
      expect(ok.text ?? ok.body.toString()).toContain(SECRET.c4);
    });

    it("liste: kapsam içi kişi yalnız eşleşen satırları görür; uyuşmaz satır yok", async () => {
      const list = await get(u.link, `/template-engine/cases/${c.c4}/documents`);
      expect(list.status).toBe(200);
      expect(list.body.map((x: { id: string }) => x.id)).not.toContain(a.mmB);
      expect(list.body.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([a.c4]));
    });
  });
});
