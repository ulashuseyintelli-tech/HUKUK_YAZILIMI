import { describeDb } from "../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/prisma/prisma.service";
import { CaseDebtorService } from "./case-debtor.service";
import {
  AddressTaskType,
  AddressTaskStatus,
  CaseType,
  CaseStatus,
  DebtorRole,
} from "@prisma/client";

/**
 * CaseDebtorService.removeCaseDebtor — öksüz AddressTask temizliği (integration / canlı DB).
 *
 * describeDb gate'i: DATABASE_URL yoksa SKIP → CI'da kırmızı yapmaz (bkz test/describe-db.ts).
 *
 * Ulaş'ın istediği ASIL garanti burada EMPİRİK kanıtlanır (mock değil, gerçek updateMany filtresi):
 *
 *   Case A / Debtor 1  → açık görevler CANCELLED      (hedef)
 *   Case A / Debtor 1  → terminal (DONE) görev DURUR  (status filtresi)
 *   Case A / Debtor 2  → DURUR                         (pair-scope: debtorId≠)
 *   Case B / Debtor 1  → DURUR                         (pair-scope: caseId≠)
 *
 * Ayrıca: yalnız A/1 CaseDebtor linki silinir; A/2 ve B/1 linkleri kalır.
 */
describeDb("CaseDebtorService.removeCaseDebtor — orphan AddressTask cleanup", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let service: CaseDebtorService;

  const tenantId = "test-tenant-casedebtor-orphan";

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [CaseDebtorService, PrismaService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<CaseDebtorService>(CaseDebtorService);
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await module.close();
  });

  async function cleanup() {
    // FK sırası: önce çocuklar (addressTask, caseDebtor), sonra ebeveynler.
    await prisma.addressTask.deleteMany({ where: { tenantId } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }

  const mkTask = (
    caseId: string,
    debtorId: string,
    taskType: AddressTaskType,
    status: AddressTaskStatus
  ) =>
    prisma.addressTask.create({
      data: { tenantId, caseId, debtorId, taskType, status },
    });

  it("yalnız çıkarılan (caseId, debtorId) çiftinin açık görevlerini CANCELLED yapar; diğerlerine dokunmaz", async () => {
    const suffix = Date.now();

    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: "Test Tenant", slug: `tt-cd-${suffix}` },
    });

    const client = await prisma.client.create({
      data: { tenantId, displayName: "Test Müvekkil", type: "INDIVIDUAL" },
    });

    const debtor1 = await prisma.debtor.create({
      data: { tenantId, name: "Borçlu 1", type: "INDIVIDUAL", tckn: `1${suffix}`.slice(0, 11) },
    });
    const debtor2 = await prisma.debtor.create({
      data: { tenantId, name: "Borçlu 2", type: "INDIVIDUAL", tckn: `2${suffix}`.slice(0, 11) },
    });

    const caseA = await prisma.case.create({
      data: {
        tenantId,
        fileNumber: `TEST-A-${suffix}`,
        type: CaseType.GENERAL_EXECUTION,
        status: CaseStatus.ACTIVE,
        clientId: client.id,
      },
    });
    const caseB = await prisma.case.create({
      data: {
        tenantId,
        fileNumber: `TEST-B-${suffix}`,
        type: CaseType.GENERAL_EXECUTION,
        status: CaseStatus.ACTIVE,
        clientId: client.id,
      },
    });

    const cdA1 = await prisma.caseDebtor.create({
      data: { caseId: caseA.id, debtorId: debtor1.id, role: DebtorRole.ASIL_BORCLU },
    });
    const cdA2 = await prisma.caseDebtor.create({
      data: { caseId: caseA.id, debtorId: debtor2.id, role: DebtorRole.ASIL_BORCLU },
    });
    const cdB1 = await prisma.caseDebtor.create({
      data: { caseId: caseB.id, debtorId: debtor1.id, role: DebtorRole.ASIL_BORCLU },
    });

    // Hedef A/1: 3 açık statü (hepsi iptal olmalı) + 1 terminal (DONE, durmalı)
    const a1Pending = await mkTask(caseA.id, debtor1.id, "CLIENT_REQUEST_DEBTOR_ADDRESSES", "PENDING");
    const a1InProgress = await mkTask(caseA.id, debtor1.id, "CLIENT_REMIND_DEBTOR_ADDRESSES", "IN_PROGRESS");
    const a1WaitingExt = await mkTask(caseA.id, debtor1.id, "CLIENT_ANNUAL_ADDRESS_REFRESH", "WAITING_EXTERNAL");
    const a1Done = await mkTask(caseA.id, debtor1.id, "UYAP_PULL_MERNIS", "DONE");

    // Aynı dosya farklı borçlu (A/2) ve farklı dosya aynı borçlu (B/1) — DURMALI
    const a2Pending = await mkTask(caseA.id, debtor2.id, "CLIENT_REQUEST_DEBTOR_ADDRESSES", "PENDING");
    const b1Pending = await mkTask(caseB.id, debtor1.id, "CLIENT_REQUEST_DEBTOR_ADDRESSES", "PENDING");

    // ── ACT: A/1 borçlusunu dosyadan çıkar ──
    const deleted = await service.removeCaseDebtor(tenantId, cdA1.id);
    expect(deleted.id).toBe(cdA1.id);

    // ── ASSERT: A/1 açık görevleri CANCELLED + MANUAL_CANCEL + completedAt ──
    for (const t of [a1Pending, a1InProgress, a1WaitingExt]) {
      const after = await prisma.addressTask.findUnique({ where: { id: t.id } });
      expect(after?.status).toBe("CANCELLED");
      expect(after?.cancellationReason).toBe("MANUAL_CANCEL");
      expect(after?.completedAt).toBeTruthy();
    }

    // A/1 terminal görev: status filtresi dışı → DURUR
    const a1DoneAfter = await prisma.addressTask.findUnique({ where: { id: a1Done.id } });
    expect(a1DoneAfter?.status).toBe("DONE");
    expect(a1DoneAfter?.cancellationReason).toBeNull();

    // A/2 (debtorId≠) ve B/1 (caseId≠) → DOKUNULMAZ
    const a2After = await prisma.addressTask.findUnique({ where: { id: a2Pending.id } });
    expect(a2After?.status).toBe("PENDING");
    const b1After = await prisma.addressTask.findUnique({ where: { id: b1Pending.id } });
    expect(b1After?.status).toBe("PENDING");

    // Yalnız A/1 linki silindi; A/2 ve B/1 linkleri kaldı
    expect(await prisma.caseDebtor.findUnique({ where: { id: cdA1.id } })).toBeNull();
    expect(await prisma.caseDebtor.findUnique({ where: { id: cdA2.id } })).not.toBeNull();
    expect(await prisma.caseDebtor.findUnique({ where: { id: cdB1.id } })).not.toBeNull();
  });
});
