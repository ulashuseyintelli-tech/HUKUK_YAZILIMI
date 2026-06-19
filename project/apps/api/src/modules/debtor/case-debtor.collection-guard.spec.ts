import { describeDb } from "../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/prisma/prisma.service";
import { CaseDebtorService } from "./case-debtor.service";
import {
  CaseType,
  CaseStatus,
  DebtorRole,
  CollectionType,
} from "@prisma/client";

describeDb(
  "CaseDebtorService.removeCaseDebtor - dependent records are preserved by passivation",
  () => {
    let module: TestingModule;
    let prisma: PrismaService;
    let service: CaseDebtorService;

    const tenantId = "test-tenant-casedebtor-collection-guard";

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
      await prisma.collection.deleteMany({ where: { tenantId } });
      await prisma.tebligat.deleteMany({ where: { tenantId } });
      await prisma.serviceHistory.deleteMany({
        where: { caseDebtor: { case: { tenantId } } },
      });
      await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
      await prisma.case.deleteMany({ where: { tenantId } });
      await prisma.debtor.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }

    async function seedCaseDebtor(suffix: number) {
      await prisma.tenant.upsert({
        where: { id: tenantId },
        update: {},
        create: { id: tenantId, name: "Test Tenant", slug: `tt-cg-${suffix}` },
      });

      const client = await prisma.client.create({
        data: { tenantId, displayName: "Test Muvekkil", type: "INDIVIDUAL" },
      });

      const debtor = await prisma.debtor.create({
        data: {
          tenantId,
          name: "Borclu CG",
          type: "INDIVIDUAL",
          tckn: `9${suffix}`.slice(0, 11),
        },
      });

      const caseRow = await prisma.case.create({
        data: {
          tenantId,
          fileNumber: `TEST-CG-${suffix}`,
          type: CaseType.GENERAL_EXECUTION,
          status: CaseStatus.ACTIVE,
          clientId: client.id,
        },
      });

      const cd = await prisma.caseDebtor.create({
        data: {
          caseId: caseRow.id,
          debtorId: debtor.id,
          role: DebtorRole.ASIL_BORCLU,
        },
      });

      return { caseId: caseRow.id, cd };
    }

    it("Collection, Tebligat ve ServiceHistory varken hard-delete yapmaz; atıfları koruyarak PASSIVE yapar", async () => {
      const suffix = Date.now();
      const { caseId, cd } = await seedCaseDebtor(suffix);

      const collection = await prisma.collection.create({
        data: {
          tenantId,
          caseId,
          caseDebtorId: cd.id,
          amount: 1500.5,
          type: CollectionType.TAHSILAT,
          date: new Date(),
        },
      });

      const tebligat = await prisma.tebligat.create({
        data: {
          tenantId,
          caseId,
          caseDebtorId: cd.id,
          tebligatType: "ODEME_EMRI",
          addressType: "BILINEN",
          addressText: "Test adresi",
          recipientName: "Borclu CG",
          channel: "PTT",
        },
      });

      const serviceHistory = await prisma.serviceHistory.create({
        data: {
          caseDebtorId: cd.id,
          toStatus: "READY",
          actionDate: new Date(),
          note: "PR-L5 preservation test",
        },
      });

      const passivated = await service.removeCaseDebtor(tenantId, cd.id);

      expect(passivated.id).toBe(cd.id);
      expect(passivated.lifecycleStatus).toBe("PASSIVE");

      const cdAfter = await prisma.caseDebtor.findUnique({ where: { id: cd.id } });
      expect(cdAfter?.lifecycleStatus).toBe("PASSIVE");
      expect(cdAfter?.passivationReason).toBe("MANUAL");

      const collAfter = await prisma.collection.findUnique({
        where: { id: collection.id },
      });
      expect(collAfter?.caseDebtorId).toBe(cd.id);

      const tebligatAfter = await prisma.tebligat.findUnique({
        where: { id: tebligat.id },
      });
      expect(tebligatAfter?.caseDebtorId).toBe(cd.id);

      const historyAfter = await prisma.serviceHistory.findUnique({
        where: { id: serviceHistory.id },
      });
      expect(historyAfter?.caseDebtorId).toBe(cd.id);
    });

    it("bağlı kayıt yokken de CaseDebtor'u silmez; PASSIVE yapar", async () => {
      const suffix = Date.now() + 1;
      const { cd } = await seedCaseDebtor(suffix);

      const passivated = await service.removeCaseDebtor(tenantId, cd.id);

      expect(passivated.id).toBe(cd.id);
      expect(passivated.lifecycleStatus).toBe("PASSIVE");

      const cdAfter = await prisma.caseDebtor.findUnique({ where: { id: cd.id } });
      expect(cdAfter?.lifecycleStatus).toBe("PASSIVE");
      expect(cdAfter?.passivatedAt).toBeTruthy();
      expect(cdAfter?.passivationReason).toBe("MANUAL");
    });
  }
);
