// CaseModule loads pdf-poppler; PDF rendering is outside this address-read acceptance.
jest.mock("pdf-poppler", () => ({ convert: async () => { throw new Error("PDF renderer is outside CL-Z05"); } }));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import * as request from "supertest";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { PrismaService } from "../../../prisma/prisma.service";
import { StorageModule } from "../../../common/storage/storage.module";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ErrorLogModule } from "../../error-log/error-log.module";
import { MetricsRegistryModule } from "../../metrics-registry/metrics-registry.module";
import { CaseModule } from "../case.module";
import { CaseService } from "../case.service";
import { CASE_VIEW_SCOPE_FLAG } from "../case-view-scope";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("CL-Z05 requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

// Identity fixture uses real DB users; this suite does not certify JWT cryptography.
class DbIdentity implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({ where: { id: String(req.headers["x-test-user-id"]) }, include: { tenant: true } });
    if (!user?.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeDb("CL-Z05 — canonical client address on staff case detail (real HTTP / disposable PostgreSQL)", () => {
  jest.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8), tenantA = `test-clz05-a-${suffix}`, tenantB = `test-clz05-b-${suffix}`;
  const priorFlag = process.env[CASE_VIEW_SCOPE_FLAG];
  let db: PrismaClient, app: INestApplication, service: CaseService, appDb: PrismaService;
  let actor: string, outsider: string, viewer: string, inactive: string, foreignActor: string;
  const clients: Record<string, string> = {}, cases: Record<string, string> = {};

  beforeAll(async () => {
    process.env[CASE_VIEW_SCOPE_FLAG] = "true";
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule],
    }).overrideGuard(JwtAuthGuard).useValue(new DbIdentity(() => db)).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    service = app.get(CaseService);
    appDb = app.get(PrismaService);
    for (const id of [tenantA, tenantB]) await db.tenant.create({ data: { id, name: id, slug: id } });
    const user = async (tenantId: string, name: string, role: "ADMIN" | "USER" | "VIEWER" = "USER", isActive = true) =>
      (await db.user.create({ data: { tenantId, name, surname: "CLZ05", email: `${name}-${suffix}@example.test`, role, isActive } })).id;
    actor = await user(tenantA, "actor");
    outsider = await user(tenantA, "unrelated-admin", "ADMIN");
    viewer = await user(tenantA, "viewer", "VIEWER");
    inactive = await user(tenantA, "inactive", "USER", false);
    foreignActor = await user(tenantB, "other-tenant");
    const client = async (key: string, data: { tenantId?: string; address?: string; city?: string; district?: string; isActive?: boolean } = {}) => {
      clients[key] = (await db.client.create({ data: { tenantId: tenantA, type: "PERSON", name: key, displayName: key, ...data } })).id;
    };
    await client("structured"); await client("secondary"); await client("oldest");
    await client("conflict", { address: "WRONG legacy address", city: "WRONG city" });
    await client("blank", { address: "must not resurrect" });
    await client("legacy", { address: "Legacy Street", city: "Ankara", district: "Çankaya" });
    await client("archived", { address: "Current legacy fallback" });
    await client("none"); await client("passive", { isActive: false });
    await client("foreign", { tenantId: tenantB });
    const address = (key: string, street: string | null, isPrimary = false, isCurrent = true, createdAt = new Date("2026-01-01T00:00:00Z")) =>
      db.clientAddress.create({ data: { clientId: clients[key], street, isPrimary, isCurrent, createdAt } });
    await address("structured", "Non-primary current");
    await address("structured", "Canonical primary", true);
    await address("secondary", "Second client address", true);
    await address("oldest", "Newer active row", false, true, new Date("2026-02-01T00:00:00Z"));
    await address("oldest", "Oldest active row");
    await address("conflict", "Structured wins", true);
    await address("blank", null, true);
    await address("archived", "DO NOT expose archived row", false, false);
    await address("passive", "Passive party current address", true);
    await address("foreign", "FOREIGN ADDRESS MUST NOT BE ADDED", true);
    const caseRow = async (key: string, clientKeys: string[], creator = actor, tenantId = tenantA, legacy = true) => {
      cases[key] = (await db.case.create({ data: {
        tenantId, fileNumber: `CLZ05-${key}-${suffix}`, type: "GENERAL_EXECUTION", createdById: creator,
        ...(legacy ? { clientId: clients[clientKeys[0]] } : {}),
        caseClients: { create: clientKeys.map(clientKey => ({ clientId: clients[clientKey], role: "ALACAKLI" })) },
      } })).id;
    };
    for (const key of ["structured", "oldest", "conflict", "blank", "legacy", "archived", "none", "passive"]) await caseRow(key, [key]);
    await caseRow("multi", ["structured", "secondary"], actor, tenantA, false);
    await caseRow("viewer", ["structured"], viewer);
    await caseRow("foreign", ["foreign"], foreignActor, tenantB);
    // Existing schema permits this bad legacy relation; the new projection must not read outside tenant A.
    await caseRow("foreign-link", ["foreign"]);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (priorFlag === undefined) delete process.env[CASE_VIEW_SCOPE_FLAG]; else process.env[CASE_VIEW_SCOPE_FLAG] = priorFlag;
    await app?.close();
    if (db) {
      const where = { tenantId: { in: [tenantA, tenantB] } };
      await db.case.deleteMany({ where });
      await db.client.deleteMany({ where });
      await db.user.deleteMany({ where });
      await db.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
      await db.$disconnect();
    }
  });
  const detail = (key: string, userId = actor) => request(app.getHttpServer()).get(`/cases/${cases[key]}`).set("x-test-user-id", userId);

  it("CLZ05 structured-only address appears in legacy and canonical client projections without raw history", async () => {
    const res = await detail("structured"); expect(res.status).toBe(200);
    expect(res.body.client.resolvedAddress).toEqual({ line: "Canonical primary", source: "structured" });
    expect(res.body.caseClients[0].client.resolvedAddress).toEqual(res.body.client.resolvedAddress);
    expect(res.body.client).not.toHaveProperty("addresses");
    expect(res.body.caseClients[0].client).not.toHaveProperty("addresses");
  });
  it("CLZ05 multi-party case resolves each returned client with one tenant-bound bulk read", async () => {
    const spy = jest.spyOn(appDb.client, "findMany");
    const res = await detail("multi"); expect(res.status).toBe(200);
    expect(res.body.caseClients.map((row: { client: { id: string; resolvedAddress: unknown } }) => [row.client.id, row.client.resolvedAddress])).toEqual(expect.arrayContaining([
      [clients.structured, { line: "Canonical primary", source: "structured" }],
      [clients.secondary, { line: "Second client address", source: "structured" }],
    ]));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ where: { tenantId: tenantA, id: { in: expect.arrayContaining([clients.structured, clients.secondary]) } }, select: { addresses: { where: { isCurrent: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } } });
  });
  it.each([
    ["oldest", "Oldest active row", "structured"],
    ["conflict", "Structured wins", "structured"],
    ["blank", null, "structured"],
    ["legacy", "Legacy Street, Çankaya/Ankara", "legacy"],
    ["archived", "Current legacy fallback", "legacy"],
    ["none", null, "none"],
    ["passive", "Passive party current address", "structured"],
  ])("CLZ05 canonical resolver preserves %s semantics", async (key, line, source) => {
    const res = await detail(String(key)); expect(res.status).toBe(200);
    expect(res.body.client.resolvedAddress).toEqual({ line, source });
    expect(JSON.stringify(res.body)).not.toContain("DO NOT expose archived row");
  });
  it("CLZ05 VIEWER keeps existing related-case read access", async () => {
    const res = await detail("viewer", viewer); expect(res.status).toBe(200);
    expect(res.body.client.resolvedAddress.line).toBe("Canonical primary");
  });
  it.each([{ label: "unrelated ADMIN", userId: () => outsider }, { label: "foreign tenant", userId: () => foreignActor }])("CLZ05 $label cannot trigger an address read for an out-of-scope case", async ({ userId }) => {
    const spy = jest.spyOn(appDb.client, "findMany");
    const res = await detail("structured", userId()); expect(res.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });
  it("CLZ05 inactive identity is rejected before reading a case address", async () => {
    const spy = jest.spyOn(appDb.client, "findMany");
    expect((await detail("structured", inactive)).status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
  it("CLZ05 corrupt cross-tenant client link adds no foreign resolved address", async () => {
    const res = await detail("foreign-link"); expect(res.status).toBe(200);
    expect(res.body.client.resolvedAddress).toEqual({ line: null, source: "none" });
    expect(res.body.caseClients[0].client.resolvedAddress).toEqual({ line: null, source: "none" });
    expect(JSON.stringify(res.body)).not.toContain("FOREIGN ADDRESS MUST NOT BE ADDED");
  });
  it("CLZ05 address read failure is an error, never a successful legacy fallback", async () => {
    jest.spyOn(appDb.client, "findMany").mockRejectedValueOnce(new Error("CLZ05 injected read failure"));
    const res = await detail("legacy"); expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty("client");
  });
  it("CLZ05 internal findOne contract is not enriched", async () => {
    const res = await service.findOne(tenantA, cases.structured);
    expect(res.client).not.toHaveProperty("resolvedAddress");
    expect(res.caseClients[0].client).not.toHaveProperty("resolvedAddress");
  });
});
