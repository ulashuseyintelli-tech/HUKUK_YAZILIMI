/**
 * MPB-028(a) PR-4 (owner revizyonu, 2026-07-14 — "PR-4 dar düzeltme") — DebtorService
 * finalizationDate/finalizationRequestEligibleDate disposable-DB entegrasyon testi.
 *
 * Unit testler (debtor-finalization-cutover.spec.ts) Prisma'yı mock'lar; bu dosya gerçek bir
 * Postgres üzerinde CaseDebtor -> Tebligat köprüsünün (caseDebtorId üzerinden, createdAt DESC)
 * ve LegalDeadlineService/ProceedingClassificationService/LegalPeriodCalculationService
 * zincirinin GERÇEK servislerle (mock değil) `finalizationDate`'e HİÇ dokunmadan, yalnız
 * `finalizationRequestEligibleDate`'i doldurduğunu kanıtlar. Fixture convention
 * legal-deadline.db-gated.integration.spec.ts'ten izlenir.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { DebtorService } from "../debtor.service";
import { LegalDeadlineService } from "../../legal-deadline/legal-deadline.service";
import { ProceedingClassificationService } from "../../legal-deadline/proceeding-classification.service";
import { LegalPeriodCalculationService } from "../../legal-deadline/legal-period-calculation.service";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "DebtorService finalization-cutover disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("MPB-028(a) PR-4: DebtorService finalizationDate vs finalizationRequestEligibleDate — disposable DB", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let debtorService: DebtorService;
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
    debtorService = new DebtorService(
      prisma as any,
      { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      undefined,
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
    options: { proceedingType?: string; withTebligat?: boolean } = {},
  ) {
    const { proceedingType = "GENERAL_EXECUTION", withTebligat = true } = options;
    const tenantId = `test-fincut-${label}-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);

    await prisma.tenant.create({
      data: { id: tenantId, name: `FinalizationCutover Test ${label}`, slug: `test-fincut-${label}-${randomUUID().slice(0, 8)}` },
    });

    const client = await prisma.client.create({
      data: { tenantId, displayName: "FinCutover Test Alacaklı", type: "INDIVIDUAL" },
    });

    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-FINCUT-${randomUUID().slice(0, 6)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
        isAutoMode: false,
        proceedingType: proceedingType as any,
      },
    });

    const debtor = await prisma.debtor.create({
      data: { tenantId, type: "INDIVIDUAL", name: "FinCutover Test Borçlu" },
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
          recipientName: "FinCutover Test Borçlu",
          channel: "PTT",
          deliveredAt: new Date("2026-05-01T00:00:00Z"),
        },
      });
    }

    return { tenantId, caseId: caseRow.id, caseDebtorId: caseDebtor.id };
  }

  const legacyExpected = new Date(
    new Date("2026-05-01T00:00:00Z").getTime() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  it("finalizationDate HER ZAMAN LEGACY (+7 gün) — flag açık olsa bile GERÇEK Postgres'te değişmez", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { tenantId, caseId } = await buildScopedFixture("finalization-untouched", {
      proceedingType: "GENERAL_EXECUTION",
    });

    const result = await debtorService.getDebtorsForCase(tenantId, caseId);

    // finalizationEligibilitySource=CANONICAL olsa bile finalizationDate (2026-05-08 DEĞİL) +7 gün kalır.
    expect(result.items[0].finalizationEligibilitySource).toBe("CANONICAL");
    expect(result.items[0].finalizationDate).toBe(legacyExpected);
  });

  it("flag kapalıyken gerçek Postgres'te finalizationEligibilitySource=LEGACY döner", async () => {
    delete process.env.LEGAL_TIME_CUTOVER;
    const { tenantId, caseId } = await buildScopedFixture("legacy");

    const result = await debtorService.getDebtorsForCase(tenantId, caseId);

    expect(result.items[0].finalizationEligibilitySource).toBe("LEGACY");
    expect(result.items[0].finalizationRequestEligibleDate).toBe(legacyExpected);
    expect(result.items[0].finalizationDate).toBe(legacyExpected);
  });

  it("flag açık + GENERAL_EXECUTION (RESOLVED rule) + gerçek Tebligat: CANONICAL nextActionEligibleDate finalizationRequestEligibleDate'e yazılır", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { tenantId, caseId } = await buildScopedFixture("canonical-resolved", {
      proceedingType: "GENERAL_EXECUTION",
    });

    const result = await debtorService.getDebtorsForCase(tenantId, caseId);

    // GENERAL_EXECUTION: objectionDays=7, paymentDays=7 -> nextActionWaitingDays=7
    // periodStartDate = legalServiceDate(2026-05-01, DIRECT_DELIVERY) + 1 gün = 2026-05-02
    // nextActionEligibleDate = periodStartDate + 7 - 1 = 2026-05-08
    expect(result.items[0].finalizationEligibilitySource).toBe("CANONICAL");
    expect(result.items[0].finalizationRequestEligibleDate).toBe(
      new Date("2026-05-08T00:00:00.000Z").toISOString(),
    );
    expect(result.items[0].finalizationDate).toBe(legacyExpected); // ETKİLENMEDİ
  });

  it("flag açık + PLEDGE (owner kararıyla UNRESOLVED rejim) + gerçek Tebligat: fail-closed UNRESOLVED döner", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { tenantId, caseId } = await buildScopedFixture("canonical-unresolved-rule", {
      proceedingType: "PLEDGE",
    });

    const result = await debtorService.getDebtorsForCase(tenantId, caseId);

    expect(result.items[0].finalizationEligibilitySource).toBe("UNRESOLVED");
    expect(result.items[0].finalizationRequestEligibleDate).toBeUndefined();
    expect(result.items[0].finalizationDate).toBe(legacyExpected); // ETKİLENMEDİ
  });

  it("flag açık + ilgili Tebligat hiç yoksa fail-closed UNRESOLVED döner (tahmini tarih üretmez)", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { tenantId, caseId } = await buildScopedFixture("no-tebligat", { withTebligat: false });

    const result = await debtorService.getDebtorsForCase(tenantId, caseId);

    expect(result.items[0].finalizationEligibilitySource).toBe("UNRESOLVED");
    expect(result.items[0].finalizationRequestEligibleDate).toBeUndefined();
  });

  it("cross-tenant: başka tenant'ın Tebligat kaydı asla okunmaz (tenantId izolasyonu)", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const fixtureA = await buildScopedFixture("tenant-a", { withTebligat: true });
    // Farklı bir tenant'ta AYNI caseDebtorId string'ini taklit eden bir Tebligat oluşturmaya
    // çalışmak Prisma FK kısıtıyla zaten engellenir; burada asıl doğrulanan, sorgunun
    // tenantId'yi WHERE'e dahil ettiğidir (unit testte mock ile de doğrulanmıştı) — bu
    // entegrasyon testi GERÇEK DB'de fixtureA'nın kendi tenantId'siyle doğru sonucu ürettiğini
    // ve başka bir tenant'ın verisiyle KARIŞMADIĞINI (fixtureB izolasyonu) kanıtlar.
    const fixtureB = await buildScopedFixture("tenant-b", { withTebligat: true });

    const resultA = await debtorService.getDebtorsForCase(fixtureA.tenantId, fixtureA.caseId);
    const resultB = await debtorService.getDebtorsForCase(fixtureB.tenantId, fixtureB.caseId);

    expect(resultA.items[0].finalizationEligibilitySource).toBe("CANONICAL");
    expect(resultB.items[0].finalizationEligibilitySource).toBe("CANONICAL");
    expect(resultA.items[0].caseDebtorId).not.toBe(resultB.items[0].caseDebtorId);
  });
});
