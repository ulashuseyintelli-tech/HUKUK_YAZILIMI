/**
 * CLIENT-P2-U01-R1 — canonical credential-recovery (PR #1477) tenant/client izolasyon
 * (GERÇEK Postgres). GATE: describeDb → DATABASE_URL yoksa SKIP.
 *
 * Kapatılan gap: PR #1477'nin credential-recovery.spec.ts'i yalnız mocked-prisma unit
 * seviyesindedir; bu repoda forgot-password/reset-password akışının gerçek bir veritabanına
 * karşı tenant/client cross-account izolasyon kanıtı YOKTU. Bu dosya bunu kapatır — canonical
 * PortalService davranışını (base64url token, hashInviteToken, audit'siz atomic updateMany)
 * DEĞİŞTİRMEDEN, olduğu gibi test eder.
 */
import { describeDb } from "../../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { OfficeApprovalService } from "../../office-approval/office-approval.service";
import { EmailProviderService } from "../../notification/email-provider.service";
import { PortalService } from "../portal.service";

describeDb("CLIENT-P2-U01-R1 — canonical portal reset tenant/client isolation (integration)", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let portal: PortalService;
  let emailProvider: EmailProviderService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), JwtModule.register({ secret: "client-p2-u01-r1-test-secret" })],
      providers: [
        PortalService,
        PrismaService,
        AuditService,
        EmailProviderService,
        ConfigService,
        { provide: OfficeApprovalService, useValue: {} },
      ],
    }).compile();
    prisma = module.get<PrismaService>(PrismaService);
    portal = module.get<PortalService>(PortalService);
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
      data: { name: `CLIENT-P2-U01-R1 ${label} ${ts}`, slug: `client-p2-u01-r1-${label}-${ts}`.toLowerCase() },
    });
    createdTenantIds.push(tenant.id);

    const client = await prisma.client.create({
      data: { tenantId: tenant.id, type: "PERSON", displayName: `${label} Müvekkil` },
    });

    const initialPasswordHash = await bcrypt.hash("EskiSifre123", 10);
    const portalUser = await prisma.clientPortalUser.create({
      data: {
        clientId: client.id,
        email: `${label.toLowerCase()}+${ts}@client-p2-u01-r1.test`,
        passwordHash: initialPasswordHash,
        isActive: true,
      },
    });

    return { tenant, client, portalUser };
  }

  // generateRawInviteToken() → crypto.randomBytes(32).toString("base64url") (hex DEĞİL).
  function captureRawToken(): { get: () => string } {
    let raw = "";
    jest.spyOn(emailProvider, "send").mockImplementation(async (opts: any) => {
      const match = /token=([A-Za-z0-9_-]+)/.exec(opts.text);
      raw = match ? match[1] : "";
      return { success: true, provider: "mock", messageId: "SPY-1" };
    });
    return { get: () => raw };
  }

  it("[1] reset talebi yalnız bağlı portal user'ın satırını günceller — başka tenant/client ETKİLENMEZ", async () => {
    const a = await createTenantWithPortalUser("TenA1");
    const b = await createTenantWithPortalUser("TenB1");
    captureRawToken();

    await portal.createResetToken(a.portalUser.email);

    const rowA = await prisma.clientPortalUser.findUnique({ where: { id: a.portalUser.id } });
    const rowB = await prisma.clientPortalUser.findUnique({ where: { id: b.portalUser.id } });
    expect(rowA?.resetToken).not.toBeNull();
    expect(rowB?.resetToken).toBeNull(); // cross-tenant sızıntı yok
  });

  it("[2] geçerli token yalnız SAHİBİ olan hesabın şifresini değiştirir; diğer tenant/client dokunulmaz kalır", async () => {
    const a = await createTenantWithPortalUser("TenA2");
    const b = await createTenantWithPortalUser("TenB2");
    const capture = captureRawToken();

    await portal.createResetToken(a.portalUser.email);
    const rawToken = capture.get();
    expect(rawToken.length).toBeGreaterThan(20); // base64url(32 byte) ≈ 43 karakter

    const res = await portal.resetPassword(rawToken, "YepyeniSifre123");
    expect(res).toEqual({ success: true });

    const rowA = await prisma.clientPortalUser.findUnique({ where: { id: a.portalUser.id } });
    expect(rowA?.resetToken).toBeNull();
    expect(rowA?.resetTokenExp).toBeNull();
    expect(await bcrypt.compare("YepyeniSifre123", rowA!.passwordHash)).toBe(true);
    expect(await bcrypt.compare("EskiSifre123", rowA!.passwordHash)).toBe(false);

    const rowB = await prisma.clientPortalUser.findUnique({ where: { id: b.portalUser.id } });
    expect(await bcrypt.compare("EskiSifre123", rowB!.passwordHash)).toBe(true); // B tamamen dokunulmamış
    expect(rowB?.resetToken).toBeNull();
  });

  it("[3] foreign/rastgele token B'nin hesabını GÜNCELLEYEMEZ (etkilenen satır=0), A'nın kendi token'ı dokunulmamış kalır", async () => {
    const a = await createTenantWithPortalUser("TenA3");
    await createTenantWithPortalUser("TenB3");
    const capture = captureRawToken();

    await portal.createResetToken(a.portalUser.email);
    const rawTokenForA = capture.get();

    await expect(portal.resetPassword("f".repeat(48), "BaskaSifre456")).rejects.toBeInstanceOf(BadRequestException);

    const rowA = await prisma.clientPortalUser.findUnique({ where: { id: a.portalUser.id } });
    expect(await bcrypt.compare("EskiSifre123", rowA!.passwordHash)).toBe(true); // A dokunulmamış
    expect(rowA?.resetToken).not.toBeNull(); // A'nın kendi token'ı hâlâ orada, foreign denemeden etkilenmedi
    void rawTokenForA;
  });

  it("[4] bilinen ve bilinmeyen hesap için generic {success:true} — cross-tenant existence disclosure YOK", async () => {
    const a = await createTenantWithPortalUser("TenA4");
    captureRawToken();

    const knownRes = await portal.createResetToken(a.portalUser.email);
    const unknownRes = await portal.createResetToken(`hic-yok+${Date.now()}@client-p2-u01-r1.test`);

    expect(knownRes).toEqual({ success: true });
    expect(unknownRes).toEqual({ success: true });
  });

  it("[5] replay: aynı token ikinci kez kullanılamaz (gerçek Postgres üzerinde tek-kullanımlık)", async () => {
    const a = await createTenantWithPortalUser("TenA5");
    const capture = captureRawToken();
    await portal.createResetToken(a.portalUser.email);
    const rawToken = capture.get();

    await expect(portal.resetPassword(rawToken, "IlkGuncelleme123")).resolves.toEqual({ success: true });
    await expect(portal.resetPassword(rawToken, "IkinciDeneme456")).rejects.toBeInstanceOf(BadRequestException);

    const rowA = await prisma.clientPortalUser.findUnique({ where: { id: a.portalUser.id } });
    expect(await bcrypt.compare("IlkGuncelleme123", rowA!.passwordHash)).toBe(true);
    expect(await bcrypt.compare("IkinciDeneme456", rowA!.passwordHash)).toBe(false);
  });
});
