import { describeDb } from "../../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { JwtModule } from "@nestjs/jwt";
import { PrismaService } from "@/prisma/prisma.service";
import { AuthService } from "../auth.service";

/**
 * PR-E1 — register() yeni tenant'ı kanonik lookup ile DOĞURUYOR mu? (gerçek Postgres)
 *
 * PR-B birim testi (mock) seed çağrısını + rollback semantiğini kanıtladı; bu suite
 * GERÇEK Postgres'te lifecycle'ı doğrular: register → yeni tenant tam kanonik lookup seti.
 *
 * GATE: describeDb → TEST_DATABASE_URL yoksa SKIP. Dev hukuk_db'ye / Demo Firma'ya write YOK.
 */
describeDb("AuthService.register → yeni tenant kanonik lookup (integration)", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let auth: AuthService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "pr-e1-test-secret" })],
      providers: [AuthService, PrismaService],
    }).compile();
    prisma = module.get<PrismaService>(PrismaService);
    auth = module.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    for (const tid of createdTenantIds) {
      await prisma.lookupTakipTuru.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupMahiyetTipi.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupAsama.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupRisk.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupBorcluTipi.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupDurumEtiketi.deleteMany({ where: { tenantId: tid } });
      await prisma.user.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await module.close();
  });

  it("register → yeni tenant 11 takipTuru + 18 mahiyet (kanonik) ile doğar", async () => {
    const ts = Date.now();
    const res: any = await auth.register({
      firmName: `PR-E1 Test ${ts}`,
      email: `pre1+${ts}@test.local`,
      password: "secret123",
      name: "Test",
      surname: "Kullanıcı",
    } as any);

    const tid = res.tenant.id as string;
    createdTenantIds.push(tid);

    const [takipTuru, mahiyet, asama, risk, borcluTipi, durumEtiketi] = await Promise.all([
      prisma.lookupTakipTuru.count({ where: { tenantId: tid, isActive: true } }),
      prisma.lookupMahiyetTipi.count({ where: { tenantId: tid, isActive: true } }),
      prisma.lookupAsama.count({ where: { tenantId: tid, isActive: true } }),
      prisma.lookupRisk.count({ where: { tenantId: tid, isActive: true } }),
      prisma.lookupBorcluTipi.count({ where: { tenantId: tid, isActive: true } }),
      prisma.lookupDurumEtiketi.count({ where: { tenantId: tid, isActive: true } }),
    ]);

    expect({ takipTuru, mahiyet, asama, risk, borcluTipi, durumEtiketi }).toEqual({
      takipTuru: 11,
      mahiyet: 18,
      asama: 9,
      risk: 3,
      borcluTipi: 3,
      durumEtiketi: 9,
    });

    // frontend'in aradığı kanonik kod yeni tenant'ta var (wizard kilidi oluşmaz)
    const cek = await prisma.lookupTakipTuru.findUnique({
      where: { tenantId_code: { tenantId: tid, code: "KAMBIYO_CEK" } },
    });
    expect(cek).toBeTruthy();
  });
});
