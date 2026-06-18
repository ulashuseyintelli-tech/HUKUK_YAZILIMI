import { describeDb } from "../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CaseDebtorService } from "./case-debtor.service";
import {
  CaseType,
  CaseStatus,
  DebtorRole,
  CollectionType,
} from "@prisma/client";

/**
 * CaseDebtorService.removeCaseDebtor — Collection (tahsilat) BLOK guard'ı (integration / canlı DB).
 *
 * describeDb gate'i: DATABASE_URL yoksa SKIP → CI'da kırmızı yapmaz (bkz test/describe-db.ts).
 *
 * Kanonik finansal bütünlük garantisi EMPİRİK kanıtlanır (mock değil, gerçek count filtresi):
 *
 *   CaseDebtor'a bağlı Collection VAR  → removeCaseDebtor BadRequest atar; CaseDebtor SİLİNMEZ,
 *                                        Collection KORUNUR ve caseDebtorId atfı bozulmaz.
 *   CaseDebtor'a bağlı Collection YOK  → silme NORMAL çalışır (guard yalnız tahsilat varken bloklar).
 *
 * Neden: Collection.caseDebtorId loose String'tir (Prisma @relation/FK YOK) → CaseDebtor
 * silinse DB hata vermez, tahsilatın borçlu atfı sessizce öksüz kalırdı. Guard bunu engeller.
 */
describeDb(
  "CaseDebtorService.removeCaseDebtor — Collection guard (tahsilat varsa BLOK)",
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
      // FK sırası: önce çocuklar (collection, caseDebtor), sonra ebeveynler.
      await prisma.collection.deleteMany({ where: { tenantId } });
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
        data: { tenantId, displayName: "Test Müvekkil", type: "INDIVIDUAL" },
      });

      const debtor = await prisma.debtor.create({
        data: {
          tenantId,
          name: "Borçlu CG",
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

    it("bağlı tahsilat varsa silmeyi BLOKLAR; CaseDebtor ve Collection korunur (atıf öksüz kalmaz)", async () => {
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

      // ── ACT + ASSERT: tahsilat var → BadRequest, hiçbir şey silinmez ──
      await expect(
        service.removeCaseDebtor(tenantId, cd.id)
      ).rejects.toBeInstanceOf(BadRequestException);

      // CaseDebtor DURUR (öksüz atıf oluşmadı)
      expect(
        await prisma.caseDebtor.findUnique({ where: { id: cd.id } })
      ).not.toBeNull();

      // Collection DURUR ve borçlu atfı bozulmadı
      const collAfter = await prisma.collection.findUnique({
        where: { id: collection.id },
      });
      expect(collAfter).not.toBeNull();
      expect(collAfter?.caseDebtorId).toBe(cd.id);
    });

    it("bağlı tahsilat YOKKEN silme normal çalışır (guard yalnız tahsilat varken bloklar)", async () => {
      const suffix = Date.now() + 1;
      const { cd } = await seedCaseDebtor(suffix);

      const deleted = await service.removeCaseDebtor(tenantId, cd.id);

      expect(deleted.id).toBe(cd.id);
      expect(
        await prisma.caseDebtor.findUnique({ where: { id: cd.id } })
      ).toBeNull();
    });
  }
);
