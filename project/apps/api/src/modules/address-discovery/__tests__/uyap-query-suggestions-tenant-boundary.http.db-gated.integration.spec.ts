// AddressDiscoveryModule grafiği `pdf-poppler`'ı yükleyebilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
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
import { ErrorLogModule } from "../../error-log/error-log.module";
import { MetricsRegistryModule } from "../../metrics-registry/metrics-registry.module";
import { AddressDiscoveryModule } from "../address-discovery.module";

/**
 * Kiracı sınırı (F02 P3 taraması yan gözlemi, owner kararı 09.11.2026) — `GET /address-discovery/uyap-query/debtor/:caseDebtorId/suggestions`.
 *
 * KUSUR (düzeltme öncesi): `UyapQueryService.getSuggestedQueries(tenantId, caseDebtorId)` `tenantId`'yi iki sorgusunda da
 * KULLANMIYORDU: dosya borçlusu yalnız kimlikle, yapılmış sorgular yalnız `caseDebtorId` ile okunuyordu. Sonuç:
 *  - başka büronun dosya borçlusu kimliğiyle çağıran kullanıcı, o borçlunun türüne (şirket / gerçek kişi) ve yapılmış sorgu
 *    türlerine göre daraltılmış öneri listesini alıyordu (varlık + tür + işlem geçmişi çıkarımı);
 *  - başka büronun satırı (aynı `caseDebtorId`'yi gösteren `UyapQuery`) bu büronun öneri listesini değiştirebiliyordu.
 *
 * Gerçek HTTP (AddressDiscoveryModule + ValidationPipe) + tek kullanımlık PostgreSQL; JWT yerine DB kimliği. Mock kayıt yok.
 * Düzeltme bayraktan BAĞIMSIZDIR (kiracı sınırı): `OFFICE_CASE_VIEW_SCOPE_ENABLED` kapalı ve açıkken aynı sonuç.
 *
 * F02 P3 tarama S4 (10.11.2026): bu uç artık dosya borçlusu nesne kapısını da taşır. Bayrak açıkken başka büronun ve var olmayan
 * dosya borçlusu kapının gövdesini ("Dosya bulunamadı"), kapalıyken servisin gövdesini ("Borçlu bulunamadı") alır; ikisi de 404
 * ve kendi içinde aynıdır. Kiracı sınırını yalıtmak için iki kullanıcıya da büro geneli dosya izni verilir (dosya kapsamı ayrı
 * spec'te ölçülür: debtor-side-case-view-scope).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("UYAP query suggestions tenant boundary requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;
const FLAG = "OFFICE_CASE_VIEW_SCOPE_ENABLED";

class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({ where: { id: String(req.headers["x-test-user-id"]) } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeDb("UYAP sorgu önerileri — kiracı sınırı (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const suffix = randomUUID().slice(0, 8);
  const tA = `test-uqs-a-${suffix}`;
  const tB = `test-uqs-b-${suffix}`;
  const MISSING = `yok-${suffix}`;
  const originalFlag = process.env[FLAG];
  let db: PrismaClient;
  let app: INestApplication;
  const u = { a: "", b: "" };
  const cd = { aCompany: "", aPerson: "", bCompany: "" };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    const identity = new DbUserIdentityGuard(() => db);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, AddressDiscoveryModule],
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
    const mkUser = async (tenantId: string, label: string) =>
      (await db.user.create({ data: { tenantId, email: `${label}-${suffix}@example.test`, name: label, surname: "UQS", role: "USER" } })).id;
    u.a = await mkUser(tA, "a");
    u.b = await mkUser(tB, "b");
    for (const [tenantId, subjectUserId] of [[tA, u.a], [tB, u.b]]) {
      await db.permissionGrant.create({ data: { tenantId, subjectUserId, permissionKey: "office.cases.view_all", effect: "ALLOW", scope: "GLOBAL" } });
    }

    const mkCaseDebtor = async (tenantId: string, key: string, type: "COMPANY" | "INDIVIDUAL") => {
      const kase = await db.case.create({ data: { tenantId, fileNumber: `UQS-${key}-${suffix}`, type: "GENERAL_EXECUTION" } as never });
      const debtor = await db.debtor.create({ data: { tenantId, type, name: `BRC-${key}-${suffix}` } as never });
      return (await db.caseDebtor.create({ data: { caseId: kase.id, debtorId: debtor.id } as never })).id;
    };
    cd.aCompany = await mkCaseDebtor(tA, "ac", "COMPANY");
    cd.aPerson = await mkCaseDebtor(tA, "ap", "INDIVIDUAL");
    cd.bCompany = await mkCaseDebtor(tB, "bc", "COMPANY");

    // Büro A'nın kendi yapılmış sorgusu: şirket borçlusunda TICARET_ODASI beklemede.
    await db.uyapQuery.create({
      data: { tenantId: tA, caseDebtorId: cd.aCompany, queryType: "TICARET_ODASI", queryCode: "AF", status: "PENDING", requestedBy: u.a } as never,
    });
    // Kiracı uyuşmazlığı: büro B satırı, büro A'nın dosya borçlusunu gösteriyor (UyapQuery.tenantId ile CaseDebtor arasında DB kısıtı yok).
    await db.uyapQuery.create({
      data: { tenantId: tB, caseDebtorId: cd.aCompany, queryType: "VERGI_DAIRESI", queryCode: "AJ", status: "COMPLETED", requestedBy: u.b } as never,
    });
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
    await app?.close();
    await db.uyapQuery.deleteMany({ where: { tenantId: { in: [tA, tB] } } }).catch(() => undefined);
    for (const tenantId of [tA, tB]) {
      await db.caseDebtor.deleteMany({ where: { case: { tenantId } } }).catch(() => undefined);
      await db.permissionGrant.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.debtor.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  const path = (caseDebtorId: string) => `/address-discovery/uyap-query/debtor/${caseDebtorId}/suggestions`;
  const get = (actor: string, caseDebtorId: string) => request(app.getHttpServer()).get(path(caseDebtorId)).set("x-test-user-id", actor);
  const types = (res: request.Response) => (res.body as Array<{ queryType: string }>).map((s) => s.queryType).sort();
  /** Bayrak kapalı → servisin gövdesi; bayrak açık → dosya borçlusu nesne kapısının gövdesi (S4). */
  const notFound = () => ({ statusCode: 404, message: process.env[FLAG] === "true" ? "Dosya bulunamadı" : "Borçlu bulunamadı", error: "Not Found" });

  describe.each([
    ["bayrak KAPALI", () => delete process.env[FLAG]],
    ["bayrak AÇIK", () => (process.env[FLAG] = "true")],
  ])("%s — kiracı sınırı bayraktan bağımsız", (_label, setFlag) => {
    beforeAll(() => void setFlag());
    afterAll(() => void delete process.env[FLAG]);

    it("kendi bürosunun dosya borçlusu: 200; yalnız KENDİ bürosunun yapılmış sorgusu listeden düşer", async () => {
      const res = await get(u.a, cd.aCompany);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(types(res)).not.toContain("TICARET_ODASI"); // büro A'nın kendi beklemedeki sorgusu
      expect(types(res)).toContain("VERGI_DAIRESI"); // büro B satırı büro A'nın önerisini DEĞİŞTİREMEZ
    });

    it("başka büronun dosya borçlusu: var olmayanla AYNI 404; öneri / tür / sorgu geçmişi sızmaz", async () => {
      const foreign = await get(u.b, cd.aCompany);
      const missing = await get(u.b, MISSING);
      expect([foreign.status, foreign.body]).toEqual([404, notFound()]);
      expect([missing.status, missing.body]).toEqual([404, notFound()]);
      expect(Object.keys(foreign.body).sort()).toEqual(["error", "message", "statusCode"]);
      for (const leak of ["queryType", "TICARET_ODASI", "VERGI_DAIRESI", cd.aCompany]) expect(JSON.stringify(foreign.body)).not.toContain(leak);
    });

    it("iki yönde de geçerli: büro A kullanıcısı büro B'nin dosya borçlusunu okuyamaz; borçlu türü çıkarılamaz", async () => {
      const company = await get(u.a, cd.bCompany);
      expect([company.status, company.body]).toEqual([404, notFound()]);
      // Şirket ve gerçek kişi borçlusu farklı öneri listesi üretir; başka büro için ikisi de aynı 404 gövdesidir.
      const person = await get(u.b, cd.aPerson);
      expect([person.status, person.body]).toEqual([404, notFound()]);
    });

    it("kendi bürosunda borçlu türü ayrımı korunur (işlev değişmedi)", async () => {
      const company = types(await get(u.a, cd.aCompany));
      const person = types(await get(u.a, cd.aPerson));
      expect(person).toContain("NUFUS_ADRES");
      expect(company).not.toEqual(person);
    });

    it("eksik kimlik: 401; yanıt öneri taşımaz", async () => {
      const res = await request(app.getHttpServer()).get(path(cd.aCompany));
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain("queryType");
    });
  });

  describe("servis düzeyi — kiracı bağlamı eksikse fail-closed", () => {
    it("tenantId yok / boş → 404; Prisma'nın `undefined` süzgeci düşürmesi kiracısız okumaya dönüşmez", async () => {
      const { UyapQueryService } = await import("../uyap-query.service");
      const service = app.get(UyapQueryService);
      for (const tenantId of [undefined, "", null]) {
        await expect(service.getSuggestedQueries(tenantId as never, cd.aCompany)).rejects.toMatchObject({ status: 404, message: "Borçlu bulunamadı" });
      }
    });
  });

  describe("öneri ile oluşturma tutarlı: başka büronun satırı bu büronun sorgusunu engellemez", () => {
    it("büro A, önerilen VERGI_DAIRESI sorgusunu oluşturur (büro B satırı aynı dosya borçlusunu gösterse de); satır büro A'ya yazılır", async () => {
      const res = await request(app.getHttpServer())
        .post("/address-discovery/uyap-query")
        .set("x-test-user-id", u.a)
        .send({ caseDebtorId: cd.aCompany, queryType: "VERGI_DAIRESI" });
      expect([res.status, res.body.queryType, res.body.tenantId]).toEqual([201, "VERGI_DAIRESI", tA]);
      const rows = await db.uyapQuery.findMany({ where: { caseDebtorId: cd.aCompany, queryType: "VERGI_DAIRESI" }, select: { tenantId: true }, orderBy: { tenantId: "asc" } });
      expect(rows.map((r) => r.tenantId).sort()).toEqual([tA, tB].sort());
      // Kendi bürosunun mükerrer denetimi korunur.
      const again = await request(app.getHttpServer())
        .post("/address-discovery/uyap-query")
        .set("x-test-user-id", u.a)
        .send({ caseDebtorId: cd.aCompany, queryType: "VERGI_DAIRESI" });
      expect(again.status).toBe(400);
      // Başka büro, bu dosya borçlusu için sorgu oluşturamaz (mevcut kiracı denetimi; değişmedi).
      const foreign = await request(app.getHttpServer())
        .post("/address-discovery/uyap-query")
        .set("x-test-user-id", u.b)
        .send({ caseDebtorId: cd.aCompany, queryType: "SGK" });
      expect(foreign.status).toBe(404);
    });
  });
});
