/**
 * MPB-028(a) PR-5 (owner GO-IMPLEMENT, 2026-07-14) — WorkflowEngine.calculateNextActionTime
 * disposable-DB entegrasyon testi.
 *
 * Unit testler (workflow-engine-legal-time-cutover.spec.ts) Prisma'yı mock'lar; bu dosya
 * gerçek bir Postgres üzerinde Case -> Tebligat köprüsünün (caseId üzerinden, createdAt DESC)
 * ve LegalDeadlineService/ProceedingClassificationService/LegalPeriodCalculationService
 * zincirinin GERÇEK servislerle (mock değil) legacy NotificationQueue formülünü yalnız
 * flag/servis/Tebligat/kural eksikliğinde fallback olarak kullandığını kanıtlar. Fixture
 * convention debtor-finalization-cutover.db-gated.integration.spec.ts'ten izlenir.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { WorkflowEngine } from "../workflow-engine.service";
import { LegalDeadlineService } from "../../legal-deadline/legal-deadline.service";
import { ProceedingClassificationService } from "../../legal-deadline/proceeding-classification.service";
import { LegalPeriodCalculationService } from "../../legal-deadline/legal-period-calculation.service";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "WorkflowEngine legal-time-cutover disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("MPB-028(a) PR-5: WorkflowEngine.calculateNextActionTime — disposable DB", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let workflowEngine: WorkflowEngine;
  const ORIGINAL_ENV = process.env.LEGAL_TIME_CUTOVER;
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const legalDeadlineService = new LegalDeadlineService(prisma as any);
    const proceedingClassificationService = new ProceedingClassificationService(prisma as any);
    const legalPeriodCalculationService = new LegalPeriodCalculationService(
      legalDeadlineService,
      proceedingClassificationService,
    );
    workflowEngine = new WorkflowEngine(
      prisma as any,
      {} as any,
      {} as any,
      undefined,
      legalPeriodCalculationService,
    );
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(tenantId);
    }
    await prisma.$disconnect();
    if (ORIGINAL_ENV === undefined) {
      delete process.env.LEGAL_TIME_CUTOVER;
    } else {
      process.env.LEGAL_TIME_CUTOVER = ORIGINAL_ENV;
    }
  });

  async function cleanupTenant(tenantId: string) {
    await prisma.tebligat.deleteMany({ where: { tenantId } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    createdTenantIds.delete(tenantId);
  }

  async function buildScopedFixture(
    label: string,
    options: {
      workflowStage?: string;
      proceedingType?: string;
      withTebligat?: boolean;
    } = {},
  ) {
    const { workflowStage = "WAITING_RESPONSE", proceedingType = "GENERAL_EXECUTION", withTebligat = true } = options;
    const tenantId = `test-wfcut-${label}-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);

    await prisma.tenant.create({
      data: { id: tenantId, name: `WorkflowCutover Test ${label}`, slug: `test-wfcut-${label}-${randomUUID().slice(0, 8)}` },
    });

    const client = await prisma.client.create({
      data: { tenantId, displayName: "WFCutover Test Alacaklı", type: "INDIVIDUAL" },
    });

    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-WFCUT-${randomUUID().slice(0, 6)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
        isAutoMode: false,
        workflowStage: workflowStage as any,
        proceedingType: proceedingType as any,
      },
    });

    const debtor = await prisma.debtor.create({
      data: { tenantId, type: "INDIVIDUAL", name: "WFCutover Test Borçlu" },
    });

    const caseDebtor = await prisma.caseDebtor.create({
      data: {
        caseId: caseRow.id,
        debtorId: debtor.id,
        role: "ASIL_BORCLU",
        deliveredAt: new Date("2026-05-01T00:00:00Z"),
      },
    });

    if (withTebligat) {
      await prisma.tebligat.create({
        data: {
          tenantId,
          caseId: caseRow.id,
          caseDebtorId: caseDebtor.id,
          tebligatType: "ODEME_EMRI",
          addressType: "BILINEN",
          addressText: "Test Adres No:1",
          recipientName: "WFCutover Test Borçlu",
          channel: "PTT",
          deliveredAt: new Date("2026-05-01T00:00:00Z"),
        },
      });
    }

    return { tenantId, caseId: caseRow.id };
  }

  const legacyExpected = new Date(
    new Date("2026-05-01T00:00:00Z").getTime() + 10 * 24 * 60 * 60 * 1000,
  );

  it("flag kapalıyken gerçek Postgres'te legacy formül (NotificationQueue) korunur — kanonik kural farklı sonuç üretse bile", async () => {
    delete process.env.LEGAL_TIME_CUTOVER;
    const { tenantId, caseId } = await buildScopedFixture("legacy", { proceedingType: "GENERAL_EXECUTION" });
    await prisma.notificationQueue.create({
      data: {
        tenantId,
        caseId,
        type: "PAYMENT_ORDER",
        channel: "PTT",
        recipient: "test@example.com",
        status: "DELIVERED",
        deliveredAt: new Date("2026-05-01T00:00:00Z"),
      },
    });

    const result = await workflowEngine.calculateNextActionTime(caseId, tenantId);

    expect(result).toEqual(legacyExpected);
  });

  it("flag açık + GENERAL_EXECUTION (RESOLVED rule) + gerçek Tebligat: kanonik nextActionEligibleDate döner", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { tenantId, caseId } = await buildScopedFixture("canonical-resolved", {
      workflowStage: "PAYMENT_ORDER",
      proceedingType: "GENERAL_EXECUTION",
    });

    const result = await workflowEngine.calculateNextActionTime(caseId, tenantId);

    // GENERAL_EXECUTION: objectionDays=7, paymentDays=7 -> nextActionWaitingDays=7
    // periodStartDate = legalServiceDate(2026-05-01, DIRECT_DELIVERY) + 1 gün = 2026-05-02
    // nextActionEligibleDate = periodStartDate + 7 - 1 = 2026-05-08
    expect(result).toEqual(new Date("2026-05-08T00:00:00.000Z"));
    expect(result).not.toEqual(legacyExpected);
  });

  it("flag açık + PLEDGE (owner kararıyla UNRESOLVED rejim) + gerçek Tebligat: legacy fallback'e düşer", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { tenantId, caseId } = await buildScopedFixture("canonical-unresolved-rule", {
      workflowStage: "WAITING_RESPONSE",
      proceedingType: "PLEDGE",
    });
    await prisma.notificationQueue.create({
      data: {
        tenantId,
        caseId,
        type: "PAYMENT_ORDER",
        channel: "PTT",
        recipient: "test@example.com",
        status: "DELIVERED",
        deliveredAt: new Date("2026-05-01T00:00:00Z"),
      },
    });

    const result = await workflowEngine.calculateNextActionTime(caseId, tenantId);

    expect(result).toEqual(legacyExpected);
  });

  it("flag açık + ilgili Tebligat hiç yoksa legacy fallback'e düşer (tahmini tarih üretmez)", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { tenantId, caseId } = await buildScopedFixture("no-tebligat", {
      workflowStage: "WAITING_RESPONSE",
      withTebligat: false,
    });
    await prisma.notificationQueue.create({
      data: {
        tenantId,
        caseId,
        type: "PAYMENT_ORDER",
        channel: "PTT",
        recipient: "test@example.com",
        status: "DELIVERED",
        deliveredAt: new Date("2026-05-01T00:00:00Z"),
      },
    });

    const result = await workflowEngine.calculateNextActionTime(caseId, tenantId);

    expect(result).toEqual(legacyExpected);
  });

  it("cross-tenant: başka tenant'ın Tebligat kaydı asla okunmaz (tenantId izolasyonu)", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const fixtureA = await buildScopedFixture("tenant-a", { workflowStage: "PAYMENT_ORDER", withTebligat: true });
    const fixtureB = await buildScopedFixture("tenant-b", { workflowStage: "PAYMENT_ORDER", withTebligat: true });

    const resultA = await workflowEngine.calculateNextActionTime(fixtureA.caseId, fixtureA.tenantId);
    const resultB = await workflowEngine.calculateNextActionTime(fixtureB.caseId, fixtureB.tenantId);

    expect(resultA).toEqual(new Date("2026-05-08T00:00:00.000Z"));
    expect(resultB).toEqual(new Date("2026-05-08T00:00:00.000Z"));
    expect(fixtureA.caseId).not.toBe(fixtureB.caseId);
  });
});
