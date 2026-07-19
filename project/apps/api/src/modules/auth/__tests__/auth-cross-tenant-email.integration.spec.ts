import { describeDb } from "../../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { JwtModule } from "@nestjs/jwt";
import { UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { AuthService } from "../auth.service";

/**
 * AUTH-01 — Cross-tenant aynı e-posta senaryosu (GERÇEK Postgres, izole test verisi).
 *
 * Kanıtlanan: aynı e-posta iki AYRI tenant'ta var olabilir (@@unique([tenantId,email]) buna
 * izin verir), ve login() artık tenantSlug ile DOĞRU kullanıcıyı ayırt eder — global
 * findFirst(email) davranışı (yanlış kullanıcıyla eşleşme riski) SUPERSEDED.
 *
 * GATE: describeDb → TEST_DATABASE_URL yoksa SKIP. Dev hukuk_db'ye / Demo Firma'ya write YOK.
 */
describeDb("AUTH-01 — aynı email, farklı tenant (integration)", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let auth: AuthService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "auth-01-test-secret" })],
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
      await prisma.lookupDurumEtiketi.deleteMany({ where: { tenantId: tid } });
      await prisma.user.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await module.close();
  });

  it("aynı email iki farklı tenant'ta register olur + login tenantSlug ile doğru kullanıcıyı bulur", async () => {
    const ts = Date.now();
    const sharedEmail = `auth01-shared+${ts}@test.local`;

    const resA: any = await auth.register({
      firmName: `AUTH-01 Tenant A ${ts}`,
      email: sharedEmail,
      password: "password-A-123",
      name: "Kullanici",
      surname: "A",
    } as any);
    createdTenantIds.push(resA.tenant.id);

    const resB: any = await auth.register({
      firmName: `AUTH-01 Tenant B ${ts}`,
      email: sharedEmail,
      password: "password-B-123",
      name: "Kullanici",
      surname: "B",
    } as any);
    createdTenantIds.push(resB.tenant.id);

    // register() ARTIK global email-uniqueness ile engellemiyor — ikisi de başarıyla oluştu.
    expect(resA.tenant.id).not.toBe(resB.tenant.id);
    expect(resA.user.email).toBe(sharedEmail);
    expect(resB.user.email).toBe(sharedEmail);

    // Doğru tenantSlug + doğru parola → doğru kullanıcı/tenant ile login.
    const loginA = await auth.login({
      email: sharedEmail,
      password: "password-A-123",
      tenantSlug: resA.tenant.slug,
    } as any);
    expect((loginA.user as any).id).toBe(resA.user.id);
    expect(loginA.tenant.id).toBe(resA.tenant.id);

    const loginB = await auth.login({
      email: sharedEmail,
      password: "password-B-123",
      tenantSlug: resB.tenant.slug,
    } as any);
    expect((loginB.user as any).id).toBe(resB.user.id);
    expect(loginB.tenant.id).toBe(resB.tenant.id);

    // Doğru email + YANLIŞ tenantSlug (B'nin parolasıyla A'yı dene) → generic Unauthorized,
    // kullanıcının başka tenant'ta var olduğu SIZMAZ.
    await expect(
      auth.login({ email: sharedEmail, password: "password-B-123", tenantSlug: resA.tenant.slug } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Account Recovery: MULTIPLE — iki tenant da (yalnız slug/name) listelenir.
    const recovery = await auth.findTenantsForEmail(sharedEmail);
    expect(recovery.status).toBe("MULTIPLE");
    if (recovery.status === "MULTIPLE") {
      const slugs = recovery.tenants.map((t) => t.tenantSlug).sort();
      expect(slugs).toEqual([resA.tenant.slug, resB.tenant.slug].sort());
    }
  });
});
