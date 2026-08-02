import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { ConflictException } from "@nestjs/common";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { ThirdPartyService } from "../third-party.service";
import { CaseDebtorLifecycleGuardService } from "../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service";

// I15 Phase C: updateExternalCase() externalOffice/externalCaseNo'yu Phase A'nin
// external_case_logical_identity composite unique constraint'iyle CAKISACAK
// sekilde degistirebiliyordu, hicbir try/catch olmadan (ham P2002/500 riski).
// Bu spec GERCEK Postgres uzerinde: (1) cakisan update'in temiz ConflictException
// ile reddedildigini VE hedef satirin degismeden kaldigini (kismi/hatali yazim
// yok), (2) cakismayan gecerli update'in gercekten kalici oldugunu kanitlar.

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error("I15 Phase C DB gate blocked: CI requires an approved TEST_DATABASE_URL.");
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("I15 Phase C — ThirdPartyService.updateExternalCase() (gerçek Postgres)", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let service: ThirdPartyService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const lifecycleGuard = new CaseDebtorLifecycleGuardService(prisma as any);
    service = new ThirdPartyService(prisma as any, { create: jest.fn() } as any, lifecycleGuard, {} as any, {} as any);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createFixture(label: string) {
    const suffix = randomUUID();
    const tenantId = `i15c-${label}-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `I15C ${label}`, slug: tenantId } });
    const client = await prisma.client.create({
      data: { tenantId, displayName: "I15C Client", type: "INDIVIDUAL" },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `I15C-${suffix.slice(0, 8)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
      },
    });
    const debtor = await prisma.debtor.create({
      data: { tenantId, type: "INDIVIDUAL", firstName: "Test", lastName: "Borclu", name: "Test Borclu" },
    });
    const caseDebtor = await prisma.caseDebtor.create({
      data: { caseId: caseRow.id, debtorId: debtor.id, lifecycleStatus: "ACTIVE" },
    });
    return { tenantId, caseDebtorId: caseDebtor.id };
  }

  it("TEST-1: externalOffice/externalCaseNo çakışması gerçek Postgres P2002 üretir → ConflictException, hedef satır DEĞİŞMEDEN kalır", async () => {
    const fx = await createFixture("t1");
    const first = await (prisma as any).externalCase.create({
      data: {
        tenantId: fx.tenantId,
        caseDebtorId: fx.caseDebtorId,
        externalOffice: "Ankara 5. İcra",
        externalCaseNo: "2026/100",
        counterpartyName: "X",
        claimAmount: 1000,
      },
    });
    const second = await (prisma as any).externalCase.create({
      data: {
        tenantId: fx.tenantId,
        caseDebtorId: fx.caseDebtorId,
        externalOffice: "Ankara 6. İcra",
        externalCaseNo: "2026/200",
        counterpartyName: "Y",
        claimAmount: 2000,
      },
    });

    await expect(
      service.updateExternalCase(fx.tenantId, second.id, {
        externalOffice: first.externalOffice,
        externalCaseNo: first.externalCaseNo,
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);

    const reloaded = await (prisma as any).externalCase.findUnique({ where: { id: second.id } });
    expect(reloaded.externalOffice).toBe("Ankara 6. İcra");
    expect(reloaded.externalCaseNo).toBe("2026/200");
  });

  it("TEST-2: çakışmayan geçerli update gerçek Postgres'e kalıcı yazılır", async () => {
    const fx = await createFixture("t2");
    const ec = await (prisma as any).externalCase.create({
      data: {
        tenantId: fx.tenantId,
        caseDebtorId: fx.caseDebtorId,
        externalOffice: "İstanbul 1. İcra",
        externalCaseNo: "2026/300",
        counterpartyName: "Z",
        claimAmount: 500,
      },
    });

    const updated = await service.updateExternalCase(fx.tenantId, ec.id, {
      notes: "gerçek DB update",
    } as any);

    expect((updated as any).notes).toBe("gerçek DB update");
    const reloaded = await (prisma as any).externalCase.findUnique({ where: { id: ec.id } });
    expect(reloaded.notes).toBe("gerçek DB update");
  });

  // DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02 (OWNER-RATIFIED): generic
  // update artık attachmentStatus'u DEĞİŞTİREMEZ — DTO'da alan hiç yok, ValidationPipe
  // whitelist-dışı olarak reddeder. Bu, D2-I02'nin en temel regresyon-koruma testidir.
  it("TEST-3: attachmentStatus generic update ile artık değiştirilemez (alan sessizce yok sayılır, durum bozulmaz)", async () => {
    const fx = await createFixture("t3");
    const ec = await (prisma as any).externalCase.create({
      data: {
        tenantId: fx.tenantId,
        caseDebtorId: fx.caseDebtorId,
        externalOffice: "Bursa 2. İcra",
        externalCaseNo: "2026/400",
        counterpartyName: "W",
        claimAmount: 750,
      },
    });
    expect(ec.attachmentStatus).toBe("HACIZ_TALEP");

    const updated = await service.updateExternalCase(fx.tenantId, ec.id, {
      notes: "yalnız metadata",
      attachmentStatus: "HACIZ_KONDU",
    } as any);

    // Servis katmanı dto.attachmentStatus'a hiç bakmaz — Prisma data payload'ında yer almaz.
    expect((updated as any).attachmentStatus).toBe("HACIZ_TALEP");
    const reloaded = await (prisma as any).externalCase.findUnique({ where: { id: ec.id } });
    expect(reloaded.attachmentStatus).toBe("HACIZ_TALEP");
  });
});
