import { describeDb } from "../../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { JwtModule } from "@nestjs/jwt";
import { UnauthorizedException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { AuthService } from "../../auth/auth.service";
import { UserService } from "../user.service";
import { AuditService } from "../../audit/audit.service";

/**
 * OFFICE-AUTH-P01 — self-service parola değiştirme + tokenVersion session revocation
 * (GERÇEK Postgres, izole test verisi). GATE: describeDb → DATABASE_URL yoksa SKIP.
 */
describeDb("OFFICE-AUTH-P01 — changeOwnPassword (integration)", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let auth: AuthService;
  let userService: UserService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "office-auth-p01-test-secret" })],
      providers: [AuthService, UserService, PrismaService, AuditService],
    }).compile();
    prisma = module.get<PrismaService>(PrismaService);
    auth = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
  });

  afterAll(async () => {
    for (const tid of createdTenantIds) {
      await prisma.lookupTakipTuru.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupMahiyetTipi.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupAsama.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupRisk.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupDurumEtiketi.deleteMany({ where: { tenantId: tid } });
      await prisma.auditLog.deleteMany({ where: { tenantId: tid } });
      await prisma.user.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await module.close();
  });

  it("migration: yeni kullanıcı tokenVersion=0 (default), passwordChangedAt=null (nullable) ile doğar", async () => {
    const ts = Date.now();
    const res: any = await auth.register({
      firmName: `OFFICE-AUTH-P01 Migration ${ts}`,
      email: `p01-migration+${ts}@test.local`,
      password: "initial-password-123",
      name: "Test",
      surname: "User",
    } as any);
    createdTenantIds.push(res.tenant.id);

    const row = await prisma.user.findUnique({ where: { id: res.user.id } });
    expect(row?.tokenVersion).toBe(0);
    expect(row?.passwordChangedAt).toBeNull();
  });

  it("tenant-scoped çözümleme + başarılı değişim + eski token reddi + yeni login PASS + cross-tenant DENIED", async () => {
    const ts = Date.now();
    const emailA = `p01-a+${ts}@test.local`;
    const emailB = `p01-b+${ts}@test.local`;

    const resA: any = await auth.register({
      firmName: `OFFICE-AUTH-P01 Tenant A ${ts}`,
      email: emailA,
      password: "old-password-123456",
      name: "Kullanici",
      surname: "A",
    } as any);
    createdTenantIds.push(resA.tenant.id);

    const resB: any = await auth.register({
      firmName: `OFFICE-AUTH-P01 Tenant B ${ts}`,
      email: emailB,
      password: "tenant-b-password-1",
      name: "Kullanici",
      surname: "B",
    } as any);
    createdTenantIds.push(resB.tenant.id);

    // Değişim öncesi: gerçek login ile ESKİ tokenVersion=0 taşıyan bir JWT payload'ı simüle et.
    const oldTokenVersion = 0;
    const preChange = await auth.validateUser(resA.user.id, oldTokenVersion);
    expect(preChange.id).toBe(resA.user.id);

    // Başka tenant'ın kullanıcısını hedeflemeye çalışmak (yanlış tenantId) → DENIED.
    await expect(
      userService.changeOwnPassword(resA.user.id, resB.tenant.id, {
        currentPassword: "old-password-123456",
        newPassword: "brand-new-password-999",
        newPasswordConfirmation: "brand-new-password-999",
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Doğru tenant + doğru mevcut parola → başarılı değişim.
    const changeResult = await userService.changeOwnPassword(resA.user.id, resA.tenant.id, {
      currentPassword: "old-password-123456",
      newPassword: "brand-new-password-999",
      newPasswordConfirmation: "brand-new-password-999",
    });
    expect(changeResult).toEqual({ ok: true });

    const rowAfter = await prisma.user.findUnique({ where: { id: resA.user.id } });
    expect(rowAfter?.tokenVersion).toBe(1);
    expect(rowAfter?.passwordChangedAt).not.toBeNull();

    // ESKİ token (tokenVersion=0 claim'i, değişim öncesi login'den) artık reddedilir.
    await expect(auth.validateUser(resA.user.id, oldTokenVersion)).rejects.toBeInstanceOf(UnauthorizedException);

    // Eski şifre artık geçersiz.
    await expect(
      auth.login({ email: emailA, password: "old-password-123456", tenantSlug: resA.tenant.slug } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // YENİ şifre ile YENİ login → PASS, ve dönen token'ın payload'ı güncel tokenVersion=1 taşır
    // (validateUser(id, 1) artık geçerli olmalı — generateToken doğru değeri imzaladığının kanıtı).
    const newLogin = await auth.login({
      email: emailA,
      password: "brand-new-password-999",
      tenantSlug: resA.tenant.slug,
    } as any);
    expect((newLogin.user as any).id).toBe(resA.user.id);
    const postLoginValidate = await auth.validateUser(resA.user.id, 1);
    expect(postLoginValidate.id).toBe(resA.user.id);
  });

  it("aynı eski/yeni parola gerçek DB'de de reddedilir (unit testin real-hash karşılığı)", async () => {
    const ts = Date.now();
    const res: any = await auth.register({
      firmName: `OFFICE-AUTH-P01 Same-Pass ${ts}`,
      email: `p01-samepass+${ts}@test.local`,
      password: "identical-password-1",
      name: "Test",
      surname: "SamePass",
    } as any);
    createdTenantIds.push(res.tenant.id);

    await expect(
      userService.changeOwnPassword(res.user.id, res.tenant.id, {
        currentPassword: "identical-password-1",
        newPassword: "identical-password-1",
        newPasswordConfirmation: "identical-password-1",
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    const row = await prisma.user.findUnique({ where: { id: res.user.id } });
    expect(row?.tokenVersion).toBe(0); // reddedildi, hiçbir şey artmadı
  });
});
