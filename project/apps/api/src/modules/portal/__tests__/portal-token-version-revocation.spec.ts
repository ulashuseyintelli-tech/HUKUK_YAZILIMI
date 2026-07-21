/**
 * CLIENT-P2-U02 — PortalService tokenVersion revocation trigger'ları (mocked-prisma unit).
 *
 * Doğrular: login JWT payload'ına DB'deki güncel tokenVersion claim'i eklenir; password
 * reset/change BAŞARI yolunda AYNI atomic write içinde tokenVersion artar, BAŞARISIZ yolda
 * artmaz; disable/reactivate kendi atomic write'larında artırır; yeni portal user şemanın
 * default(0) değerine güvenir (data'ya açıkça yazılmaz); increment DAİMA Prisma'nın atomic
 * `{increment:1}` operatörüyle ifade edilir (önceden hesaplanmış sayı DEĞİL — eşzamanlı
 * iki tetikleyici arasında kayıp increment olmaz).
 */
import { NotFoundException, UnauthorizedException, BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PortalService } from "../portal.service";

function buildTx(over: any = {}) {
  return {
    client: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(over.beforeClient ?? { id: "c1", hasPortalAccess: false, portalUserId: null }),
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
    },
    clientPortalUser: {
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: "NEWPU", ...a.data })),
    },
  };
}

function buildService(over: any = {}) {
  const tx = over.tx ?? buildTx(over);
  const prisma: any = {
    clientPortalUser: {
      findFirst: jest.fn().mockResolvedValue(over.findFirstResult ?? null),
      findUnique: jest.fn().mockResolvedValue(over.findUniqueResult ?? null),
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
      updateMany: jest.fn().mockResolvedValue(over.updateManyResult ?? { count: 0 }),
    },
    client: { findFirst: jest.fn().mockResolvedValue(over.clientFindFirstResult ?? null) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  const jwtService: any = { sign: jest.fn().mockReturnValue("SIGNED.JWT.TOKEN") };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const officeApproval: any = { isApproverEligible: jest.fn().mockResolvedValue(true) };
  const config: any = { get: jest.fn() };
  const emailProvider: any = { send: jest.fn() };
  const svc = new PortalService(prisma, jwtService, audit, officeApproval, config, emailProvider);
  return { svc, prisma, jwtService, audit, tx };
}

describe("PortalService — CLIENT-P2-U02 tokenVersion revocation trigger'ları", () => {
  it("[1] login: JWT payload'ına DB'deki güncel tokenVersion claim'i eklenir", async () => {
    const { svc, jwtService } = buildService({
      findFirstResult: {
        id: "PU1",
        email: "a@x.com",
        clientId: "C1",
        passwordHash: await bcrypt.hash("Sifre123", 10),
        tokenVersion: 7,
        client: { id: "C1", displayName: "Ali", tenantId: "T1", type: "PERSON" },
      },
    });

    await svc.login("a@x.com", "Sifre123");

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "PU1", clientId: "C1", tenantId: "T1", type: "portal", tokenVersion: 7 })
    );
  });

  it("[2] password reset BAŞARILI (count:1) → AYNI updateMany içinde tokenVersion:{increment:1}", async () => {
    const { svc, prisma } = buildService({ updateManyResult: { count: 1 } });
    await svc.resetPassword("raw-token", "YeniSifre123");
    const call = prisma.clientPortalUser.updateMany.mock.calls[0][0];
    expect(call.data.tokenVersion).toEqual({ increment: 1 });
  });

  it("[3] password reset BAŞARISIZ (count:0) → BadRequestException; tek atomik çağrı dışında EK yazım yok", async () => {
    const { svc, prisma } = buildService({ updateManyResult: { count: 0 } });
    await expect(svc.resetPassword("bad-token", "YeniSifre123")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clientPortalUser.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
    // Gerçek artmama garantisi (WHERE hiçbir satırla eşleşmedi) db-gated integration'da kanıtlanır.
  });

  it("[4] password change BAŞARILI → AYNI update içinde tokenVersion:{increment:1} + PORTAL_PASSWORD_CHANGED audit", async () => {
    const oldHash = await bcrypt.hash("EskiSifre123", 10);
    const { svc, prisma, audit } = buildService({
      findUniqueResult: { id: "PU1", passwordHash: oldHash, client: { tenantId: "T1" } },
    });

    const res = await svc.changePassword("PU1", "EskiSifre123", "YeniSifre456");
    expect(res).toEqual({ success: true });

    const call = prisma.clientPortalUser.update.mock.calls[0][0];
    expect(call.data.tokenVersion).toEqual({ increment: 1 });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "T1",
        action: "PORTAL_PASSWORD_CHANGED",
        entityType: "CLIENT_PORTAL_USER",
        entityId: "PU1",
      })
    );
  });

  it("[5] password change BAŞARISIZ (yanlış mevcut şifre) → update çağrılmaz, tokenVersion artmaz, audit yazılmaz", async () => {
    const oldHash = await bcrypt.hash("EskiSifre123", 10);
    const { svc, prisma, audit } = buildService({
      findUniqueResult: { id: "PU1", passwordHash: oldHash, client: { tenantId: "T1" } },
    });

    await expect(svc.changePassword("PU1", "YanlisSifre", "YeniSifre456")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("[5b] password change: kullanıcı bulunamadı → NotFoundException, update çağrılmaz", async () => {
    const { svc, prisma } = buildService({ findUniqueResult: null });
    await expect(svc.changePassword("YOK", "x", "y")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
  });

  it("[6] disable: isActive=false ile AYNI updateMany içinde tokenVersion:{increment:1}", async () => {
    const tx = buildTx({ beforeClient: { id: "c1", hasPortalAccess: true, portalUserId: "PU1" } });
    const { svc } = buildService({ clientFindFirstResult: { id: "c1", tenantId: "T1" }, tx });

    await svc.disablePortalUser("c1", "T1", { userId: "u-admin" });

    const call = tx.clientPortalUser.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({ isActive: false, tokenVersion: { increment: 1 } });
  });

  it("[7] reactivate: isActive=true + yeni şifre ile AYNI update içinde tokenVersion:{increment:1} (eski JWT dirilmez)", async () => {
    const tx = buildTx();
    const { svc } = buildService({
      clientFindFirstResult: { id: "c1", tenantId: "T1" },
      findUniqueResult: { id: "PU1", isActive: false, email: "old@x.com" },
      tx,
    });

    const res: any = await svc.createPortalUser("c1", "new@x.com", "YeniSifre123", "T1", { userId: "u-admin" });
    expect(res._reactivated).toBe(true);

    const call = tx.clientPortalUser.update.mock.calls[0][0];
    expect(call.data.isActive).toBe(true);
    expect(call.data.tokenVersion).toEqual({ increment: 1 });
    expect(await bcrypt.compare("YeniSifre123", call.data.passwordHash)).toBe(true);
  });

  it("[8] yeni portal user create: tokenVersion data'ya AÇIKÇA yazılmaz (schema default(0)'a güvenilir)", async () => {
    const tx = buildTx();
    const { svc } = buildService({
      clientFindFirstResult: { id: "c1", tenantId: "T1" },
      findUniqueResult: null,
      tx,
    });

    await svc.createPortalUser("c1", "fresh@x.com", "Sifre123", "T1", { userId: "u-admin" });

    expect(tx.clientPortalUser.create).toHaveBeenCalledTimes(1);
    const call = tx.clientPortalUser.create.mock.calls[0][0];
    expect(call.data).not.toHaveProperty("tokenVersion");
  });

  it("[9] increment DAİMA Prisma atomic operatörüyle ifade edilir — mevcut versiyondan bağımsız, önceden hesaplanmış sayı DEĞİL", async () => {
    const oldHash = await bcrypt.hash("EskiSifre123", 10);
    const { svc, prisma } = buildService({
      findUniqueResult: { id: "PU1", passwordHash: oldHash, tokenVersion: 4, client: { tenantId: "T1" } },
    });

    await svc.changePassword("PU1", "EskiSifre123", "YeniSifre456");

    const call = prisma.clientPortalUser.update.mock.calls[0][0];
    expect(call.data.tokenVersion).toEqual({ increment: 1 });
    expect(call.data.tokenVersion).not.toBe(5);
  });
});
