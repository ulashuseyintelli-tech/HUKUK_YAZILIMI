/**
 * CLIENT-P2-U02 — portal tokenVersion revocation (GERÇEK Postgres). GATE: describeDb →
 * DATABASE_URL yoksa SKIP.
 *
 * AS-IS (U01 ve öncesi): PortalAuthGuard yalnız imza/expiry/type kontrolü yapıyordu — reset/
 * change/disable sonrası eski JWT 7 gün geçerli kalıyordu. Bu dosya, gerçek bir veritabanına
 * karşı, yeni DB-backed guard'ın bu 4 tetikleyicide (reset/change/disable/reactivate) eski
 * token'ı GERÇEKTEN reddettiğini ve ilgisiz hesapların/tenant'ların ETKİLENMEDİĞİNİ kanıtlar.
 */
import { describeDb } from "../../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { OfficeApprovalService } from "../../office-approval/office-approval.service";
import { EmailProviderService } from "../../notification/email-provider.service";
import { PortalService } from "../portal.service";
import { PortalAuthGuard } from "../portal-auth.guard";

const TEST_JWT_SECRET = "client-p2-u02-test-secret";
const INITIAL_PASSWORD = "EskiSifre123";

function buildContext(token?: string): { ctx: any; request: any } {
  const request: any = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const ctx = { switchToHttp: () => ({ getRequest: () => request }) };
  return { ctx, request };
}

describeDb("CLIENT-P2-U02 — portal tokenVersion revocation (integration)", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let portal: PortalService;
  let guard: PortalAuthGuard;
  let jwtService: JwtService;
  let emailProvider: EmailProviderService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: "7d" } }),
      ],
      providers: [
        PortalService,
        PortalAuthGuard,
        PrismaService,
        AuditService,
        EmailProviderService,
        ConfigService,
        { provide: OfficeApprovalService, useValue: { isApproverEligible: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();
    prisma = module.get<PrismaService>(PrismaService);
    portal = module.get<PortalService>(PortalService);
    guard = module.get<PortalAuthGuard>(PortalAuthGuard);
    jwtService = module.get<JwtService>(JwtService);
    emailProvider = module.get<EmailProviderService>(EmailProviderService);
  });

  afterAll(async () => {
    for (const tid of createdTenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId: tid } });
      await prisma.clientPortalUser.deleteMany({ where: { client: { tenantId: tid } } });
      await prisma.client.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await module.close();
  });

  async function createTenantWithPortalUser(label: string) {
    const ts = Date.now() + Math.random();
    const tenant = await prisma.tenant.create({
      data: { name: `CLIENT-P2-U02 ${label} ${ts}`, slug: `client-p2-u02-${label}-${ts}`.toLowerCase() },
    });
    createdTenantIds.push(tenant.id);
    const client = await prisma.client.create({
      data: { tenantId: tenant.id, type: "PERSON", displayName: `${label} Müvekkil` },
    });
    const passwordHash = await bcrypt.hash(INITIAL_PASSWORD, 10);
    const portalUser = await prisma.clientPortalUser.create({
      data: {
        clientId: client.id,
        email: `${label.toLowerCase()}+${ts}@client-p2-u02.test`,
        passwordHash,
        isActive: true,
      },
    });
    return { tenant, client, portalUser };
  }

  function captureResetToken(): { get: () => string } {
    let raw = "";
    jest.spyOn(emailProvider, "send").mockImplementationOnce(async (opts: any) => {
      const match = /token=([A-Za-z0-9_-]+)/.exec(opts.text);
      raw = match ? match[1] : "";
      return { success: true, provider: "mock", messageId: "SPY-U02" };
    });
    return { get: () => raw };
  }

  it("[1] login: verilen JWT'nin tokenVersion claim'i DB satırının güncel değerine (0) eşittir", async () => {
    const { portalUser } = await createTenantWithPortalUser("Login1");
    const res = await portal.login(portalUser.email, INITIAL_PASSWORD);
    const decoded: any = jwtService.decode(res.token);
    expect(decoded.tokenVersion).toBe(0);
  });

  it("[2] güncel token → PortalAuthGuard ALLOW, req.portalUser yalnız DB-doğrulanmış alanları taşır", async () => {
    const { portalUser, client } = await createTenantWithPortalUser("Access2");
    const res = await portal.login(portalUser.email, INITIAL_PASSWORD);

    const { ctx, request } = buildContext(res.token);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.portalUser).toEqual({
      id: portalUser.id,
      sub: portalUser.id,
      clientId: client.id,
      tenantId: client.tenantId,
      tokenVersion: 0,
    });
  });

  it("[3] password reset → reset ÖNCESİNDE alınan eski token guard tarafından REDDEDİLİR", async () => {
    const { portalUser } = await createTenantWithPortalUser("Reset3");
    const oldTokenRes = await portal.login(portalUser.email, INITIAL_PASSWORD);

    const capture = captureResetToken();
    await portal.createResetToken(portalUser.email);
    await portal.resetPassword(capture.get(), "YeniSifre456");

    await expect(guard.canActivate(buildContext(oldTokenRes.token).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[4] reset SONRASI yeni şifreyle giriş → yeni token guard tarafından KABUL edilir", async () => {
    const { portalUser } = await createTenantWithPortalUser("Reset4");
    const capture = captureResetToken();
    await portal.createResetToken(portalUser.email);
    await portal.resetPassword(capture.get(), "YeniSifre456");

    const newLoginRes = await portal.login(portalUser.email, "YeniSifre456");
    await expect(guard.canActivate(buildContext(newLoginRes.token).ctx)).resolves.toBe(true);
  });

  it("[5] password change → değişiklik ÖNCESİNDE alınan token guard tarafından REDDEDİLİR", async () => {
    const { portalUser } = await createTenantWithPortalUser("Change5");
    const oldTokenRes = await portal.login(portalUser.email, INITIAL_PASSWORD);

    await portal.changePassword(portalUser.id, INITIAL_PASSWORD, "YeniSifre789");

    await expect(guard.canActivate(buildContext(oldTokenRes.token).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[6] account disable → mevcut token ANINDA reddedilir (şifre değişmese bile)", async () => {
    const { portalUser, client } = await createTenantWithPortalUser("Disable6");
    const tokenRes = await portal.login(portalUser.email, INITIAL_PASSWORD);

    await portal.disablePortalUser(client.id, client.tenantId, { userId: "u-admin" });

    await expect(guard.canActivate(buildContext(tokenRes.token).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[7] reactivation: disable-ÖNCESİ alınmış token, reaktivasyon SONRASINDA da dirilmez", async () => {
    const { portalUser, client } = await createTenantWithPortalUser("Reactivate7");
    const preDisableToken = await portal.login(portalUser.email, INITIAL_PASSWORD);

    await portal.disablePortalUser(client.id, client.tenantId, { userId: "u-admin" });
    await portal.createPortalUser(client.id, portalUser.email, "ReaktifSifre123", client.tenantId, { userId: "u-admin" });

    await expect(guard.canActivate(buildContext(preDisableToken.token).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[8] reaktivasyon SONRASI yeni şifreyle giriş → yeni token guard tarafından KABUL edilir", async () => {
    const { portalUser, client } = await createTenantWithPortalUser("Reactivate8");
    await portal.disablePortalUser(client.id, client.tenantId, { userId: "u-admin" });
    await portal.createPortalUser(client.id, portalUser.email, "ReaktifSifre456", client.tenantId, { userId: "u-admin" });

    const newLoginRes = await portal.login(portalUser.email, "ReaktifSifre456");
    await expect(guard.canActivate(buildContext(newLoginRes.token).ctx)).resolves.toBe(true);
  });

  it("[9] bir portal user'ın password change'i BAŞKA bir portal user'ın token'ını etkilemez", async () => {
    const a = await createTenantWithPortalUser("Isolate9A");
    const b = await createTenantWithPortalUser("Isolate9B");
    const tokenA = await portal.login(a.portalUser.email, INITIAL_PASSWORD);
    const tokenB = await portal.login(b.portalUser.email, INITIAL_PASSWORD);

    await portal.changePassword(a.portalUser.id, INITIAL_PASSWORD, "YeniSifreA999");

    await expect(guard.canActivate(buildContext(tokenA.token).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(buildContext(tokenB.token).ctx)).resolves.toBe(true);
  });

  it("[10] tenant/client claim'i başka bir hesabın kimliğiyle değiştirilmiş (geçerli imzalı) token → REDDEDİLİR", async () => {
    const a = await createTenantWithPortalUser("Forge10A");
    const b = await createTenantWithPortalUser("Forge10B");

    const forged = jwtService.sign({
      sub: a.portalUser.id,
      clientId: b.client.id,
      tenantId: b.client.tenantId,
      type: "portal",
      tokenVersion: 0,
    });

    await expect(guard.canActivate(buildContext(forged).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[11] legacy token (tokenVersion claim yok) → yalnız DB version hâlâ 0 iken KABUL, credential-state değişiminden SONRA REDDEDİLİR", async () => {
    const { portalUser, client } = await createTenantWithPortalUser("Legacy11");
    // Gerçek login() akışı BYPASS edilerek claim'siz imzalanır — deploy-öncesi (cutover-öncesi) JWT simülasyonu.
    const legacyToken = jwtService.sign({ sub: portalUser.id, clientId: client.id, tenantId: client.tenantId, type: "portal" });

    await expect(guard.canActivate(buildContext(legacyToken).ctx)).resolves.toBe(true);

    await portal.changePassword(portalUser.id, INITIAL_PASSWORD, "YeniSifreSonra123");

    await expect(guard.canActivate(buildContext(legacyToken).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[12] eşzamanlı N atomic increment → kayıp update olmaz, tokenVersion tam N kez artar", async () => {
    const { portalUser } = await createTenantWithPortalUser("Concurrent12");
    const N = 8;

    await Promise.all(
      Array.from({ length: N }, () =>
        prisma.clientPortalUser.update({ where: { id: portalUser.id }, data: { tokenVersion: { increment: 1 } } })
      )
    );

    const row = await prisma.clientPortalUser.findUnique({ where: { id: portalUser.id } });
    expect(row!.tokenVersion).toBe(N);
  });
});
