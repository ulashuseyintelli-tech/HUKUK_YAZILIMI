// K1-7: UserInviteService + AdminGuard testleri (mock prisma/audit/email/config).
import { BadRequestException, ForbiddenException, ExecutionContext } from "@nestjs/common";
import { UserInviteService } from "../user-invite.service";
import { AdminGuard } from "../../guards/admin.guard";
import { hashInviteToken } from "../user-invite-token.util";

const ACTOR = { id: "admin1", tenantId: "t1", role: "ADMIN" };

function make(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
  const user = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: "u9", email: "a@x.com", tenantId: "t1" }),
    update: jest.fn().mockResolvedValue({}),
  };
  const userInvite = {
    create: jest.fn().mockResolvedValue({ id: "inv1" }),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const tx = { user, userInvite };
  const prisma = { user, userInvite, $transaction: jest.fn(async (cb: any) => cb(tx)) } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const email = { send: jest.fn().mockResolvedValue({ success: true }) } as any;
  const config = {
    get: jest.fn((k: string) =>
      k === "LOGIN_INVITE_PROVISIONING_ENABLED" ? (enabled ? "true" : "false") : undefined,
    ),
  } as any;
  return { svc: new UserInviteService(prisma, audit, email, config), prisma, audit, email, user, userInvite };
}

const rawFromEmail = (email: any): string => {
  const text: string = email.send.mock.calls.at(-1)[0].text;
  return decodeURIComponent(text.match(/token=([^\s&]+)/)![1]);
};

describe("UserInviteService", () => {
  it("[5][6] issue pending User oluşturur (isActive=false, passwordHash=null, tenant-bound)", async () => {
    const { svc, user } = make();
    await svc.issue(ACTOR, { email: "A@x.com", name: "Ad" });
    const data = user.create.mock.calls[0][0].data;
    expect(data.isActive).toBe(false);
    expect(data.passwordHash).toBeNull();
    expect(data.tenantId).toBe("t1");
    expect(data.email).toBe("a@x.com"); // normalize
  });

  it("[7] token DB'de HASH saklanır (raw değil)", async () => {
    const { svc, userInvite, email } = make();
    await svc.issue(ACTOR, { email: "a@x.com", name: "Ad" });
    const raw = rawFromEmail(email);
    const data = userInvite.create.mock.calls[0][0].data;
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.tokenHash).toBe(hashInviteToken(raw));
    expect(data.tokenHash).not.toBe(raw);
    expect(JSON.stringify(data)).not.toContain(raw); // ham token create payload'ında YOK
  });

  it("[8] issue audit ham token İÇERMEZ + e-posta maskeli", async () => {
    const { svc, audit, email } = make();
    await svc.issue(ACTOR, { email: "ali@x.com", name: "Ad" });
    const raw = rawFromEmail(email);
    const call = audit.log.mock.calls.find((c: any) => c[0].action === "USER_INVITE_ISSUED")![0];
    expect(call.userId).toBe("admin1"); // truthful admin
    expect(JSON.stringify(call)).not.toContain(raw);
    expect(call.metadata.emailRedacted).toContain("***");
    expect(JSON.stringify(call)).not.toContain("ali@x.com"); // tam e-posta yok
  });

  it("[21] feature flag OFF iken issue çalışmaz", async () => {
    const { svc, user } = make({ enabled: false });
    await expect(svc.issue(ACTOR, { email: "a@x.com", name: "Ad" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(user.create).not.toHaveBeenCalled();
  });

  it("[23] default/random parola ÜRETİLMEZ (issue passwordHash=null, e-postada parola yok)", async () => {
    const { svc, user, email } = make();
    await svc.issue(ACTOR, { email: "a@x.com", name: "Ad" });
    expect(user.create.mock.calls[0][0].data.passwordHash).toBeNull();
    const sent = email.send.mock.calls[0][0];
    expect(sent.text.toLowerCase()).not.toMatch(/parola\s*[:=]\s*\S/); // maile parola konmaz (yalnız link)
  });

  // ---- accept ----
  const validInvite = () => ({
    id: "inv1", tenantId: "t1", userId: "u9", email: "a@x.com",
    tokenHash: "x", expiresAt: new Date(Date.now() + 3600_000),
    consumedAt: null, revokedAt: null,
    user: { id: "u9", tenantId: "t1", email: "a@x.com", isActive: false, passwordHash: null },
  });

  it("[10][11][12] accept geçerli token ile parola set eder, user aktifleşir, consumedAt set", async () => {
    const { svc, prisma, user, userInvite } = make();
    prisma.userInvite.findUnique.mockResolvedValue(validInvite());
    const r = await svc.accept("rawtoken", "newpassword123");
    expect(r).toMatchObject({ ok: true, userId: "u9" });
    const uData = user.update.mock.calls[0][0].data;
    expect(uData.isActive).toBe(true);
    expect(typeof uData.passwordHash).toBe("string");
    expect(uData.passwordHash).not.toBe("newpassword123"); // bcrypt, plaintext değil
    expect(userInvite.update.mock.calls[0][0].data.consumedAt).toBeInstanceOf(Date);
  });

  it("[9] accept audit parola/passwordHash İÇERMEZ + aktifleşen user truthful actor", async () => {
    const { svc, prisma, audit } = make();
    prisma.userInvite.findUnique.mockResolvedValue(validInvite());
    await svc.accept("rawtoken", "newpassword123");
    const call = audit.log.mock.calls.find((c: any) => c[0].action === "USER_INVITE_ACCEPTED")![0];
    expect(call.userId).toBe("u9"); // aktifleşen kullanıcı
    expect(JSON.stringify(call)).not.toContain("newpassword123");
    expect(JSON.stringify(call).toLowerCase()).not.toContain("passwordhash");
  });

  it("[13] tüketilmiş token tekrar kullanılamaz", async () => {
    const { svc, prisma } = make();
    prisma.userInvite.findUnique.mockResolvedValue({ ...validInvite(), consumedAt: new Date() });
    await expect(svc.accept("r", "newpassword123")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("[14] süresi dolmuş token reddedilir", async () => {
    const { svc, prisma } = make();
    prisma.userInvite.findUnique.mockResolvedValue({ ...validInvite(), expiresAt: new Date(Date.now() - 1000) });
    await expect(svc.accept("r", "newpassword123")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("[15] iptal edilmiş (revoked) token reddedilir", async () => {
    const { svc, prisma } = make();
    prisma.userInvite.findUnique.mockResolvedValue({ ...validInvite(), revokedAt: new Date() });
    await expect(svc.accept("r", "newpassword123")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("[16] yanlış e-posta/tenant binding reddedilir", async () => {
    const a = make();
    a.prisma.userInvite.findUnique.mockResolvedValue({ ...validInvite(), email: "other@x.com" });
    await expect(a.svc.accept("r", "newpassword123")).rejects.toBeInstanceOf(BadRequestException);
    const b = make();
    const inv = validInvite(); inv.user.tenantId = "t2";
    b.prisma.userInvite.findUnique.mockResolvedValue(inv);
    await expect(b.svc.accept("r", "newpassword123")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("[8b] bilinmeyen token reddedilir + tenant'sız AuditLog YAZILMAZ (NOT_FOUND)", async () => {
    const { svc, prisma, audit } = make();
    prisma.userInvite.findUnique.mockResolvedValue(null);
    await expect(svc.accept("badtoken", "newpassword123")).rejects.toBeInstanceOf(BadRequestException);
    // tenant bilinmiyor → tenant-scoped AuditLog'a 'unknown' tenant kaydı YAZILMAZ
    expect(audit.log).not.toHaveBeenCalled();
  });

  // ---- resend / revoke ----
  it("[17] resend yeni token üretir (eski tokenHash değişir) + tekrar e-posta", async () => {
    const { svc, prisma, userInvite, email } = make();
    prisma.userInvite.findFirst.mockResolvedValue({ id: "inv1", tenantId: "t1", userId: "u9", email: "a@x.com", consumedAt: null, user: { isActive: false } });
    await svc.resend(ACTOR, "inv1");
    const newRaw = rawFromEmail(email);
    const data = userInvite.update.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashInviteToken(newRaw));
    expect(data.revokedAt).toBeNull();
    expect(email.send).toHaveBeenCalled();
  });

  it("[18] revoke daveti kullanılamaz yapar (revokedAt set) + audit", async () => {
    const { svc, prisma, userInvite, audit } = make();
    prisma.userInvite.findFirst.mockResolvedValue({ id: "inv1", tenantId: "t1", userId: "u9", email: "a@x.com" });
    await svc.revoke(ACTOR, "inv1");
    expect(userInvite.update.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date);
    expect(audit.log.mock.calls.some((c: any) => c[0].action === "USER_INVITE_REVOKED")).toBe(true);
  });

  it("[21b] flag OFF iken resend çalışmaz", async () => {
    const { svc, userInvite } = make({ enabled: false });
    await expect(svc.resend(ACTOR, "inv1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(userInvite.update).not.toHaveBeenCalled();
  });

  it("[21c] flag OFF iken revoke çalışmaz", async () => {
    const { svc, userInvite } = make({ enabled: false });
    await expect(svc.revoke(ACTOR, "inv1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(userInvite.update).not.toHaveBeenCalled();
  });

  it("[25] accept K1 kimlik köprüsünü (lawyer/staff) BOZMAZ — yalnız passwordHash+isActive günceller", async () => {
    const { svc, prisma, user } = make();
    prisma.userInvite.findUnique.mockResolvedValue(validInvite());
    await svc.accept("rawtoken", "newpassword123");
    const data = user.update.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(["isActive", "passwordHash"]);
  });
});

describe("AdminGuard (K1-7) — [19][20]", () => {
  const ctx = (user: any): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;

  it("[20] ADMIN olmayan reddedilir", () => {
    const g = new AdminGuard();
    expect(() => g.canActivate(ctx({ id: "u1", role: "USER" }))).toThrow(ForbiddenException);
  });
  it("[19][20] ADMIN geçer", () => {
    const g = new AdminGuard();
    expect(g.canActivate(ctx({ id: "u1", role: "ADMIN" }))).toBe(true);
  });
});
