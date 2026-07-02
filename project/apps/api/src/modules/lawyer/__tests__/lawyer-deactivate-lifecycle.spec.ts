/**
 * L1A (owner-locked 2026-07-02) — Lawyer artık kalıcı kimlik: DELETE /lawyers/:id fiziksel
 * silme DEĞİL, isActive=false pasifleştirmedir. ClientService.remove() ile birebir desen:
 * capability-gate (PARTNER veya canApproveOfficeActions delege avukat) + audit-in-transaction.
 * CaseLawyer/PowerOfAttorney/Case.responsibleLawyer ilişkilerine DOKUNULMAZ.
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { LawyerService } from "../lawyer.service";

const TENANT = "t1";
const LAWYER_ID = "L1";

const EXISTING = {
  id: LAWYER_ID,
  name: "Ada",
  surname: "Lovelace",
  tckn: null,
  barNumber: "12345",
  lawyerRank: "LAWYER",
  isActive: true,
  tenantId: TENANT,
};

const build = (opts: { existing?: Record<string, unknown>; isEligible?: boolean } = {}) => {
  const existing = opts.existing ?? EXISTING;
  const prisma: any = {
    lawyer: {
      findFirst: jest.fn().mockResolvedValue(existing), // findOne(existing)
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn(), // hard-delete ÇAĞRILMAMALI
    },
    caseLawyer: {
      deleteMany: jest.fn(), // ÇAĞRILMAMALI (L1A: ilişkiler korunur)
    },
    $transaction: jest.fn().mockImplementation((fn: any) => fn(prisma)),
  };
  const audit: any = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const officeApproval: any = { isApproverEligible: jest.fn().mockResolvedValue(opts.isEligible ?? true) };
  return { svc: new LawyerService(prisma, audit, officeApproval), prisma, audit, officeApproval };
};

describe("L1A LawyerService.delete() — deactivate lifecycle", () => {
  it("eligible aktör (PARTNER/delege) → isActive:false ile updateMany çağrılır, hard delete ÇAĞRILMAZ", async () => {
    const { svc, prisma } = build();
    const result = await svc.delete(TENANT, LAWYER_ID, { userId: "u1" });

    expect(prisma.lawyer.updateMany).toHaveBeenCalledWith({
      where: { id: LAWYER_ID, tenantId: TENANT },
      data: { isActive: false },
    });
    expect(prisma.lawyer.delete).not.toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });

  it("CaseLawyer ilişkileri SİLİNMEZ (deleteMany hiç çağrılmaz)", async () => {
    const { svc, prisma } = build();
    await svc.delete(TENANT, LAWYER_ID, { userId: "u1" });
    expect(prisma.caseLawyer.deleteMany).not.toHaveBeenCalled();
  });

  it("POA/Case FK-çökme yolu ortadan kalkar: yalnız isActive update edilir, powerOfAttorney/case tablolarına DOKUNULMAZ", async () => {
    const { svc, prisma } = build();
    await svc.delete(TENANT, LAWYER_ID, { userId: "u1" });
    expect(prisma.powerOfAttorney).toBeUndefined(); // servis hiç erişmiyor
    expect(prisma.case).toBeUndefined();
  });

  it("yetkisiz kullanıcı (isApproverEligible=false) → 403, updateMany ÇAĞRILMAZ, audit YOK", async () => {
    const { svc, prisma, audit } = build({ isEligible: false });
    await expect(svc.delete(TENANT, LAWYER_ID, { userId: "u1" })).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.updateMany).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it("actor YOK (undefined) → 403", async () => {
    const { svc, prisma } = build();
    await expect(svc.delete(TENANT, LAWYER_ID, undefined)).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.updateMany).not.toHaveBeenCalled();
  });

  it("audit AynI transaction içinde actor ile yazılır (LAWYER_DEACTIVATE, entityType LAWYER)", async () => {
    const { svc, audit } = build();
    await svc.delete(TENANT, LAWYER_ID, { userId: "u1" });
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    const [, input] = audit.logInTransaction.mock.calls[0];
    expect(input).toMatchObject({
      tenantId: TENANT,
      action: "LAWYER_DEACTIVATE",
      entityType: "LAWYER",
      entityId: LAWYER_ID,
      userId: "u1",
    });
    expect(input.metadata.softDelete).toBe(true);
    expect(input.metadata.oldSnapshot.wasActive).toBe(true);
  });

  it("zaten pasif bir kayıt tekrar deactivate edilirse idempotent no-op görünümlü davranır (updateMany + audit yine çalışır, hata FIRLATILMAZ)", async () => {
    const { svc, prisma, audit } = build({ existing: { ...EXISTING, isActive: false } });
    const result = await svc.delete(TENANT, LAWYER_ID, { userId: "u1" });
    expect(prisma.lawyer.updateMany).toHaveBeenCalledTimes(1);
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    expect(audit.logInTransaction.mock.calls[0][1].metadata.oldSnapshot.wasActive).toBe(false);
    expect(result.isActive).toBe(false);
  });

  it("tenant-scoped: updateMany count=0 (farklı tenant/bulunamadı) → NotFoundException", async () => {
    const { svc, prisma } = build();
    prisma.lawyer.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.delete(TENANT, LAWYER_ID, { userId: "u1" })).rejects.toThrow(NotFoundException);
  });
});
