/**
 * CLIENT-PSUS (owner kararı 2026-09-19) — tenant askıdayken (ACTIVE dışı her yaşam döngüsü) portal erişimi KAPALI.
 *
 *  - PortalAuthGuard: tenant ACTIVE değilse önceden üretilmiş geçerli token bir SONRAKİ istekte reddedilir; mesaj
 *    diğer nedenlerle AYNI ("Geçersiz token"); lifecycle okunamazsa fail-closed. Guard DB'ye YAZMAZ.
 *  - login: ACTIVE olmayan tenant → yanlış-parola dalıyla BİREBİR AYNI mesaj; bcrypt karşılaştırması YİNE çağrılır (kod
 *    sırası — zamanlama eşitliği bu testlerle ÖLÇÜLMEZ); lastLoginAt/loginCount YAZILMAZ; token ÜRETİLMEZ.
 *  - şifre sıfırlama talebi: token üretilmez, e-posta gönderilmez; dış cevap bilinmeyen kullanıcıyla aynı.
 *  - askıdan ÖNCE üretilmiş sıfırlama token'ı: kullanılamaz (atomik WHERE'de tenant ACTIVE), token tüketilmez, parola
 *    değişmez; cevap geçersiz token ile aynı. NOT: bu birim testleri CEVAP EŞİTLİĞİNİ ölçer, ZAMANLAMA eşitliğini ÖLÇMEZ.
 *  - Yeniden etkinleştirme: kontrol TENANT düzeyindedir, ClientPortalUser'a dokunmaz → tenant ACTIVE'e dönünce
 *    AYRICA kapatılmış (isActive=false) portal kullanıcısı KENDİLİĞİNDEN AÇILMAZ.
 */
import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PortalAuthGuard } from "../portal-auth.guard";
import { PortalService } from "../portal.service";

const NON_ACTIVE = ["SUSPENDED", "QUIESCING", "RETIRED", "PROVISIONING"];
const ctx = () => { const request: any = { headers: { authorization: "Bearer tok" } }; return { request, c: { switchToHttp: () => ({ getRequest: () => request }) } as any }; };
const payload = { sub: "PU1", clientId: "C1", tenantId: "T1", type: "portal", tokenVersion: 0 };
const row = (lifecycle: unknown, isActive = true) => ({ id: "PU1", clientId: "C1", isActive, tokenVersion: 0, client: { tenantId: "T1", tenant: lifecycle === undefined ? undefined : { lifecycle } } });
function guardWith(r: any) {
  const prisma: any = { clientPortalUser: { findUnique: jest.fn().mockResolvedValue(r), update: jest.fn(), updateMany: jest.fn() } };
  return { guard: new PortalAuthGuard({ verifyAsync: jest.fn().mockResolvedValue(payload) } as any, prisma), prisma };
}

describe("CLIENT-PSUS — askıdaki tenant'ta portal erişimi kapalı", () => {
  describe("PortalAuthGuard (mevcut oturum → bir sonraki istek)", () => {
    it("ACTIVE tenant → izin", async () => {
      const { guard } = guardWith(row("ACTIVE"));
      const { c, request } = ctx();
      await expect(guard.canActivate(c)).resolves.toBe(true);
      expect(request.portalUser.clientId).toBe("C1");
    });
    it.each(NON_ACTIVE)("%s tenant → 401 'Geçersiz token' (diğer nedenlerle AYNI mesaj), DB'ye yazma YOK", async (lc) => {
      const { guard, prisma } = guardWith(row(lc));
      const err = await guard.canActivate(ctx().c).catch((e) => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.message).toBe("Geçersiz token");
      expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
      expect(prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    });
    it.each([[undefined], ["BILINMEYEN"], [null]])("lifecycle okunamaz/bilinmez (%p) → fail-closed 401", async (lc) => {
      const { guard } = guardWith(row(lc as any));
      await expect(guard.canActivate(ctx().c)).rejects.toThrow("Geçersiz token");
    });
    it("devre dışı kullanıcı ile askıdaki tenant ret mesajları AYIRT EDİLEMEZ", async () => {
      const a = await guardWith(row("ACTIVE", false)).guard.canActivate(ctx().c).catch((e) => e.message);
      const b = await guardWith(row("SUSPENDED", true)).guard.canActivate(ctx().c).catch((e) => e.message);
      expect(a).toBe(b);
    });
    it("yeniden etkinleştirme: tenant ACTIVE'e döner ama AYRICA kapatılmış kullanıcı açılmaz (guard kullanıcıya yazmaz)", async () => {
      await expect(guardWith(row("ACTIVE", false)).guard.canActivate(ctx().c)).rejects.toThrow("Geçersiz token");
    });
  });

  describe("login", () => {
    async function svcWith(lifecycle: string) {
      const passwordHash = await bcrypt.hash("Sifre123", 4);
      const prisma: any = { clientPortalUser: { findFirst: jest.fn().mockResolvedValue({ id: "PU1", email: "a@x.com", clientId: "C1", passwordHash, tokenVersion: 0,
        client: { id: "C1", displayName: "A", tenantId: "T1", type: "PERSON", tenant: { lifecycle } } }), update: jest.fn() } };
      const jwt: any = { sign: jest.fn().mockReturnValue("jwt") };
      return { svc: new PortalService(prisma, jwt, {} as any, {} as any, {} as any, {} as any), prisma, jwt };
    }
    it("ACTIVE tenant → token", async () => {
      const { svc, jwt } = await svcWith("ACTIVE");
      await expect(svc.login("a@x.com", "Sifre123")).resolves.toMatchObject({ token: "jwt" });
      expect(jwt.sign).toHaveBeenCalledTimes(1);
    });
    it.each(NON_ACTIVE)("%s tenant + DOĞRU parola → yanlış parolayla AYNI 401; giriş kaydı/token YOK", async (lc) => {
      const { svc, prisma, jwt } = await svcWith(lc);
      const spy = jest.spyOn(bcrypt, "compare");
      const ok = await svc.login("a@x.com", "Sifre123").catch((e) => e.message);
      const wrong = await (await svcWith("ACTIVE")).svc.login("a@x.com", "YANLIS").catch((e) => e.message);
      expect(ok).toBe(wrong);
      expect(spy).toHaveBeenCalled();                      // bcrypt yolu yine çağrılır (kod sırası; süre ÖLÇÜLMEZ)
      expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
      expect(jwt.sign).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("askıdan ÖNCE üretilmiş sıfırlama token'ının KULLANIMI", () => {
    it("atomik updateMany WHERE'i tenant ACTIVE yüklemini içerir (ayrı ön-okuma YOK)", async () => {
      const prisma: any = { clientPortalUser: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn() } };
      const svc = new PortalService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
      await svc.resetPassword("raw", "YeniSifre123");
      expect(prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
      expect(prisma.clientPortalUser.updateMany.mock.calls[0][0].where.client).toEqual({ tenant: { lifecycle: "ACTIVE" } });
    });
    it("askıdaki tenant (eşleşme 0) → geçersiz/süresi dolmuş token ile AYNI 400; parola/token yazılmaz", async () => {
      const prisma: any = { clientPortalUser: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
      const svc = new PortalService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
      const suspended = await svc.resetPassword("raw", "YeniSifre123").catch((e) => e.message);
      const invalid = await svc.resetPassword("baska", "YeniSifre123").catch((e) => e.message);
      expect(suspended).toBe("Geçersiz veya süresi dolmuş token");
      expect(suspended).toBe(invalid);
    });
  });

  describe("şifre sıfırlama talebi", () => {
    it.each(NON_ACTIVE)("%s tenant → {success:true}, token ÜRETİLMEZ, e-posta GÖNDERİLMEZ", async (lc) => {
      const prisma: any = { clientPortalUser: { findFirst: jest.fn().mockResolvedValue({ id: "PU1", email: "a@x.com", client: { tenant: { lifecycle: lc } } }), update: jest.fn() } };
      const email: any = { send: jest.fn() };
      const svc = new PortalService(prisma, {} as any, {} as any, {} as any, { get: () => "https://x" } as any, email);
      await expect(svc.createResetToken("a@x.com")).resolves.toEqual({ success: true });
      expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });
  });
});
