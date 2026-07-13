/**
 * MPB-028(a) PR-2 — LegalDeadlineService disposable-DB entegrasyon testi.
 *
 * Unit testler (legal-deadline.service.spec.ts) Prisma'yı mock'lar; bu dosya gerçek bir
 * Postgres üzerinde tenant-scoped where clause'ın doğru satırı eşleştirdiğini/cross-tenant'ı
 * reddettiğini ve supersede zincirinin (status geçişi + supersedesSnapshotId FK) gerçek
 * tabloda beklendiği gibi oluştuğunu kanıtlar. Fixture-building convention
 * workflow-engine-remaining-tenant-boundaries.db-gated.integration.spec.ts'ten izlenir.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { NotFoundException } from "@nestjs/common";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { LegalDeadlineService } from "../legal-deadline.service";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "LegalDeadlineService disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("LegalDeadlineService — disposable DB", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let service: LegalDeadlineService;
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    service = new LegalDeadlineService(prisma as any);
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(tenantId);
    }
    await prisma.$disconnect();
  });

  async function cleanupTenant(tenantId: string) {
    await prisma.legalDeadlineSnapshot.deleteMany({ where: { tenantId } });
    await prisma.tebligat.deleteMany({ where: { tenantId } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    createdTenantIds.delete(tenantId);
  }

  async function buildScopedFixture(label: string) {
    const tenantId = `test-ldl-${label}-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);

    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: `LegalDeadline Test ${label}`,
        slug: `test-ldl-${label}-${randomUUID().slice(0, 8)}`,
      },
    });

    const client = await prisma.client.create({
      data: { tenantId, displayName: "LegalDeadline Test Muvekkil", type: "INDIVIDUAL" },
    });

    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-LDL-${randomUUID().slice(0, 6)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
        isAutoMode: false,
      },
    });

    const tebligat = await prisma.tebligat.create({
      data: {
        tenantId,
        caseId: caseRow.id,
        tebligatType: "ODEME_EMRI",
        addressType: "BILINEN",
        addressText: "Test Adres No:1",
        recipientName: "Test Borçlu",
        channel: "PTT",
        deliveredAt: new Date("2026-01-10T00:00:00Z"),
      },
    });

    return { tenantId, caseId: caseRow.id, tebligatId: tebligat.id };
  }

  it("gerçek Postgres üzerinde ACTIVE snapshot oluşturur, alanlar doğru yazılır", async () => {
    const { tenantId, caseId, tebligatId } = await buildScopedFixture("happy");

    const result = await service.calculateDeadline({ tenantId, tebligatId, objectionPeriodDays: 7 });

    expect(result.caseId).toBe(caseId);
    expect(result.status).toBe("ACTIVE");
    expect(result.deadlineReasonCode).toBe("DIRECT_DELIVERY");
    expect(result.legalServiceDate).toEqual(new Date("2026-01-10T00:00:00Z"));
    expect(result.dueDate).toEqual(new Date("2026-01-17T00:00:00Z"));

    const rows = await prisma.legalDeadlineSnapshot.findMany({ where: { tenantId, sourceTebligatId: tebligatId } });
    expect(rows).toHaveLength(1);
  });

  it("aynı girdiyle ikinci çağrı idempotent no-op: satır sayısı 1 kalır", async () => {
    const { tenantId, tebligatId } = await buildScopedFixture("idempotent");

    const first = await service.calculateDeadline({ tenantId, tebligatId, objectionPeriodDays: 7 });
    const second = await service.calculateDeadline({ tenantId, tebligatId, objectionPeriodDays: 7 });

    expect(second.id).toBe(first.id);
    const rows = await prisma.legalDeadlineSnapshot.findMany({ where: { tenantId, sourceTebligatId: tebligatId } });
    expect(rows).toHaveLength(1);
  });

  it("farklı objectionPeriodDays ile yeniden hesaplama supersede zinciri üretir", async () => {
    const { tenantId, tebligatId } = await buildScopedFixture("supersede");

    const first = await service.calculateDeadline({ tenantId, tebligatId, objectionPeriodDays: 7 });
    const second = await service.calculateDeadline({ tenantId, tebligatId, objectionPeriodDays: 10 });

    expect(second.id).not.toBe(first.id);
    expect(second.supersedesSnapshotId).toBe(first.id);
    expect(second.status).toBe("ACTIVE");

    const supersededRow = await prisma.legalDeadlineSnapshot.findUniqueOrThrow({ where: { id: first.id } });
    expect(supersededRow.status).toBe("SUPERSEDED");
    // Hesaplanan alanlar (immutable) supersede sonrası da DEĞİŞMEMİŞ olmalı.
    expect(supersededRow.legalServiceDate).toEqual(first.legalServiceDate);
    expect(supersededRow.dueDate).toEqual(first.dueDate);

    const activeRows = await prisma.legalDeadlineSnapshot.findMany({
      where: { tenantId, sourceTebligatId: tebligatId, status: "ACTIVE" },
    });
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].id).toBe(second.id);
  });

  it("cross-tenant: yanlış tenantId ile çağrı NotFoundException fırlatır, hiçbir satır oluşmaz", async () => {
    const fixtureA = await buildScopedFixture("tenant-a");
    const fixtureB = await buildScopedFixture("tenant-b");

    await expect(
      service.calculateDeadline({
        tenantId: fixtureB.tenantId,
        tebligatId: fixtureA.tebligatId,
        objectionPeriodDays: 7,
      }),
    ).rejects.toThrow(NotFoundException);

    const rows = await prisma.legalDeadlineSnapshot.findMany({
      where: { sourceTebligatId: fixtureA.tebligatId },
    });
    expect(rows).toHaveLength(0);
  });
});
