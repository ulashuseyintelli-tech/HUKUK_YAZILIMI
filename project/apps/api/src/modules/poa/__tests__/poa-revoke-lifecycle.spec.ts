/**
 * P1A (owner-locked 2026-07-02) — Vekaletname kalıcı hukuki yetki kaydı: DELETE /poa/:id fiziksel
 * silme DEĞİL, status=REVOKED + isActive=false iptalidir. ClientService.remove() / LawyerService.
 * delete() ile birebir desen: capability-gate (PARTNER veya delege avukat) + audit-in-transaction.
 * PoaLawyer/PoaExpiryNotificationDelivery ilişkilerine DOKUNULMAZ. checkValidPoa()/
 * checkValidPoaForLawyers() revoke sonrası aynı iki alanı okuduğu için otomatik geçersiz sayar.
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PoaService } from "../poa.service";
import { PoaStatus } from "@prisma/client";

const TENANT = "t1";
const POA_ID = "poa1";

const EXISTING = {
  id: POA_ID,
  clientId: "cli1",
  notaryName: "Ada Lovelace",
  status: PoaStatus.ACTIVE,
  isActive: true,
  isLimited: false,
  validUntil: null,
  tenantId: TENANT,
};

const build = (opts: { existing?: Record<string, unknown>; isEligible?: boolean } = {}) => {
  const existing = opts.existing ?? EXISTING;
  const prisma: any = {
    clientPowerOfAttorney: {
      findFirst: jest.fn().mockResolvedValue(existing), // findOne(existing)
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn(), // hard-delete ÇAĞRILMAMALI
    },
    poaLawyer: {
      deleteMany: jest.fn(), // ÇAĞRILMAMALI (P1A: ilişkiler korunur)
    },
    poaExpiryNotificationDelivery: {
      deleteMany: jest.fn(), // ÇAĞRILMAMALI (P1A: bildirim geçmişi korunur)
    },
    $transaction: jest.fn().mockImplementation((fn: any) => fn(prisma)),
  };
  const audit: any = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const officeApproval: any = { isApproverEligible: jest.fn().mockResolvedValue(opts.isEligible ?? true) };
  return { svc: new PoaService(prisma, audit, officeApproval), prisma, audit, officeApproval };
};

describe("P1A PoaService.delete() — revoke lifecycle", () => {
  it("eligible aktör → status=REVOKED + isActive=false ile updateMany çağrılır, hard delete ÇAĞRILMAZ", async () => {
    const { svc, prisma } = build();
    await svc.delete(POA_ID, TENANT, { userId: "u1" });

    expect(prisma.clientPowerOfAttorney.updateMany).toHaveBeenCalledWith({
      where: { id: POA_ID, client: { tenantId: TENANT } },
      data: { status: PoaStatus.REVOKED, isActive: false },
    });
    expect(prisma.clientPowerOfAttorney.delete).not.toHaveBeenCalled();
  });

  it("PoaLawyer ilişkileri SİLİNMEZ (deleteMany hiç çağrılmaz)", async () => {
    const { svc, prisma } = build();
    await svc.delete(POA_ID, TENANT, { userId: "u1" });
    expect(prisma.poaLawyer.deleteMany).not.toHaveBeenCalled();
  });

  it("PoaExpiryNotificationDelivery geçmişi SİLİNMEZ (deleteMany hiç çağrılmaz)", async () => {
    const { svc, prisma } = build();
    await svc.delete(POA_ID, TENANT, { userId: "u1" });
    expect(prisma.poaExpiryNotificationDelivery.deleteMany).not.toHaveBeenCalled();
  });

  it("yetkisiz kullanıcı (isApproverEligible=false) → 403, updateMany ÇAĞRILMAZ, audit YOK", async () => {
    const { svc, prisma, audit } = build({ isEligible: false });
    await expect(svc.delete(POA_ID, TENANT, { userId: "u1" })).rejects.toThrow(ForbiddenException);
    expect(prisma.clientPowerOfAttorney.updateMany).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it("actor YOK (undefined) → 403", async () => {
    const { svc, prisma } = build();
    await expect(svc.delete(POA_ID, TENANT, undefined)).rejects.toThrow(ForbiddenException);
    expect(prisma.clientPowerOfAttorney.updateMany).not.toHaveBeenCalled();
  });

  it("audit AYNI transaction içinde actor + tam old snapshot ile yazılır (POA_REVOKE, entityType POA)", async () => {
    const { svc, audit } = build();
    await svc.delete(POA_ID, TENANT, { userId: "u1" });
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    const [, input] = audit.logInTransaction.mock.calls[0];
    expect(input).toMatchObject({
      tenantId: TENANT,
      action: "POA_REVOKE",
      entityType: "POA",
      entityId: POA_ID,
      userId: "u1",
      oldValues: EXISTING,
      newValues: { status: PoaStatus.REVOKED, isActive: false },
    });
  });

  it("zaten REVOKED/inaktif bir kayıt tekrar iptal edilirse idempotent davranır (updateMany + audit yine çalışır, hata FIRLATILMAZ)", async () => {
    const revoked = { ...EXISTING, status: PoaStatus.REVOKED, isActive: false };
    const { svc, prisma, audit } = build({ existing: revoked });
    const result = await svc.delete(POA_ID, TENANT, { userId: "u1" });
    expect(prisma.clientPowerOfAttorney.updateMany).toHaveBeenCalledTimes(1);
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    expect(audit.logInTransaction.mock.calls[0][1].oldValues).toEqual(revoked);
    expect(result).toEqual({ success: true });
  });

  it("tenant-scoped: updateMany count=0 (farklı tenant/bulunamadı) → NotFoundException", async () => {
    const { svc, prisma } = build();
    prisma.clientPowerOfAttorney.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.delete(POA_ID, TENANT, { userId: "u1" })).rejects.toThrow(NotFoundException);
  });
});

/**
 * Fake-store testleri: delete() + checkValidPoa()/checkValidPoaForLawyers() AYNI mock prisma
 * üzerinde, gerçek where-filtre semantiğini (status/isActive/lawyers.some) taklit ederek
 * çalıştırılır. Bu, "revoke sonrası checkValidPoa geçersiz döner" iddiasını uçtan uca kanıtlar
 * (gerçek DB'ye gerek kalmadan).
 */
describe("P1A — revoke sonrası checkValidPoa()/checkValidPoaForLawyers() geçersiz sayar", () => {
  const buildFakeStore = () => {
    const row: any = {
      id: POA_ID,
      clientId: "cli1",
      tenantId: TENANT,
      status: PoaStatus.ACTIVE,
      isActive: true,
      isLimited: false,
      validUntil: null,
      lawyers: [{ lawyerId: "law1" }],
    };

    const matchesWhere = (where: any): boolean => {
      if (where.id && where.id !== row.id) return false;
      if (where.clientId && where.clientId !== row.clientId) return false;
      if (where.client?.tenantId && where.client.tenantId !== row.tenantId) return false;
      if (where.status && where.status !== row.status) return false;
      if (where.isActive !== undefined && where.isActive !== row.isActive) return false;
      if (where.lawyers?.some?.lawyerId) {
        const want = where.lawyers.some.lawyerId;
        const ids = row.lawyers.map((l: any) => l.lawyerId);
        const ok = typeof want === "string" ? ids.includes(want) : ids.some((id: string) => want.in.includes(id));
        if (!ok) return false;
      }
      if (where.OR) {
        const orOk = where.OR.some((cond: any) =>
          cond.isLimited === false ? row.isLimited === false : row.isLimited === true,
        );
        if (!orOk) return false;
      }
      return true;
    };

    const prisma: any = {
      clientPowerOfAttorney: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(matchesWhere(where) ? { ...row } : null)),
        updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
          if (!matchesWhere({ id: where.id, client: where.client })) return Promise.resolve({ count: 0 });
          Object.assign(row, data);
          return Promise.resolve({ count: 1 });
        }),
        delete: jest.fn(),
      },
      poaLawyer: { deleteMany: jest.fn() },
      poaExpiryNotificationDelivery: { deleteMany: jest.fn() },
      $transaction: jest.fn().mockImplementation((fn: any) => fn(prisma)),
    };
    const audit: any = { logInTransaction: jest.fn().mockResolvedValue(undefined) };
    const officeApproval: any = { isApproverEligible: jest.fn().mockResolvedValue(true) };
    return { svc: new PoaService(prisma, audit, officeApproval) };
  };

  it("revoke ÖNCESİ checkValidPoa geçerli döner", async () => {
    const { svc } = buildFakeStore();
    const res = await svc.checkValidPoa("cli1", "law1", TENANT);
    expect(res.isValid).toBe(true);
  });

  it("delete() (revoke) SONRASI checkValidPoa artık geçersiz döner", async () => {
    const { svc } = buildFakeStore();
    await svc.delete(POA_ID, TENANT, { userId: "u1" });
    const res = await svc.checkValidPoa("cli1", "law1", TENANT);
    expect(res.isValid).toBe(false);
    expect(res.message).toBe("Geçerli vekalet bulunamadı");
  });

  it("delete() (revoke) SONRASI checkValidPoaForLawyers artık geçersiz döner", async () => {
    const { svc } = buildFakeStore();
    await svc.delete(POA_ID, TENANT, { userId: "u1" });
    const res = await svc.checkValidPoaForLawyers("cli1", ["law1"], TENANT);
    expect(res.isValid).toBe(false);
  });
});
