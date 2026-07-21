import { describeDb } from "../../../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { AuthService } from "../../auth.service";
import { PasswordResetService } from "../password-reset.service";
import { AuditService } from "../../../audit/audit.service";
import { EmailProviderService } from "../../../notification/email-provider.service";
import { hashInviteToken } from "../../invite/user-invite-token.util";

/**
 * OFFICE-AUTH-P02 — credential-recovery (GERÇEK Postgres, izole test verisi).
 * GATE: describeDb → DATABASE_URL yoksa SKIP. EMAIL_PROVIDER ayarlanmadığı için
 * EmailProviderService 'mock' modda çalışır — gerçek e-posta gönderilmez, send() her
 * zaman success:true döner (bu suite'in odak noktası e-posta teslimatı değil, DB/transaction/
 * tenant-isolation/session-invalidation davranışıdır).
 */
describeDb("OFFICE-AUTH-P02 — password reset (integration)", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let auth: AuthService;
  let passwordReset: PasswordResetService;
  const createdTenantIds: string[] = [];
  // OFFICE-AUTH-P02-HARDENING-R01: bu suite gerçek ConfigService kullanır (ConfigModule YOK) —
  // flag env'de yoksa varsayılan false olur ve forgotPassword/resetPassword hiçbir şey yapmadan
  // döner. legal-time-shadow.db-gated.integration.spec.ts ile AYNI desen: flag'i test süresince
  // açık tut, suite bitince eski değerine geri al.
  const ORIGINAL_FLAG = process.env.OFFICE_PASSWORD_RECOVERY_ENABLED;

  beforeAll(async () => {
    process.env.OFFICE_PASSWORD_RECOVERY_ENABLED = "true";
    module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "office-auth-p02-test-secret" })],
      providers: [AuthService, PasswordResetService, PrismaService, AuditService, EmailProviderService, ConfigService],
    }).compile();
    prisma = module.get<PrismaService>(PrismaService);
    auth = module.get<AuthService>(AuthService);
    passwordReset = module.get<PasswordResetService>(PasswordResetService);
  });

  afterAll(async () => {
    if (ORIGINAL_FLAG === undefined) delete process.env.OFFICE_PASSWORD_RECOVERY_ENABLED;
    else process.env.OFFICE_PASSWORD_RECOVERY_ENABLED = ORIGINAL_FLAG;
    for (const tid of createdTenantIds) {
      await prisma.passwordResetToken.deleteMany({ where: { tenantId: tid } });
      await prisma.auditLog.deleteMany({ where: { tenantId: tid } });
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

  async function registerUser(label: string) {
    const ts = Date.now() + Math.floor(Math.random() * 1000);
    const email = `p02-${label}+${ts}@test.local`;
    const res: any = await auth.register({
      firmName: `OFFICE-AUTH-P02 ${label} ${ts}`,
      email,
      password: "original-password-123456",
      name: "Test",
      surname: label,
    } as any);
    createdTenantIds.push(res.tenant.id);
    return { tenantSlug: res.tenant.slug, email, userId: res.user.id, tenantId: res.tenant.id };
  }

  async function issueAndFetchRawToken(email: string, tenantSlug: string): Promise<string> {
    const sendSpy = jest.spyOn(EmailProviderService.prototype, "send");
    await passwordReset.forgotPassword({ email, tenantSlug });
    const call = sendSpy.mock.calls[sendSpy.mock.calls.length - 1][0] as any;
    sendSpy.mockRestore();
    const match = (call.text as string).match(/token=([^\s&]+)/);
    if (!match) throw new Error("reset URL/token bulunamadı");
    return decodeURIComponent(match[1]);
  }

  it("cross-tenant izolasyon: aynı e-posta iki farklı tenant'ta ayrı hesaplara ait — yalnız doğru tenant'ın token'ı üretilir", async () => {
    const ts = Date.now();
    const email = `p02-shared+${ts}@test.local`;
    const resA: any = await auth.register({ firmName: `P02 Shared A ${ts}`, email, password: "password-tenant-a-1", name: "A", surname: "User" } as any);
    createdTenantIds.push(resA.tenant.id);
    const resB: any = await auth.register({ firmName: `P02 Shared B ${ts}`, email, password: "password-tenant-b-1", name: "B", surname: "User" } as any);
    createdTenantIds.push(resB.tenant.id);

    const rawA = await issueAndFetchRawToken(email, resA.tenant.slug);

    const tokenRows = await prisma.passwordResetToken.findMany({ where: { userId: { in: [resA.user.id, resB.user.id] } } });
    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0].userId).toBe(resA.user.id);
    expect(tokenRows[0].tenantId).toBe(resA.tenant.id);

    // B'nin tenant'ıyla A'nın token'ı tüketilemez — reset yine de userId üzerinden çalıştığı için
    // token zaten yalnız A'ya ait; burada asıl garanti tokenRows[0].tenantId === resA.tenant.id'dir.
    await passwordReset.resetPassword({ token: rawA, password: "brand-new-password-2026", passwordConfirmation: "brand-new-password-2026" });
    const userA = await prisma.user.findUnique({ where: { id: resA.user.id } });
    const userB = await prisma.user.findUnique({ where: { id: resB.user.id } });
    expect(userA?.tokenVersion).toBe(1);
    expect(userB?.tokenVersion).toBe(0); // B tamamen etkilenmedi
  });

  it("uçtan uca: reset sonrası ESKİ JWT (eski tokenVersion) AuthService.validateUser tarafından reddedilir, YENİ login çalışır", async () => {
    const u = await registerUser("e2e");
    const raw = await issueAndFetchRawToken(u.email, u.tenantSlug);

    // Reset öncesi tokenVersion=0 ile "eski" JWT geçerliydi.
    const beforeUser = await auth.validateUser(u.userId, 0);
    expect(beforeUser.id).toBe(u.userId);

    await passwordReset.resetPassword({ token: raw, password: "post-reset-password-2026", passwordConfirmation: "post-reset-password-2026" });

    // Reset sonrası aynı (eski) tokenVersion=0 claim'i ile üretilmiş JWT artık reddedilir.
    await expect(auth.validateUser(u.userId, 0)).rejects.toBeInstanceOf(UnauthorizedException);

    // Yeni parola + yeni tenant-aware login çalışır (tokenVersion=1 ile).
    const loginRes: any = await auth.login({ email: u.email, password: "post-reset-password-2026", tenantSlug: u.tenantSlug } as any);
    expect(loginRes.user.id).toBe(u.userId);
    const afterUser = await auth.validateUser(u.userId, 1);
    expect(afterUser.id).toBe(u.userId);
  });

  it("token DB'de yalnız hash olarak saklanır — ham token hiçbir kolonda plaintext bulunmaz, hash gerçekten eşleşir", async () => {
    const u = await registerUser("hash");
    const raw = await issueAndFetchRawToken(u.email, u.tenantSlug);
    const row = await prisma.passwordResetToken.findFirst({ where: { userId: u.userId } });
    expect(row).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain(raw);
    expect(row!.tokenHash).not.toBe(raw);
    // OFFICE-AUTH-P02-HARDENING-R01: yalnız "raw değil" değil, POZİTİF olarak da doğru hash eşleşmesi.
    expect(row!.tokenHash).toBe(hashInviteToken(raw));
  });

  it("migration additive: PasswordResetToken tablosu mevcut User satırlarını etkilemez (mevcut alanlar değişmedi)", async () => {
    const u = await registerUser("additive");
    const before = await prisma.user.findUnique({ where: { id: u.userId } });
    expect(before?.tokenVersion).toBe(0);
    expect(before?.passwordChangedAt).toBeNull();
    // Token oluşturma tek başına User'a dokunmaz (yalnız resetPassword tokenVersion'ı artırır).
    await issueAndFetchRawToken(u.email, u.tenantSlug);
    const after = await prisma.user.findUnique({ where: { id: u.userId } });
    expect(after?.tokenVersion).toBe(0);
  });

  describe("OFFICE-AUTH-P02-HARDENING-R01 (gerçek Postgres — composite FK, partial index, concurrency)", () => {
    it("composite FK: cross-tenant (tenantId,userId) çifti REDDEDİLİR — gerçek Prisma Client çağrısıyla", async () => {
      const a = await registerUser("fk-a");
      const b = await registerUser("fk-b");
      await expect(
        prisma.passwordResetToken.create({
          data: {
            tenantId: b.tenantId, // b'nin tenant'ı
            userId: a.userId, // ama a'nın kullanıcısı — (tenantId,id) User'da yok
            tokenHash: `cross-tenant-fk-test-${Date.now()}`,
            expiresAt: new Date(Date.now() + 3600_000),
          },
        }),
      ).rejects.toThrow();
    });

    it("partial index: aynı (tenantId,userId) için ikinci ÇÖZÜLMEMİŞ token REDDEDİLİR; revoke sonrası yenisi kabul edilir", async () => {
      const u = await registerUser("partial-idx");
      await prisma.passwordResetToken.create({
        data: { tenantId: u.tenantId, userId: u.userId, tokenHash: `partial-idx-1-${Date.now()}`, expiresAt: new Date(Date.now() + 3600_000) },
      });
      await expect(
        prisma.passwordResetToken.create({
          data: { tenantId: u.tenantId, userId: u.userId, tokenHash: `partial-idx-2-${Date.now()}`, expiresAt: new Date(Date.now() + 3600_000) },
        }),
      ).rejects.toThrow();

      await prisma.passwordResetToken.updateMany({
        where: { tenantId: u.tenantId, userId: u.userId, consumedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await expect(
        prisma.passwordResetToken.create({
          data: { tenantId: u.tenantId, userId: u.userId, tokenHash: `partial-idx-3-${Date.now()}`, expiresAt: new Date(Date.now() + 3600_000) },
        }),
      ).resolves.toBeDefined();
    });

    it("GERÇEK eşzamanlı forgotPassword: aynı kullanıcı için 2 paralel istek de başarıyla döner, DB'de tam olarak 1 çözülmemiş token kalır", async () => {
      const u = await registerUser("concurrent-req");
      const sendSpy = jest.spyOn(EmailProviderService.prototype, "send").mockResolvedValue({
        success: true, messageId: "MOCK-CONCURRENT", provider: "mock",
      });
      try {
        const results = await Promise.allSettled([
          passwordReset.forgotPassword({ email: u.email, tenantSlug: u.tenantSlug }),
          passwordReset.forgotPassword({ email: u.email, tenantSlug: u.tenantSlug }),
        ]);
        // Serializable retry sayesinde İKİSİ DE enumeration-safe generic yanıtla sonuçlanır.
        expect(results.every((r) => r.status === "fulfilled")).toBe(true);

        const allTokens = await prisma.passwordResetToken.findMany({ where: { userId: u.userId } });
        const unresolved = allTokens.filter((t) => t.consumedAt === null && t.revokedAt === null);
        expect(allTokens.length).toBeGreaterThanOrEqual(1);
        expect(unresolved).toHaveLength(1); // partial index invariant'ı gerçek yarış altında da korunur
      } finally {
        sendSpy.mockRestore();
      }
    });

    it("REGRESYON — gerçek Postgres'te double-consume: eşzamanlı aynı token ile iki reset isteğinden yalnız biri başarılı olur", async () => {
      const u = await registerUser("real-double-consume");
      const raw = await issueAndFetchRawToken(u.email, u.tenantSlug);
      const results = await Promise.allSettled([
        passwordReset.resetPassword({ token: raw, password: "real-concurrent-pass-1", passwordConfirmation: "real-concurrent-pass-1" }),
        passwordReset.resetPassword({ token: raw, password: "real-concurrent-pass-2", passwordConfirmation: "real-concurrent-pass-2" }),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const user = await prisma.user.findUnique({ where: { id: u.userId } });
      expect(user?.tokenVersion).toBe(1); // yalnız BİR kez artmış
    });

    it("flag KAPALI (gerçek ConfigService/process.env) → forgotPassword hiçbir token oluşturmaz", async () => {
      const u = await registerUser("flag-off-real");
      process.env.OFFICE_PASSWORD_RECOVERY_ENABLED = "false";
      try {
        const res = await passwordReset.forgotPassword({ email: u.email, tenantSlug: u.tenantSlug });
        expect(res).toEqual({ success: true });
        const tokens = await prisma.passwordResetToken.findMany({ where: { userId: u.userId } });
        expect(tokens).toHaveLength(0);
      } finally {
        process.env.OFFICE_PASSWORD_RECOVERY_ENABLED = "true";
      }
    });
  });
});
