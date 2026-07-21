// OFFICE-AUTH-P02: credential-recovery (şifremi unuttum) servis testleri.
// Fake Prisma: gerçek atomic updateMany/count-guard ve $transaction rollback semantiğini
// simüle eden hafif in-memory tablo (disposable-DB entegrasyon testi ayrıca vardır —
// bkz. password-reset.db-gated.integration.spec.ts).
import { BadRequestException, Logger } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PasswordResetService } from "../password-reset.service";
import { hashInviteToken } from "../../invite/user-invite-token.util";

interface FakeUser {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string | null;
  isActive: boolean;
  tokenVersion: number;
  passwordChangedAt: Date | null;
}
interface FakeToken {
  id: string;
  tenantId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

function makeFakePrisma(seedUsers: FakeUser[], tenantSlugs: Record<string, string>) {
  let users: FakeUser[] = seedUsers.map((u) => ({ ...u }));
  let tokens: FakeToken[] = [];
  let idSeq = 0;
  const nextId = () => `tok_${++idSeq}`;

  function cloneState() {
    return { users: users.map((u) => ({ ...u })), tokens: tokens.map((t) => ({ ...t })) };
  }
  function restoreState(snap: { users: FakeUser[]; tokens: FakeToken[] }) {
    users = snap.users;
    tokens = snap.tokens;
  }

  const passwordResetToken = {
    create: async ({ data }: any) => {
      const row: FakeToken = {
        id: nextId(),
        tenantId: data.tenantId,
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        consumedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      };
      tokens.push(row);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      tokens = tokens.map((t) => {
        if (where.tokenHash !== undefined && t.tokenHash !== where.tokenHash) return t;
        if (where.userId !== undefined && t.userId !== where.userId) return t;
        if (where.consumedAt === null && t.consumedAt !== null) return t;
        if (where.revokedAt === null && t.revokedAt !== null) return t;
        if (where.expiresAt?.gt && !(t.expiresAt.getTime() > where.expiresAt.gt.getTime())) return t;
        if (where.NOT?.id !== undefined && t.id === where.NOT.id) return t;
        count++;
        return { ...t, ...data };
      });
      return { count };
    },
    findUniqueOrThrow: async ({ where }: any) => {
      const row = tokens.find((t) => t.tokenHash === where.tokenHash);
      if (!row) throw new Error("NotFound");
      return { ...row };
    },
    findMany: async ({ where }: any) =>
      tokens.filter((t) => (where.userId === undefined || t.userId === where.userId)).map((t) => ({ ...t })),
  };

  const user = {
    findFirst: async ({ where }: any) => {
      let candidates = users;
      if (where.id !== undefined) candidates = candidates.filter((u) => u.id === where.id);
      if (where.tenantId !== undefined) candidates = candidates.filter((u) => u.tenantId === where.tenantId);
      if (where.email !== undefined) candidates = candidates.filter((u) => u.email === where.email);
      if (where.tenant?.slug !== undefined) {
        candidates = candidates.filter((u) => tenantSlugs[u.tenantId] === where.tenant.slug);
      }
      return candidates[0] ? { ...candidates[0] } : null;
    },
    update: async ({ where, data }: any) => {
      let updated: FakeUser | undefined;
      users = users.map((u) => {
        if (u.id !== where.id) return u;
        const next = { ...u };
        if (data.passwordHash !== undefined) next.passwordHash = data.passwordHash;
        if (data.passwordChangedAt !== undefined) next.passwordChangedAt = data.passwordChangedAt;
        if (data.tokenVersion?.increment !== undefined) next.tokenVersion += data.tokenVersion.increment;
        updated = next;
        return next;
      });
      return updated;
    },
  };

  const prisma: any = {
    user,
    passwordResetToken,
    $transaction: async (cb: any) => {
      const snap = cloneState();
      try {
        return await cb(prisma);
      } catch (e) {
        restoreState(snap);
        throw e;
      }
    },
  };

  return { prisma, getUsers: () => users, getTokens: () => tokens };
}

function makeSvc(overrides: { users?: FakeUser[]; tenantSlugs?: Record<string, string>; emailSuccess?: boolean; passwordRecoveryEnabled?: boolean } = {}) {
  const users = overrides.users ?? [
    {
      id: "u1",
      tenantId: "t1",
      email: "user@example.com",
      passwordHash: bcrypt.hashSync("old-password-123456", 10),
      isActive: true,
      tokenVersion: 0,
      passwordChangedAt: null,
    },
  ];
  const tenantSlugs = overrides.tenantSlugs ?? { t1: "acme" };
  const { prisma, getUsers, getTokens } = makeFakePrisma(users, tenantSlugs);

  const auditLogs: any[] = [];
  const audit = {
    log: jest.fn(async (input: any) => {
      auditLogs.push(input);
    }),
    logInTransaction: jest.fn(async (_tx: any, input: any) => {
      auditLogs.push(input);
    }),
  } as any;

  const emailSuccess = overrides.emailSuccess ?? true;
  const sentEmails: any[] = [];
  const email = {
    send: jest.fn(async (opts: any) => {
      sentEmails.push(opts);
      return emailSuccess
        ? { success: true, messageId: "MOCK-1", provider: "mock" }
        : { success: false, errorCode: "SMTP_ERROR", provider: "mock" };
    }),
  } as any;

  // OFFICE-AUTH-P02-HARDENING-R01: varsayılan ENABLED — mevcut testler flag'i "açık" varsayarak
  // yazılmıştır; flag=false davranışı ayrı, özel testlerde override edilir.
  const passwordRecoveryEnabled = overrides.passwordRecoveryEnabled ?? true;
  const config = {
    get: jest.fn((key: string) =>
      key === "OFFICE_PASSWORD_RECOVERY_ENABLED" ? String(passwordRecoveryEnabled) : undefined,
    ),
  } as any;

  const svc = new PasswordResetService(prisma, audit, email, config);
  return { svc, prisma, getUsers, getTokens, auditLogs, sentEmails, audit, email };
}

function extractRawTokenFromEmail(sentEmails: any[]): string {
  const url = sentEmails[0].text as string;
  const match = url.match(/token=([^\s&]+)/);
  if (!match) throw new Error("token not found in email body");
  return decodeURIComponent(match[1]);
}

describe("PasswordResetService — OFFICE-AUTH-P02", () => {
  describe("forgotPassword", () => {
    it("[1] bilinmeyen tenantSlug → generic {success:true}, token/e-posta üretilmez", async () => {
      const { svc, getTokens, sentEmails } = makeSvc();
      const res = await svc.forgotPassword({ email: "user@example.com", tenantSlug: "yok-boyle-kurum" });
      expect(res).toEqual({ success: true });
      expect(getTokens()).toHaveLength(0);
      expect(sentEmails).toHaveLength(0);
    });

    it("[2] bilinen tenant / bilinmeyen kullanıcı → generic {success:true}, token üretilmez", async () => {
      const { svc, getTokens } = makeSvc();
      const res = await svc.forgotPassword({ email: "yok@example.com", tenantSlug: "acme" });
      expect(res).toEqual({ success: true });
      expect(getTokens()).toHaveLength(0);
    });

    it("[2b] pasif (isActive=false) kullanıcı → generic {success:true}, token üretilmez", async () => {
      const { svc, getTokens } = makeSvc({
        users: [
          { id: "u1", tenantId: "t1", email: "user@example.com", passwordHash: "x", isActive: false, tokenVersion: 0, passwordChangedAt: null },
        ],
      });
      const res = await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      expect(res).toEqual({ success: true });
      expect(getTokens()).toHaveLength(0);
    });

    it("[2c] pending kullanıcı (passwordHash=null) → generic {success:true}, token üretilmez", async () => {
      const { svc, getTokens } = makeSvc({
        users: [
          { id: "u1", tenantId: "t1", email: "user@example.com", passwordHash: null, isActive: true, tokenVersion: 0, passwordChangedAt: null },
        ],
      });
      const res = await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      expect(res).toEqual({ success: true });
      expect(getTokens()).toHaveLength(0);
    });

    it("[3] bilinen aktif kullanıcı → token oluşturulur, DB'de yalnız hash saklanır (ham token yok)", async () => {
      const { svc, getTokens, sentEmails } = makeSvc();
      await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      const tokens = getTokens();
      expect(tokens).toHaveLength(1);
      const raw = extractRawTokenFromEmail(sentEmails);
      expect(tokens[0].tokenHash).toBe(hashInviteToken(raw));
      // Serileştirilmiş DB satırında ham token asla bulunmaz.
      expect(JSON.stringify(tokens[0])).not.toContain(raw);
    });

    it("[4] expiry ~1 saat", async () => {
      const before = Date.now();
      const { svc, getTokens } = makeSvc();
      await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      const after = Date.now();
      const exp = getTokens()[0].expiresAt.getTime();
      expect(exp).toBeGreaterThanOrEqual(before + 3600_000 - 5000);
      expect(exp).toBeLessThanOrEqual(after + 3600_000 + 5000);
    });

    it("[5] önceki aktif token revoke edilir (aynı anda en fazla bir geçerli token)", async () => {
      const { svc, getTokens } = makeSvc();
      await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      const tokens = getTokens();
      expect(tokens).toHaveLength(2);
      expect(tokens[0].revokedAt).not.toBeNull();
      expect(tokens[1].revokedAt).toBeNull();
    });

    it("[6] e-posta gönderilir (EmailProviderService.send çağrılır)", async () => {
      const { svc, email } = makeSvc();
      await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(email.send.mock.calls[0][0].to).toBe("user@example.com");
    });

    it("[7] e-posta gönderimi BAŞARISIZ → oluşturulan token hemen revoke edilir (aktif kullanılabilir token kalmaz)", async () => {
      const { svc, getTokens } = makeSvc({ emailSuccess: false });
      await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      const tokens = getTokens();
      expect(tokens).toHaveLength(1);
      expect(tokens[0].revokedAt).not.toBeNull();
    });

    it("[8] audit PASSWORD_RESET_REQUESTED yazılır, metadata ham token/e-posta İÇERMEZ", async () => {
      const { svc, auditLogs } = makeSvc();
      await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      const requested = auditLogs.find((a) => a.action === "PASSWORD_RESET_REQUESTED");
      expect(requested).toBeDefined();
      expect(requested.tenantId).toBe("t1");
      const serialized = JSON.stringify(requested);
      expect(serialized).not.toContain("user@example.com");
    });

    it("[8c] e-posta BAŞARILI → PASSWORD_RESET_EMAIL_DISPATCHED audit yazılır, metadata yalnız outcome içerir", async () => {
      const { svc, auditLogs } = makeSvc();
      await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      const dispatched = auditLogs.find((a) => a.action === "PASSWORD_RESET_EMAIL_DISPATCHED");
      expect(dispatched).toBeDefined();
      expect(dispatched.metadata).toEqual({ outcome: "DISPATCHED" });
    });

    it("[8d] e-posta BAŞARISIZ → PASSWORD_RESET_EMAIL_FAILED audit yazılır, metadata yalnız outcome içerir (emailRedacted YOK)", async () => {
      const { svc, auditLogs } = makeSvc({ emailSuccess: false });
      await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      const failed = auditLogs.find((a) => a.action === "PASSWORD_RESET_EMAIL_FAILED");
      expect(failed).toBeDefined();
      expect(failed.metadata).toEqual({ outcome: "EMAIL_FAILED" });
    });

    it("[21] flag KAPALI → generic {success:true} döner, hiçbir DB/e-posta/audit işlemi yapılmaz", async () => {
      const { svc, getTokens, sentEmails, auditLogs } = makeSvc({ passwordRecoveryEnabled: false });
      const res = await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      expect(res).toEqual({ success: true });
      expect(getTokens()).toHaveLength(0);
      expect(sentEmails).toHaveLength(0);
      expect(auditLogs).toHaveLength(0);
    });

    it("[8b] bilinmeyen kullanıcı için audit YAZILMAZ (tenant/user bilinmiyorken sahte kayıt açılmaz)", async () => {
      const { svc, auditLogs } = makeSvc();
      await svc.forgotPassword({ email: "yok@example.com", tenantSlug: "acme" });
      expect(auditLogs).toHaveLength(0);
    });

    it("[9] aynı e-postanın farklı tenantlarda doğru ayrıştırılması — yalnız doğru tenant'ın kullanıcısı için token üretilir", async () => {
      const { svc, getTokens } = makeSvc({
        users: [
          { id: "u1", tenantId: "t1", email: "shared@example.com", passwordHash: "x", isActive: true, tokenVersion: 0, passwordChangedAt: null },
          { id: "u2", tenantId: "t2", email: "shared@example.com", passwordHash: "x", isActive: true, tokenVersion: 0, passwordChangedAt: null },
        ],
        tenantSlugs: { t1: "acme", t2: "beta" },
      });
      await svc.forgotPassword({ email: "shared@example.com", tenantSlug: "beta" });
      const tokens = getTokens();
      expect(tokens).toHaveLength(1);
      expect(tokens[0].userId).toBe("u2");
      expect(tokens[0].tenantId).toBe("t2");
    });
  });

  describe("resetPassword", () => {
    async function requestToken(svc: any, sentEmails: any[]) {
      await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      return extractRawTokenFromEmail(sentEmails);
    }

    it("[22] flag KAPALI → generic ret hatası fırlatır, token/DB kontrolüne gidilmeden", async () => {
      const { svc } = makeSvc({ passwordRecoveryEnabled: false });
      await expect(
        svc.resetPassword({ token: "her-hangi-bir-token", password: "brand-new-password-2026", passwordConfirmation: "brand-new-password-2026" }),
      ).rejects.toThrow("Geçersiz veya süresi dolmuş token");
    });

    it("[10] geçerli token → başarı; password/tokenVersion/passwordChangedAt güncellenir, token consumed olur, audit yazılır", async () => {
      const { svc, sentEmails, getUsers, getTokens, auditLogs } = makeSvc();
      const raw = await requestToken(svc, sentEmails);

      const res = await svc.resetPassword({ token: raw, password: "brand-new-password-2026", passwordConfirmation: "brand-new-password-2026" });
      expect(res).toEqual({ ok: true });

      const u = getUsers().find((x) => x.id === "u1")!;
      expect(u.tokenVersion).toBe(1);
      expect(u.passwordChangedAt).not.toBeNull();
      expect(await bcrypt.compare("brand-new-password-2026", u.passwordHash!)).toBe(true);

      const tok = getTokens().find((t) => t.tokenHash === hashInviteToken(raw))!;
      expect(tok.consumedAt).not.toBeNull();

      const completedAudit = auditLogs.find((a) => a.action === "PASSWORD_RESET_COMPLETED");
      expect(completedAudit).toBeDefined();
      expect(completedAudit.userId).toBe("u1");
    });

    it("[11] expired token → ret (generic mesaj)", async () => {
      const { svc, sentEmails, getTokens } = makeSvc();
      const raw = await requestToken(svc, sentEmails);
      getTokens()[0].expiresAt = new Date(Date.now() - 1000);
      await expect(
        svc.resetPassword({ token: raw, password: "brand-new-password-2026", passwordConfirmation: "brand-new-password-2026" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("[12] consumed token (ikinci kullanım) → ret", async () => {
      const { svc, sentEmails } = makeSvc();
      const raw = await requestToken(svc, sentEmails);
      await svc.resetPassword({ token: raw, password: "brand-new-password-2026", passwordConfirmation: "brand-new-password-2026" });
      await expect(
        svc.resetPassword({ token: raw, password: "another-password-123456", passwordConfirmation: "another-password-123456" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("[13] revoked token → ret", async () => {
      const { svc, sentEmails, getTokens } = makeSvc();
      const raw = await requestToken(svc, sentEmails);
      getTokens()[0].revokedAt = new Date();
      await expect(
        svc.resetPassword({ token: raw, password: "brand-new-password-2026", passwordConfirmation: "brand-new-password-2026" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("[14] rastgele/yok token → ret", async () => {
      const { svc } = makeSvc();
      await expect(
        svc.resetPassword({ token: "totally-made-up-token", password: "brand-new-password-2026", passwordConfirmation: "brand-new-password-2026" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("[15] password mismatch → ret, DB'ye dokunulmadan", async () => {
      const { svc, sentEmails, getTokens } = makeSvc();
      const raw = await requestToken(svc, sentEmails);
      await expect(
        svc.resetPassword({ token: raw, password: "brand-new-password-2026", passwordConfirmation: "different-one-123456" })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(getTokens()[0].consumedAt).toBeNull();
    });

    it("[16] bcrypt 72-bayt sınırı", async () => {
      const { svc, sentEmails } = makeSvc();
      const raw = await requestToken(svc, sentEmails);
      const tooLong = "a".repeat(73);
      await expect(
        svc.resetPassword({ token: raw, password: tooLong, passwordConfirmation: tooLong })
      ).rejects.toThrow("72 bayt");
    });

    it("[17] başarılı reset: diğer aktif tokenlar revoke edilir", async () => {
      const { svc, sentEmails, getTokens, prisma } = makeSvc();
      const raw1 = await requestToken(svc, sentEmails);
      // İkinci bir aktif token'ı manuel ekleyelim (ör. farklı bir cihazdan eşzamanlı istek).
      await prisma.passwordResetToken.create({
        data: { tenantId: "t1", userId: "u1", tokenHash: "manual-hash-2", expiresAt: new Date(Date.now() + 3600_000) },
      });
      await svc.resetPassword({ token: raw1, password: "brand-new-password-2026", passwordConfirmation: "brand-new-password-2026" });
      const manual = getTokens().find((t) => t.tokenHash === "manual-hash-2")!;
      expect(manual.revokedAt).not.toBeNull();
    });

    it("[18] transaction rollback: geçersiz token durumunda hiçbir kullanıcı alanı değişmez", async () => {
      const { svc, getUsers } = makeSvc();
      const before = { ...getUsers()[0] };
      await expect(
        svc.resetPassword({ token: "gecersiz", password: "brand-new-password-2026", passwordConfirmation: "brand-new-password-2026" })
      ).rejects.toBeInstanceOf(BadRequestException);
      const after = getUsers()[0];
      expect(after.tokenVersion).toBe(before.tokenVersion);
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.passwordChangedAt).toBe(before.passwordChangedAt);
    });

    it("[19] concurrent consume: aynı tokenla eşzamanlı iki istekten yalnız biri başarılı olur", async () => {
      const { svc, sentEmails } = makeSvc();
      const raw = await requestToken(svc, sentEmails);
      const results = await Promise.allSettled([
        svc.resetPassword({ token: raw, password: "password-one-123456", passwordConfirmation: "password-one-123456" }),
        svc.resetPassword({ token: raw, password: "password-two-123456", passwordConfirmation: "password-two-123456" }),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });

    it("[20] başarılı reset sonrası eski tokenVersion ile üretilmiş JWT geçersiz sayılır (AuthService.validateUser semantiği)", async () => {
      // Bu servis tokenVersion'ı increment eder; JwtStrategy/AuthService.validateUser'ın
      // tokenVersion karşılaştırması zaten OFFICE-AUTH-P01'de test edilmiştir
      // (auth-tokenversion-revocation.spec.ts). Burada yalnız increment'in gerçekleştiğini
      // doğrularız — end-to-end JWT reddi ayrı, mevcut suite'in sorumluluğundadır.
      const { svc, sentEmails, getUsers } = makeSvc();
      const raw = await requestToken(svc, sentEmails);
      const oldTokenVersion = getUsers()[0].tokenVersion;
      await svc.resetPassword({ token: raw, password: "brand-new-password-2026", passwordConfirmation: "brand-new-password-2026" });
      expect(getUsers()[0].tokenVersion).toBe(oldTokenVersion + 1);
    });
  });

  // OFFICE-AUTH-P02-HARDENING-R01: yukarıdaki stateful fake, $transaction'ı asla fırlatmayacak
  // şekilde tasarlanmıştır (gerçek Serializable/P2034/P2002 çakışması gerçek Postgres gerektirir —
  // bkz. password-reset.db-gated.integration.spec.ts). Retry/compensation KONTROL AKIŞINI izole
  // biçimde doğrulamak için burada ayrı, minimal jest.fn() tabanlı mock'lar kullanılır.
  describe("createResetTokenWithRetry / dispatchResetEmailOrCompensate (mock-based control flow)", () => {
    function p2034() {
      const e: any = new Error("Transaction conflict/serialization failure");
      e.code = "P2034";
      return e;
    }
    function p2002(target: string[]) {
      const e: any = new Error("Unique constraint failed");
      e.code = "P2002";
      e.meta = { target };
      return e;
    }

    function makeMockSvc() {
      const config = { get: jest.fn(() => "true") } as any;
      const userRow = { id: "u1", tenantId: "t1", email: "user@example.com", isActive: true, passwordHash: "x" };
      const user = { findFirst: jest.fn(async () => ({ ...userRow })) };
      const createdHashes: string[] = [];
      const passwordResetToken = {
        updateMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async ({ data }: any) => {
          createdHashes.push(data.tokenHash);
          return { ...data };
        }),
      };
      const auditLogs: any[] = [];
      const audit = {
        log: jest.fn(async (input: any) => { auditLogs.push(input); }),
        logInTransaction: jest.fn(async (_tx: any, input: any) => { auditLogs.push(input); }),
      } as any;
      const email = { send: jest.fn() } as any;
      const prisma: any = { user, passwordResetToken };
      return { prisma, audit, email, config, auditLogs, createdHashes, passwordResetToken };
    }

    it("[R1] P2034 bir kez fırlar, ikinci denemede başarılı olur (retry çalışır)", async () => {
      const { prisma, audit, email, config, auditLogs } = makeMockSvc();
      let attempt = 0;
      prisma.$transaction = jest.fn(async (cb: any) => {
        attempt++;
        const result = await cb(prisma);
        if (attempt === 1) throw p2034();
        return result;
      });
      email.send.mockResolvedValue({ success: true, provider: "mock" });
      const svc = new PasswordResetService(prisma, audit, email, config);
      const res = await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      expect(res).toEqual({ success: true });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(auditLogs.some((a) => a.action === "PASSWORD_RESET_REQUESTED")).toBe(true);
    });

    it("[R2] retryable P2002 (tenantId+userId) bir kez fırlar, ikinci denemede başarılı olur", async () => {
      const { prisma, audit, email, config } = makeMockSvc();
      let attempt = 0;
      prisma.$transaction = jest.fn(async (cb: any) => {
        attempt++;
        const result = await cb(prisma);
        if (attempt === 1) throw p2002(["tenantId", "userId"]);
        return result;
      });
      email.send.mockResolvedValue({ success: true, provider: "mock" });
      const svc = new PasswordResetService(prisma, audit, email, config);
      const res = await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      expect(res).toEqual({ success: true });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it("[R3] İLGİSİZ P2002 (tokenHash) asla retry edilmez — ilk denemede fırlar", async () => {
      const { prisma, audit, email, config } = makeMockSvc();
      prisma.$transaction = jest.fn(async () => {
        throw p2002(["tokenHash"]);
      });
      const svc = new PasswordResetService(prisma, audit, email, config);
      await expect(svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" })).rejects.toThrow();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("[R4] sürekli P2034 → sınırlı deneme sayısından sonra fırlar (sonsuz döngü YOK)", async () => {
      const { prisma, audit, email, config } = makeMockSvc();
      prisma.$transaction = jest.fn(async () => {
        throw p2034();
      });
      const svc = new PasswordResetService(prisma, audit, email, config);
      await expect(svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" })).rejects.toThrow();
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it("[R5] her retry denemesinde TAZE ham token üretilir (aynı tokenHash iki kez create edilmez)", async () => {
      const { prisma, audit, email, config, createdHashes } = makeMockSvc();
      let attempt = 0;
      prisma.$transaction = jest.fn(async (cb: any) => {
        attempt++;
        const result = await cb(prisma);
        if (attempt === 1) throw p2034();
        return result;
      });
      email.send.mockResolvedValue({ success: true, provider: "mock" });
      const svc = new PasswordResetService(prisma, audit, email, config);
      await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      expect(createdHashes).toHaveLength(2);
      expect(createdHashes[0]).not.toBe(createdHashes[1]);
    });

    it("[R6] e-posta gönderimi THROW eder → aynı compensation yolu (revoke + EMAIL_FAILED audit) tetiklenir, secret-free alarm", async () => {
      const { prisma, audit, email, config, auditLogs, passwordResetToken } = makeMockSvc();
      prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
      email.send.mockRejectedValue(new Error("SMTP connection refused: internal-host-secret-detail"));
      const loggerErrorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined as any);
      const svc = new PasswordResetService(prisma, audit, email, config);
      const res = await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      expect(res).toEqual({ success: true });
      expect(passwordResetToken.updateMany).toHaveBeenCalled();
      const failedAudit = auditLogs.find((a) => a.action === "PASSWORD_RESET_EMAIL_FAILED");
      expect(failedAudit).toBeDefined();
      expect(failedAudit.metadata).toEqual({ outcome: "EMAIL_FAILED" });
      const loggedMessages = loggerErrorSpy.mock.calls.map((c) => String(c[0]));
      expect(loggedMessages.some((m) => m.includes("internal-host-secret-detail"))).toBe(false);
      loggerErrorSpy.mockRestore();
    });

    it("[R7] compensation transaction'ın KENDİSİ başarısız olsa bile forgotPassword yine de {success:true} döner (throw etmez)", async () => {
      const { prisma, audit, email, config } = makeMockSvc();
      let txCall = 0;
      prisma.$transaction = jest.fn(async (cb: any) => {
        txCall++;
        if (txCall === 1) return cb(prisma);
        throw new Error("DB unreachable during compensation");
      });
      email.send.mockResolvedValue({ success: false, errorCode: "SMTP_ERROR", provider: "mock" });
      const loggerErrorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined as any);
      const svc = new PasswordResetService(prisma, audit, email, config);
      const res = await svc.forgotPassword({ email: "user@example.com", tenantSlug: "acme" });
      expect(res).toEqual({ success: true });
      loggerErrorSpy.mockRestore();
    });
  });
});
