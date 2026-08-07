// K1-7: UserInviteService + AdminGuard testleri (mock prisma/audit/email/config).
import { BadRequestException, ConflictException, ForbiddenException, ExecutionContext } from "@nestjs/common";
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
    // W5-INVITE-LIFECYCLE-I01: orphan pending User devralma yolu (koşullu updateMany).
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const userInvite = {
    create: jest.fn().mockResolvedValue({ id: "inv1" }),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  };
  // OWN-01: varsayılan olarak hiçbir profil bulunamaz/bağlanmaz (updateMany count:0) — lawyerId/
  // staffMemberId vermeyen mevcut testler davranışsal olarak etkilenmez (regression-safe default).
  const lawyer = {
    findFirst: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const staffMember = {
    findFirst: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const tx = { user, userInvite, lawyer, staffMember };
  const prisma = { user, userInvite, lawyer, staffMember, $transaction: jest.fn(async (cb: any) => cb(tx)) } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const email = { send: jest.fn().mockResolvedValue({ success: true }) } as any;
  const config = {
    get: jest.fn((k: string) =>
      k === "LOGIN_INVITE_PROVISIONING_ENABLED" ? (enabled ? "true" : "false") : undefined,
    ),
  } as any;
  return {
    svc: new UserInviteService(prisma, audit, email, config),
    prisma, audit, email, user, userInvite, lawyer, staffMember,
  };
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

  // ---- AUTH-01: tenant-scoped email-uniqueness (önceki global "H3" davranışı SUPERSEDED) ----
  it("[AUTH-01] issue email'i TENANT-SCOPED kontrol eder: findFirst({email, tenantId}) — actor.tenantId FİLTRESİ VAR", async () => {
    const { svc, user } = make();
    await svc.issue(ACTOR, { email: "a@x.com", name: "Ad" });
    expect(user.findFirst).toHaveBeenCalledWith({ where: { email: "a@x.com", tenantId: ACTOR.tenantId } });
  });

  it("[AUTH-01] email BAŞKA tenant'ta zaten var → ARTIK ENGELLENMEZ (tenant-scoped sorgu bulmaz, invite devam eder)", async () => {
    const { svc, user, userInvite } = make();
    // findFirst({email, tenantId: ACTOR.tenantId}) başka tenant'taki kullanıcıyı hiç görmez → null döner (mock varsayılanı).
    await svc.issue(ACTOR, { email: "a@x.com", name: "Ad" });
    expect(user.create).toHaveBeenCalled();
    expect(userInvite.create).toHaveBeenCalled();
  });

  it("[AUTH-01] email AYNI tenant'ta zaten var → 409 (davranış korunur — tenant-scoped kontrol bunu hâlâ yakalar)", async () => {
    const { svc, user } = make();
    user.findFirst.mockResolvedValueOnce({ id: "u-self", email: "a@x.com", tenantId: "t1" });
    await expect(svc.issue(ACTOR, { email: "a@x.com", name: "Ad" })).rejects.toThrow(ConflictException);
    expect(user.create).not.toHaveBeenCalled();
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

  // ---- OWN-01: invite → Lawyer/StaffMember deterministik bağlama ----
  it("[OWN-01] issue lawyerId ile verilirse Lawyer.userId race-safe updateMany ile bağlanır + audit'e işlenir", async () => {
    const { svc, lawyer, audit } = make();
    lawyer.findFirst.mockResolvedValueOnce({ id: "law1", userId: null });
    lawyer.updateMany.mockResolvedValueOnce({ count: 1 });
    await svc.issue(ACTOR, { email: "a@x.com", name: "Ad", lawyerId: "law1" });
    expect(lawyer.updateMany).toHaveBeenCalledWith({
      where: { id: "law1", tenantId: "t1", userId: null },
      data: { userId: "u9" },
    });
    const call = audit.log.mock.calls.find((c: any) => c[0].action === "USER_INVITE_ISSUED")![0];
    expect(call.metadata.linkedLawyerId).toBe("law1");
  });

  it("[OWN-01] issue staffMemberId ile verilirse StaffMember.userId bağlanır", async () => {
    const { svc, staffMember, audit } = make();
    staffMember.findFirst.mockResolvedValueOnce({ id: "staff1", userId: null });
    staffMember.updateMany.mockResolvedValueOnce({ count: 1 });
    await svc.issue(ACTOR, { email: "a@x.com", name: "Ad", staffMemberId: "staff1" });
    expect(staffMember.updateMany).toHaveBeenCalledWith({
      where: { id: "staff1", tenantId: "t1", userId: null },
      data: { userId: "u9" },
    });
    const call = audit.log.mock.calls.find((c: any) => c[0].action === "USER_INVITE_ISSUED")![0];
    expect(call.metadata.linkedStaffMemberId).toBe("staff1");
  });

  it("[OWN-01] issue lawyerId VE staffMemberId birlikte verilirse BadRequest, transaction hiç başlamaz", async () => {
    const { svc, prisma } = make();
    await expect(
      svc.issue(ACTOR, { email: "a@x.com", name: "Ad", lawyerId: "law1", staffMemberId: "staff1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("[OWN-01] issue lawyerId bulunamazsa/tenant dışıysa BadRequest, user oluşturulmaz", async () => {
    const { svc, user, lawyer } = make();
    lawyer.findFirst.mockResolvedValueOnce(null);
    await expect(svc.issue(ACTOR, { email: "a@x.com", name: "Ad", lawyerId: "law-yok" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(user.create).not.toHaveBeenCalled();
  });

  it("[OWN-01] issue lawyerId zaten bağlıysa Conflict, user oluşturulmaz (dual-ownership guard)", async () => {
    const { svc, user, lawyer } = make();
    lawyer.findFirst.mockResolvedValueOnce({ id: "law1", userId: "already-linked-user" });
    await expect(svc.issue(ACTOR, { email: "a@x.com", name: "Ad", lawyerId: "law1" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(user.create).not.toHaveBeenCalled();
  });

  it("[OWN-01] issue eşzamanlı yarış kaybederse (findFirst null gördü, updateMany count 0) Conflict", async () => {
    const { svc, lawyer } = make();
    lawyer.findFirst.mockResolvedValueOnce({ id: "law1", userId: null });
    lawyer.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.issue(ACTOR, { email: "a@x.com", name: "Ad", lawyerId: "law1" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("[OWN-01] issue lawyerId/staffMemberId hiç verilmezse davranış değişmez (regression)", async () => {
    const { svc, lawyer, staffMember, user } = make();
    await svc.issue(ACTOR, { email: "a@x.com", name: "Ad" });
    expect(lawyer.findFirst).not.toHaveBeenCalled();
    expect(lawyer.updateMany).not.toHaveBeenCalled();
    expect(staffMember.findFirst).not.toHaveBeenCalled();
    expect(staffMember.updateMany).not.toHaveBeenCalled();
    expect(user.create).toHaveBeenCalled();
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

  it("[OWN-01] revoke bağlı Lawyer'ı unlink eder (userId→null) + audit'e unlinkedLawyer eklenir", async () => {
    const { svc, prisma, lawyer, audit } = make();
    prisma.userInvite.findFirst.mockResolvedValue({ id: "inv1", tenantId: "t1", userId: "u9", email: "a@x.com" });
    lawyer.updateMany.mockResolvedValueOnce({ count: 1 });
    await svc.revoke(ACTOR, "inv1");
    expect(lawyer.updateMany).toHaveBeenCalledWith({ where: { userId: "u9", tenantId: "t1" }, data: { userId: null } });
    const call = audit.log.mock.calls.find((c: any) => c[0].action === "USER_INVITE_REVOKED")![0];
    expect(call.metadata.unlinkedLawyer).toBe(true);
  });

  it("[OWN-01] revoke bağlı StaffMember'ı unlink eder + audit'e unlinkedStaffMember eklenir", async () => {
    const { svc, prisma, staffMember, audit } = make();
    prisma.userInvite.findFirst.mockResolvedValue({ id: "inv1", tenantId: "t1", userId: "u9", email: "a@x.com" });
    staffMember.updateMany.mockResolvedValueOnce({ count: 1 });
    await svc.revoke(ACTOR, "inv1");
    const call = audit.log.mock.calls.find((c: any) => c[0].action === "USER_INVITE_REVOKED")![0];
    expect(call.metadata.unlinkedStaffMember).toBe(true);
  });

  it("[OWN-01] revoke hiçbir profile bağlı değilse unlink metadata YOK (regression)", async () => {
    const { svc, prisma, audit } = make();
    prisma.userInvite.findFirst.mockResolvedValue({ id: "inv1", tenantId: "t1", userId: "u9", email: "a@x.com" });
    await svc.revoke(ACTOR, "inv1");
    const call = audit.log.mock.calls.find((c: any) => c[0].action === "USER_INVITE_REVOKED")![0];
    expect(call.metadata.unlinkedLawyer).toBeUndefined();
    expect(call.metadata.unlinkedStaffMember).toBeUndefined();
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

// ==========================================================================================
// W5-INVITE-LIFECYCLE-I01 — revoke/resend yaşam döngüsü sözleşmesi
//
// Kanıtlanan defekt (2026-08-07 canary'sinde gözlendi): revoke() OWN-01 gereği profil bağını
// çözer; resend() ise daveti (revokedAt=null ile) DİRİLTİR fakat bağı geri kuramaz →
// kullanıcı daveti kabul eder, hesap aktifleşir, profil-türevi yetki SESSİZCE kaybolur.
// Sözleşme: revoke güvenli+audit'li kalır · resend sonrası bağ HER ZAMAN geçerli ·
// silent eligibility loss YOK · tenant/user değişmez · duplicate/replay/cross-tenant RED.
// ==========================================================================================
describe("W5-INVITE-LIFECYCLE-I01 — revoke/resend/issue yaşam döngüsü", () => {
  const pendingUser = (over: any = {}) => ({
    id: "u9", email: "a@x.com", tenantId: "t1", isActive: false, passwordHash: null, ...over,
  });
  /** Adoption değerlendirmesinin okuduğu davet listesi (userInvite.findMany). */
  const invitesOf = (rows: any[]) => rows;

  it("[W5-1] revoke edilmiş davet RESEND EDİLEMEZ (fail-closed; sessiz yetki kaybı önlenir)", async () => {
    const { svc, userInvite, email } = make();
    userInvite.findFirst.mockResolvedValue({
      id: "inv1", tenantId: "t1", userId: "u9", email: "a@x.com",
      consumedAt: null, revokedAt: new Date(), user: { isActive: false },
    });
    await expect(svc.resend(ACTOR, "inv1")).rejects.toBeInstanceOf(ConflictException);
    expect(userInvite.update).not.toHaveBeenCalled(); // token diriltilmedi
    expect(email.send).not.toHaveBeenCalled();        // e-posta gönderilmedi
  });

  it("[W5-2] revoke EDİLMEMİŞ davet hâlâ resend edilebilir (regresyon yok)", async () => {
    const { svc, userInvite, email } = make();
    userInvite.findFirst.mockResolvedValue({
      id: "inv1", tenantId: "t1", userId: "u9", email: "a@x.com",
      consumedAt: null, revokedAt: null, user: { isActive: false },
    });
    await svc.resend(ACTOR, "inv1");
    expect(userInvite.update).toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it("[W5-3] issue(): orphan pending User DEVRALINIR — yeni User açılmaz, profil YENİDEN bağlanır", async () => {
    const { svc, user, lawyer, userInvite, audit } = make();
    user.findFirst.mockResolvedValue(pendingUser());
    userInvite.findMany.mockResolvedValue(invitesOf([{ id: "inv1", consumedAt: null, revokedAt: new Date() }]));
    user.updateMany.mockResolvedValue({ count: 1 });
    lawyer.findFirst.mockResolvedValue({ id: "lw1", userId: null });
    lawyer.updateMany.mockResolvedValue({ count: 1 });

    const res = await svc.issue(ACTOR, { email: "a@x.com", name: "Ad", lawyerId: "lw1" } as any);

    expect(user.create).not.toHaveBeenCalled();                       // duplicate User YOK
    expect(user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "u9", tenantId: "t1", isActive: false, passwordHash: null }) }),
    );
    expect(lawyer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "lw1", tenantId: "t1", userId: null }), data: { userId: "u9" } }),
    );
    expect(userInvite.create).toHaveBeenCalled();                     // taze token
    expect(res.userId).toBe("u9");                                    // AYNI user
    expect(audit.log.mock.calls.at(-1)[0].metadata.adoptedPendingUser).toBe(true);
  });

  it("[W5-4] AKTİF hesap devralınamaz (Conflict) — hesap ele geçirme yolu kapalı", async () => {
    const { svc, user, userInvite } = make();
    user.findFirst.mockResolvedValue(pendingUser({ isActive: true }));
    userInvite.findMany.mockResolvedValue(invitesOf([{ id: "inv1", consumedAt: null, revokedAt: new Date() }]));
    await expect(svc.issue(ACTOR, { email: "a@x.com", name: "Ad" } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(user.create).not.toHaveBeenCalled();
  });

  it("[W5-5] parolası olan (accept edilmiş) hesap devralınamaz", async () => {
    const { svc, user, userInvite } = make();
    user.findFirst.mockResolvedValue(pendingUser({ passwordHash: "x" }));
    userInvite.findMany.mockResolvedValue(invitesOf([{ id: "inv1", consumedAt: null, revokedAt: new Date() }]));
    await expect(svc.issue(ACTOR, { email: "a@x.com", name: "Ad" } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it("[W5-6] consume edilmiş daveti olan pending kayıt devralınamaz (replay koruması)", async () => {
    const { svc, user, userInvite } = make();
    user.findFirst.mockResolvedValue(pendingUser());
    userInvite.findMany.mockResolvedValue(invitesOf([{ id: "inv1", consumedAt: new Date(), revokedAt: null }]));
    await expect(svc.issue(ACTOR, { email: "a@x.com", name: "Ad" } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it("[W5-7] revoked daveti OLMAYAN pending kayıt devralınamaz (yalnız orphan senaryosu)", async () => {
    const { svc, user, userInvite } = make();
    user.findFirst.mockResolvedValue(pendingUser());
    userInvite.findMany.mockResolvedValue(invitesOf([{ id: "inv1", consumedAt: null, revokedAt: null }]));
    await expect(svc.issue(ACTOR, { email: "a@x.com", name: "Ad" } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it("[W5-8] adoption yarışı: hesap arada aktifleşirse fail-closed (count=0 → Conflict)", async () => {
    const { svc, user, userInvite } = make();
    user.findFirst.mockResolvedValue(pendingUser());
    userInvite.findMany.mockResolvedValue(invitesOf([{ id: "inv1", consumedAt: null, revokedAt: new Date() }]));
    user.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.issue(ACTOR, { email: "a@x.com", name: "Ad" } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it("[W5-9] cross-tenant: sorgu tenant-scoped; devralma başka tenant kaydını GÖREMEZ", async () => {
    const { svc, user, prisma } = make();
    user.findFirst.mockResolvedValue(null);   // farklı tenant → bulunamaz
    await svc.issue(ACTOR, { email: "a@x.com", name: "Ad" } as any);
    expect(user.findFirst.mock.calls[0][0].where).toEqual(expect.objectContaining({ tenantId: "t1" }));
    expect(user.create).toHaveBeenCalled();   // normal yol: yeni pending User
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
