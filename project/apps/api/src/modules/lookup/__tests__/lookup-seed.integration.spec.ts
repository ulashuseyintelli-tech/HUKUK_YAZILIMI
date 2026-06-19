import { describeDb } from "../../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/prisma/prisma.service";
import { seedLookupCatalog } from "../lookup-seed";
import {
  TAKIP_TURU_CATALOG,
  MAHIYET_TIPI_CATALOG,
  ASAMA_CATALOG,
  RISK_CATALOG,
  BORCLU_TIPI_CATALOG,
  DURUM_ETIKETI_CATALOG,
} from "../lookup-catalog";

/**
 * PR-E1 — seedLookupCatalog gerçek Postgres integration (güvence katmanı).
 *
 * PR-A mock unit'i çağrı/sıra mantığını kanıtladı; bu suite GERÇEK Postgres'te
 * upsert + @@unique([tenantId,code]) + reactivation + defaults id-çözümü davranışını doğrular.
 *
 * GATE: describeDb → TEST_DATABASE_URL yoksa SKIP (test/test-db-env.ts fail-closed:
 *   hukuk_db YASAK, ad test/gate/spec/ci/jest içermeli). Dev hukuk_db'ye / Demo Firma'ya write YOK.
 */
describeDb("seedLookupCatalog — gerçek Postgres (integration)", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  const tenantId = "test-tenant-lookup-seed";

  const EXPECTED = {
    takipTuru: TAKIP_TURU_CATALOG.length, // 11
    mahiyet: MAHIYET_TIPI_CATALOG.length, // 18
    asama: ASAMA_CATALOG.length, // 9
    risk: RISK_CATALOG.length, // 3
    borcluTipi: BORCLU_TIPI_CATALOG.length, // 3
    durumEtiketi: DURUM_ETIKETI_CATALOG.length, // 9
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({ providers: [PrismaService] }).compile();
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    await module.close();
  });

  async function cleanup() {
    await prisma.lookupTakipTuru.deleteMany({ where: { tenantId } });
    await prisma.lookupMahiyetTipi.deleteMany({ where: { tenantId } });
    await prisma.lookupAsama.deleteMany({ where: { tenantId } });
    await prisma.lookupRisk.deleteMany({ where: { tenantId } });
    await prisma.lookupBorcluTipi.deleteMany({ where: { tenantId } });
    await prisma.lookupDurumEtiketi.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }

  async function ensureTenant() {
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: "PR-E1 Lookup Test", slug: `tt-pre1-lookup-${Date.now()}` },
    });
  }

  async function activeCounts() {
    const [takipTuru, mahiyet, asama, risk, borcluTipi, durumEtiketi] = await Promise.all([
      prisma.lookupTakipTuru.count({ where: { tenantId, isActive: true } }),
      prisma.lookupMahiyetTipi.count({ where: { tenantId, isActive: true } }),
      prisma.lookupAsama.count({ where: { tenantId, isActive: true } }),
      prisma.lookupRisk.count({ where: { tenantId, isActive: true } }),
      prisma.lookupBorcluTipi.count({ where: { tenantId, isActive: true } }),
      prisma.lookupDurumEtiketi.count({ where: { tenantId, isActive: true } }),
    ]);
    return { takipTuru, mahiyet, asama, risk, borcluTipi, durumEtiketi };
  }

  it("boş tenant → 11/18/9/3/3/9 aktif + defaults id çözülür", async () => {
    await ensureTenant();

    const r = await seedLookupCatalog(prisma, tenantId);
    expect(r).toEqual(EXPECTED);
    expect(await activeCounts()).toEqual(EXPECTED);

    // defaults: takipTuru → mahiyet/borçlu id'leri çözülmüş olmalı
    const cek = await prisma.lookupTakipTuru.findUnique({
      where: { tenantId_code: { tenantId, code: "KAMBIYO_CEK" } },
    });
    expect(cek).toBeTruthy();
    expect(cek!.defaultMahiyetTipiId).toBeTruthy();
    expect(cek!.defaultBorcluTipiId).toBeTruthy();

    // frontend'in aradığı kanonik kodlar var
    const ilamli = await prisma.lookupTakipTuru.findUnique({
      where: { tenantId_code: { tenantId, code: "ILAMLI" } },
    });
    expect(ilamli).toBeTruthy();
  });

  it("idempotent: 2. kez → hâlâ 11/18/..., duplicate yok", async () => {
    await ensureTenant();
    await seedLookupCatalog(prisma, tenantId);
    await seedLookupCatalog(prisma, tenantId); // tekrar → unique korunur, exception yok

    expect(await activeCounts()).toEqual(EXPECTED);
    const totalTakip = await prisma.lookupTakipTuru.count({ where: { tenantId } });
    expect(totalTakip).toBe(EXPECTED.takipTuru); // dup satır yok
  });

  it("reactivation: soft-deleted kanonik → tekrar seed → isActive=true", async () => {
    await ensureTenant();
    await seedLookupCatalog(prisma, tenantId);

    await prisma.lookupTakipTuru.update({
      where: { tenantId_code: { tenantId, code: "KAMBIYO_CEK" } },
      data: { isActive: false },
    });
    expect(await prisma.lookupTakipTuru.count({ where: { tenantId, isActive: true } })).toBe(EXPECTED.takipTuru - 1);

    await seedLookupCatalog(prisma, tenantId); // reactivate
    const cek = await prisma.lookupTakipTuru.findUnique({
      where: { tenantId_code: { tenantId, code: "KAMBIYO_CEK" } },
    });
    expect(cek!.isActive).toBe(true);
    expect(await prisma.lookupTakipTuru.count({ where: { tenantId, isActive: true } })).toBe(EXPECTED.takipTuru);
  });

  it("non-canonical satır KORUNUR (RFA005-benzeri dokunulmaz)", async () => {
    await ensureTenant();
    await prisma.lookupTakipTuru.create({
      data: { tenantId, code: "RFA005_test", name: "Yeni", isActive: false },
    });

    await seedLookupCatalog(prisma, tenantId);

    const leftover = await prisma.lookupTakipTuru.findUnique({
      where: { tenantId_code: { tenantId, code: "RFA005_test" } },
    });
    expect(leftover).toBeTruthy(); // silinmedi
    expect(leftover!.isActive).toBe(false); // dokunulmadı (reactivate edilmedi)
    // kanonik 11 aktif; RFA005 sayılmaz
    expect(await prisma.lookupTakipTuru.count({ where: { tenantId, isActive: true } })).toBe(EXPECTED.takipTuru);
  });
});
