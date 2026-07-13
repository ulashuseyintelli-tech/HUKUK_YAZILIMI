/**
 * MPB-028(a) PR-3 — LegalTimeShadowService disposable-DB entegrasyon testi.
 *
 * Unit testler (legal-time-shadow.service.spec.ts) Prisma'yı mock'lar; bu dosya gerçek
 * bir Postgres üzerinde Case/NotificationQueue/Tebligat fixture'larıyla legacy+canonical
 * hesabın doğru satırı ürettiğini, tenant-isolation'ın fail-closed olduğunu ve immutable
 * kayıtların (supersede YOK, her çağrı bağımsız satır) doğru davrandığını kanıtlar.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { NotFoundException } from "@nestjs/common";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { LegalTimeShadowService } from "../legal-time-shadow.service";
import { LegalDeadlineService } from "../../legal-deadline/legal-deadline.service";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "LegalTimeShadowService disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("LegalTimeShadowService — disposable DB", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let service: LegalTimeShadowService;
  const createdTenantIds = new Set<string>();
  const ORIGINAL_ENV = process.env.LEGAL_TIME_SHADOW_ENABLED;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const legalDeadlineService = new LegalDeadlineService(prisma as any);
    service = new LegalTimeShadowService(prisma as any, legalDeadlineService);
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(tenantId);
    }
    await prisma.$disconnect();
    process.env.LEGAL_TIME_SHADOW_ENABLED = ORIGINAL_ENV;
  });

  beforeEach(() => {
    process.env.LEGAL_TIME_SHADOW_ENABLED = "true";
  });

  async function cleanupTenant(tenantId: string) {
    await prisma.legalTimeShadowDiff.deleteMany({ where: { tenantId } });
    await prisma.notificationQueue.deleteMany({ where: { tenantId } });
    await prisma.tebligat.deleteMany({ where: { tenantId } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    createdTenantIds.delete(tenantId);
  }

  async function buildScopedFixture(
    label: string,
    opts: { deliveredAt?: Date; workflowStage?: string } = {},
  ) {
    const tenantId = `test-lts-${label}-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);

    await prisma.tenant.create({
      data: { id: tenantId, name: `LegalTimeShadow Test ${label}`, slug: `test-lts-${label}-${randomUUID().slice(0, 8)}` },
    });

    const client = await prisma.client.create({
      data: { tenantId, displayName: "LegalTimeShadow Test Muvekkil", type: "INDIVIDUAL" },
    });

    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-LTS-${randomUUID().slice(0, 6)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
        isAutoMode: false,
        workflowStage: (opts.workflowStage ?? "PAYMENT_ORDER") as any,
      },
    });

    if (opts.deliveredAt) {
      await prisma.notificationQueue.create({
        data: {
          tenantId,
          caseId: caseRow.id,
          type: "PAYMENT_ORDER",
          channel: "SMS",
          recipient: "05001234567",
          status: "DELIVERED",
          deliveredAt: opts.deliveredAt,
        },
      });
    }

    const tebligat = await prisma.tebligat.create({
      data: {
        tenantId,
        caseId: caseRow.id,
        tebligatType: "ODEME_EMRI",
        addressType: "BILINEN",
        addressText: "Test Adres No:1",
        recipientName: "Test Borçlu",
        channel: "PTT",
        deliveredAt: new Date("2026-07-20T00:00:00Z"),
      },
    });

    return { tenantId, caseId: caseRow.id, tebligatId: tebligat.id };
  }

  it("gerçek Postgres üzerinde diff satırı oluşturur, delta doğru hesaplanır", async () => {
    const { tenantId, caseId, tebligatId } = await buildScopedFixture("happy", {
      deliveredAt: new Date("2026-07-18T00:00:00Z"),
    });

    const result = await service.computeShadowDiff({ tenantId, tebligatId });

    expect(result).not.toBeNull();
    expect(result!.caseId).toBe(caseId);
    expect(result!.legacyDate).toEqual(new Date("2026-07-18T00:00:00Z"));
    expect(result!.canonicalDate).toEqual(new Date("2026-07-20T00:00:00Z"));
    expect(result!.deltaDays).toBe(2);
    expect(result!.reasonCode).toBe("DIRECT_DELIVERY");

    const rows = await prisma.legalTimeShadowDiff.findMany({ where: { tenantId, sourceTebligatId: tebligatId } });
    expect(rows).toHaveLength(1);
  });

  it("flag kapalıyken hiçbir satır oluşmaz (gerçek DB'de de doğrulanır)", async () => {
    process.env.LEGAL_TIME_SHADOW_ENABLED = "false";
    const { tenantId, tebligatId } = await buildScopedFixture("flag-off", {
      deliveredAt: new Date("2026-07-18T00:00:00Z"),
    });

    const result = await service.computeShadowDiff({ tenantId, tebligatId });

    expect(result).toBeNull();
    const rows = await prisma.legalTimeShadowDiff.findMany({ where: { tenantId } });
    expect(rows).toHaveLength(0);
  });

  it("aynı tebligat için tekrar çağrı YENİ bağımsız satır oluşturur (immutable — supersede/update yok)", async () => {
    const { tenantId, tebligatId } = await buildScopedFixture("repeat", {
      deliveredAt: new Date("2026-07-18T00:00:00Z"),
    });

    const first = await service.computeShadowDiff({ tenantId, tebligatId });
    const second = await service.computeShadowDiff({ tenantId, tebligatId });

    expect(second!.id).not.toBe(first!.id);
    const rows = await prisma.legalTimeShadowDiff.findMany({ where: { tenantId, sourceTebligatId: tebligatId } });
    expect(rows).toHaveLength(2);
    // İlk satır hâlâ olduğu gibi duruyor — hiçbir alanı değişmemiş.
    const untouched = await prisma.legalTimeShadowDiff.findUniqueOrThrow({ where: { id: first!.id } });
    expect(untouched.legacyDate).toEqual(first!.legacyDate);
    expect(untouched.canonicalDate).toEqual(first!.canonicalDate);
  });

  it("cross-tenant: yanlış tenantId ile çağrı NotFoundException fırlatır, hiçbir satır oluşmaz", async () => {
    const fixtureA = await buildScopedFixture("tenant-a", { deliveredAt: new Date("2026-07-18T00:00:00Z") });
    const fixtureB = await buildScopedFixture("tenant-b", { deliveredAt: new Date("2026-07-18T00:00:00Z") });

    await expect(
      service.computeShadowDiff({ tenantId: fixtureB.tenantId, tebligatId: fixtureA.tebligatId }),
    ).rejects.toThrow(NotFoundException);

    const rows = await prisma.legalTimeShadowDiff.findMany({ where: { sourceTebligatId: fixtureA.tebligatId } });
    expect(rows).toHaveLength(0);
  });

  it("workflowStage=ENFORCEMENT: legacy uygulanamaz, canonicalDate yine hesaplanır ama delta null", async () => {
    const { tenantId, tebligatId } = await buildScopedFixture("enforcement", {
      deliveredAt: new Date("2026-07-18T00:00:00Z"),
      workflowStage: "ENFORCEMENT",
    });

    const result = await service.computeShadowDiff({ tenantId, tebligatId });

    expect(result!.legacyDate).toBeNull();
    expect(result!.reasonCode).toBe("LEGACY_NOT_APPLICABLE_WORKFLOW_STAGE");
    expect(result!.deltaDays).toBeNull();
    expect(result!.canonicalDate).toEqual(new Date("2026-07-20T00:00:00Z"));
  });
});
