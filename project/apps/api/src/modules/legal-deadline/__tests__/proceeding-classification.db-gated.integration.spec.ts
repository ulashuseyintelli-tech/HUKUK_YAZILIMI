/**
 * MPB-028(a) PR-3C — disposable-DB entegrasyon testi.
 *
 * Unit testler (proceeding-classification.service.spec.ts,
 * legal-period-calculation.service.spec.ts) Prisma'yı mock'lar; bu dosya gerçek bir
 * Postgres üzerinde Case fixture'larıyla (proceedingType/rentalType/bankruptcyType/
 * judgmentExecutionType gerçek enum sütunları) sınıflandırma + süre hesabının doğru
 * çalıştığını, tenant-isolation'ın fail-closed olduğunu ve read-only davranışını (hiçbir
 * satır yazılmadığını) kanıtlar.
 */
import { PrismaClient, ProceedingType, RentalType, JudgmentExecutionType } from "@prisma/client";
import { randomUUID } from "crypto";
import { NotFoundException } from "@nestjs/common";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { LegalDeadlineService } from "../legal-deadline.service";
import { ProceedingClassificationService } from "../proceeding-classification.service";
import { LegalPeriodCalculationService } from "../legal-period-calculation.service";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "ProceedingClassificationService disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("PR-3C — disposable DB (Proceeding Classification + Legal Period Calculation)", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let classificationService: ProceedingClassificationService;
  let calculationService: LegalPeriodCalculationService;
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const legalDeadlineService = new LegalDeadlineService(prisma as any);
    classificationService = new ProceedingClassificationService(prisma as any);
    calculationService = new LegalPeriodCalculationService(legalDeadlineService, classificationService);
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await prisma.tebligat.deleteMany({ where: { tenantId } });
      await prisma.case.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  async function buildFixture(
    label: string,
    opts: {
      deliveredAt?: Date;
      proceedingType?: ProceedingType | null;
      rentalType?: RentalType | null;
      judgmentExecutionType?: JudgmentExecutionType | null;
    } = {},
  ) {
    const tenantId = `test-pr3c-${label}-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);

    await prisma.tenant.create({
      data: { id: tenantId, name: `PR-3C Test ${label}`, slug: `test-pr3c-${label}-${randomUUID().slice(0, 8)}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: "PR-3C Test Muvekkil", type: "INDIVIDUAL" },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-PR3C-${randomUUID().slice(0, 6)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
        isAutoMode: false,
        proceedingType: opts.proceedingType ?? null,
        rentalType: opts.rentalType ?? null,
        judgmentExecutionType: opts.judgmentExecutionType ?? null,
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
        deliveredAt: opts.deliveredAt ?? new Date("2026-07-13T00:00:00Z"),
      },
    });

    return { tenantId, caseId: caseRow.id, tebligatId: tebligat.id };
  }

  it("GENERAL_EXECUTION: gerçek Postgres'te RESOLVED, doğru periodStartDate/nextActionEligibleDate", async () => {
    const { tenantId, caseId, tebligatId } = await buildFixture("general-execution", {
      deliveredAt: new Date("2026-07-13T00:00:00Z"),
      proceedingType: ProceedingType.GENERAL_EXECUTION,
    });

    const result = await calculationService.computeCanonicalLegalPeriod({ tenantId, tebligatId, caseId });

    expect(result.status).toBe("RESOLVED");
    if (result.status !== "RESOLVED") throw new Error("unreachable");
    expect(result.periodStartDate).toEqual(new Date("2026-07-14T00:00:00Z"));
    expect(result.nextActionWaitingDays).toBe(7);
    expect(result.nextActionEligibleDate).toEqual(new Date("2026-07-20T00:00:00Z"));
  });

  it("RENT.RESIDENTIAL_COMMERCIAL: gerçek Postgres'te RESOLVED, 30 gün", async () => {
    const { tenantId, caseId, tebligatId } = await buildFixture("rent-residential", {
      deliveredAt: new Date("2026-01-01T00:00:00Z"),
      proceedingType: ProceedingType.RENT,
      rentalType: RentalType.RESIDENTIAL_COMMERCIAL,
    });

    const result = await calculationService.computeCanonicalLegalPeriod({ tenantId, tebligatId, caseId });

    expect(result.status).toBe("RESOLVED");
    if (result.status !== "RESOLVED") throw new Error("unreachable");
    expect(result.nextActionWaitingDays).toBe(30);
  });

  it("JUDGMENT_ENFORCEMENT.SPECIFIC_PERFORMANCE: caller-supplied ile RESOLVED", async () => {
    const { tenantId, caseId, tebligatId } = await buildFixture("specific-performance", {
      deliveredAt: new Date("2026-01-01T00:00:00Z"),
      proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
      judgmentExecutionType: JudgmentExecutionType.SPECIFIC_PERFORMANCE,
    });

    const result = await calculationService.computeCanonicalLegalPeriod({
      tenantId,
      tebligatId,
      caseId,
      callerSuppliedPerformanceDays: 20,
    });

    expect(result.status).toBe("RESOLVED");
    if (result.status !== "RESOLVED") throw new Error("unreachable");
    expect(result.nextActionWaitingDays).toBe(20);
  });

  it("proceedingType boş (backfill yok — mevcut kayıt varsayımı): UNRESOLVED", async () => {
    const { tenantId, caseId } = await buildFixture("unresolved-proceeding", {
      proceedingType: null,
    });

    const result = await classificationService.resolveProceedingClassification(tenantId, caseId);

    expect(result).toBeNull();
  });

  it("PLEDGE: kural bulunamaz — UNRESOLVED (doğrulanmamış süre eklenmedi)", async () => {
    const { tenantId, caseId, tebligatId } = await buildFixture("pledge", {
      deliveredAt: new Date("2026-01-01T00:00:00Z"),
      proceedingType: ProceedingType.PLEDGE,
    });

    const result = await calculationService.computeCanonicalLegalPeriod({ tenantId, tebligatId, caseId });

    expect(result).toEqual({ status: "UNRESOLVED", reason: "LEGAL_PERIOD_RULE_UNRESOLVED" });
  });

  it("cross-tenant: yanlış tenantId ile çağrı NotFoundException fırlatır", async () => {
    const fixtureA = await buildFixture("tenant-a", { proceedingType: ProceedingType.GENERAL_EXECUTION });
    const fixtureB = await buildFixture("tenant-b", { proceedingType: ProceedingType.GENERAL_EXECUTION });

    await expect(
      classificationService.resolveProceedingClassification(fixtureB.tenantId, fixtureA.caseId),
    ).rejects.toThrow(NotFoundException);
  });

  it("read-only: computeCanonicalLegalPeriod hiçbir LegalDeadlineSnapshot satırı yazmaz", async () => {
    const { tenantId, caseId, tebligatId } = await buildFixture("read-only-check", {
      deliveredAt: new Date("2026-01-01T00:00:00Z"),
      proceedingType: ProceedingType.GENERAL_EXECUTION,
    });

    await calculationService.computeCanonicalLegalPeriod({ tenantId, tebligatId, caseId });

    const snapshotRows = await prisma.legalDeadlineSnapshot.findMany({ where: { tenantId } });
    expect(snapshotRows).toHaveLength(0);
  });
});
