/**
 * C15 PR-4A — ACTIVE daraltmasının GERÇEK Postgres davranışı (db-gated).
 *
 * Birim spec çağrı-argümanını kanıtlar; bu spec yüklemin GERÇEKTEN filtrelediğini:
 * beş lifecycle durumunda beş tenant kurulur, her tenant için eşit derecede
 * "uygun" satırlar yaratılır ve PR-4A'nın kullandığı HER ilişki yolu için
 *   - ACTIVE PARİTESİ: ACTIVE tenant'ın satırı seçilir (aşırı-filtreleme yok),
 *   - DÖRT NON-ACTIVE DIŞLAMASI: PROVISIONING/QUIESCING/SUSPENDED/RETIRED
 *     satırları seçilmez
 * gerçek sorguyla doğrulanır.
 *
 * Yollar: direkt `tenant:` (Case, Client, Office, AddressTask) ·
 * `case.tenant` (Tebligat) · `caseDebtor.case.tenant` (ThirdParty).
 *
 * GATE: describeDb → DATABASE_URL yoksa SKIP (test/test-db-env.ts fail-safe'i).
 */

import { PrismaClient } from "@prisma/client";
import { describeDb } from "../../../../test/describe-db";
import { ACTIVE_TENANT_WHERE, TENANT_LIFECYCLE_STATES } from "../tenant-lifecycle";

const DAMGA = `pr4a-${process.pid}-${Date.now()}`;

describeDb("C15 PR-4A — ACTIVE daraltması gerçek-PG davranışı", () => {
  const prisma = new PrismaClient();
  /** lifecycle -> tenantId */
  const tenantId = new Map<string, string>();

  beforeAll(async () => {
    for (const durum of TENANT_LIFECYCLE_STATES) {
      const t = await prisma.tenant.create({
        data: {
          name: `${DAMGA}-${durum}`,
          slug: `${DAMGA}-${durum}`.toLowerCase(),
          lifecycle: durum,
        },
      });
      tenantId.set(durum, t.id);

      // Her tenant için EŞİT uygunlukta fixture zinciri:
      const office = await prisma.office.create({
        data: { tenantId: t.id, name: `${DAMGA}-office-${durum}` },
      });
      void office;
      const dava = await prisma.case.create({
        data: { tenantId: t.id, fileNumber: `${DAMGA}-${durum}`, type: "GENERAL_EXECUTION" },
      });
      await prisma.client.create({
        data: { tenantId: t.id, type: "INDIVIDUAL", name: `${DAMGA}-client-${durum}` },
      });
      await prisma.tebligat.create({
        data: {
          tenantId: t.id,
          caseId: dava.id,
          tebligatType: "ODEME_EMRI",
          addressType: "BILINEN",
          addressText: "adres",
          recipientName: `${DAMGA}-alici`,
          channel: "UETS",
          status: "GONDERILDI",
          barcodeNo: `${DAMGA}-${durum}`,
        } as never,
      });
      const borclu = await prisma.debtor.create({
        data: { tenantId: t.id, type: "INDIVIDUAL", name: `${DAMGA}-borclu-${durum}` },
      });
      const cd = await prisma.caseDebtor.create({
        data: { caseId: dava.id, debtorId: borclu.id },
      });
      await prisma.addressTask.create({
        data: {
          tenantId: t.id,
          caseId: dava.id,
          debtorId: borclu.id,
          taskType: "CLIENT_ANNUAL_ADDRESS_REFRESH",
          status: "WAITING_EXTERNAL",
          dueAt: new Date("2020-01-01T00:00:00Z"),
        } as never,
      });
      await prisma.thirdParty.create({
        data: {
          tenantId: t.id,
          caseDebtorId: cd.id,
          type: "ISVEREN",
          name: `${DAMGA}-tp-${durum}`,
          address: "adres",
        } as never,
      });
    }
  }, 120_000);

  afterAll(async () => {
    // Fixture temizliği: yalnız bu koşunun damgalı tenant'ları (FK sırasıyla).
    const ids = [...tenantId.values()];
    await prisma.thirdParty.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId: { in: ids } } } });
    await prisma.debtor.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tebligat.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.addressTask.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.client.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.case.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.office.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }, 120_000);

  /** Sonuç kümesinin bu koşuya ait tenantId'leri. */
  const aitOlanlar = (satirlar: Array<{ tenantId: string }>): string[] => {
    const bizim = new Set(tenantId.values());
    return satirlar.map((s) => s.tenantId).filter((id) => bizim.has(id));
  };

  const yalnizActive = (secilen: string[]) => {
    expect(secilen).toEqual([tenantId.get("ACTIVE")]);
  };

  it("direkt yol — Case: yalnız ACTIVE tenant'ın davası seçilir", async () => {
    const satirlar = await prisma.case.findMany({
      where: { tenant: ACTIVE_TENANT_WHERE, fileNumber: { startsWith: DAMGA } },
      select: { tenantId: true },
    });
    yalnizActive(aitOlanlar(satirlar));
  });

  it("direkt yol — Client: yalnız ACTIVE tenant'ın müvekkili seçilir", async () => {
    const satirlar = await prisma.client.findMany({
      where: { tenant: ACTIVE_TENANT_WHERE, name: { startsWith: DAMGA } },
      select: { tenantId: true },
    });
    yalnizActive(aitOlanlar(satirlar));
  });

  it("direkt yol — Office (rate-sync deseni): yalnız ACTIVE tenant'ın office'i seçilir", async () => {
    const satirlar = await prisma.office.findMany({
      where: { tenant: ACTIVE_TENANT_WHERE, name: { startsWith: DAMGA } },
      select: { tenantId: true },
    });
    yalnizActive(aitOlanlar(satirlar));
  });

  it("direkt yol — AddressTask (SLA deseni): yalnız ACTIVE tenant'ın görevi seçilir", async () => {
    const satirlar = await prisma.addressTask.findMany({
      where: {
        tenant: ACTIVE_TENANT_WHERE,
        status: "WAITING_EXTERNAL",
        tenantId: { in: [...tenantId.values()] },
      },
      select: { tenantId: true },
    });
    yalnizActive(aitOlanlar(satirlar));
  });

  it("case.tenant yolu — Tebligat: yalnız ACTIVE tenant'ın tebligatı seçilir", async () => {
    const satirlar = await prisma.tebligat.findMany({
      where: {
        case: { tenant: ACTIVE_TENANT_WHERE },
        status: "GONDERILDI",
        barcodeNo: { startsWith: DAMGA },
      },
      select: { tenantId: true },
    });
    yalnizActive(aitOlanlar(satirlar));
  });

  it("caseDebtor.case.tenant yolu — ThirdParty: yalnız ACTIVE tenant'ın 3. şahsı seçilir", async () => {
    const satirlar = await prisma.thirdParty.findMany({
      where: {
        caseDebtor: { case: { tenant: ACTIVE_TENANT_WHERE } },
        name: { startsWith: DAMGA },
      },
      select: { tenantId: true },
    });
    yalnizActive(aitOlanlar(satirlar));
  });

  it("PARİTE KARŞI-KANITI: yüklemsiz sorgu BEŞ tenant'ın da satırını görür (fixture'lar gerçekten eşit uygunlukta)", async () => {
    const satirlar = await prisma.case.findMany({
      where: { fileNumber: { startsWith: DAMGA } },
      select: { tenantId: true },
    });
    expect(new Set(aitOlanlar(satirlar)).size).toBe(TENANT_LIFECYCLE_STATES.length);
  });
});
