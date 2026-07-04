/**
 * K1-4b — Office Approval Delegation Flag (Lawyer.canApproveOfficeActions backend write-path).
 * KESİN: yalnız ADMIN VEYA linkli PARTNER avukat değiştirebilir; non-PARTNER/linksiz/cross-tenant/no-actor → 403 (yazılmaz).
 *   delegation DEĞİŞİRSE AuditLog (LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED, from/to). Değişmiyorsa no-op (guard/audit YOK).
 *   Migration YOK (kolon P4-1'de). P4/CHANGE_STATUS/OfficeApprovalRequest davranışı DEĞİŞMEZ — bu yalnız flag write-path.
 */
import { ForbiddenException } from "@nestjs/common";
import { LawyerService } from "../lawyer.service";

const TENANT = "t1";
const LAWYER_ID = "L1";

const build = (opts: { self?: Record<string, unknown>; actorUser?: unknown } = {}) => {
  const self = opts.self ?? {
    id: LAWYER_ID, name: "Ada", surname: "Lovelace", tckn: null, barNumber: null,
    isActive: true, tenantId: TENANT, canApproveOfficeActions: false,
  };
  const prisma: any = {
    lawyer: {
      findFirst: jest.fn().mockResolvedValue(self), // findOne(self)
      findMany: jest.fn().mockResolvedValue([]), // duplicate guard → eşleşme yok
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...self, ...data })),
    },
    user: { findUnique: jest.fn().mockResolvedValue(opts.actorUser ?? null) }, // actor PARTNER lookup
  };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  // L1A: constructor 3. parametre (OfficeApprovalService) aldı; delegation testleri deactivate'e dokunmaz → boş mock yeter.
  const officeApproval: any = { isApproverEligible: jest.fn() };
  return { svc: new LawyerService(prisma, audit, officeApproval), prisma, audit };
};

const ADMIN = { userId: "admin1", role: "ADMIN" };
const PARTNER_ACTOR = { userId: "p1", role: "USER" };
const partnerUser = { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: "PARTNER" } };
const NONPARTNER_ACTOR = { userId: "u1", role: "USER" };
const nonPartnerUser = { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: "LAWYER" } };
const staffUser = { tenantId: TENANT, isActive: true, lawyer: null };

describe("K1-4b LawyerService — office approval delegation (canApproveOfficeActions write-path)", () => {
  // ── YETKİLİ: ADMIN ──
  it("ADMIN false→true ayarlar → yazılır + AuditLog (from:false,to:true); user-lookup YAPILMAZ (ADMIN kısa-yol)", async () => {
    const { svc, prisma, audit } = build();
    await svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: true }, ADMIN);
    expect(prisma.lawyer.update).toHaveBeenCalledTimes(1);
    expect(prisma.lawyer.update.mock.calls[0][0].data.canApproveOfficeActions).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled(); // ADMIN → lawyer-rank lookup gereksiz
    expect(audit.log).toHaveBeenCalledTimes(1);
    const a = audit.log.mock.calls[0][0];
    expect(a).toMatchObject({ action: "LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED", entityType: "LAWYER", entityId: LAWYER_ID, userId: "admin1" });
    expect(a.metadata.canApproveOfficeActions).toEqual({ from: false, to: true });
  });

  it("ADMIN true→false (toggle off) → yazılır + AuditLog (from:true,to:false)", async () => {
    const { svc, prisma, audit } = build({ self: { id: LAWYER_ID, name: "A", surname: "B", isActive: true, tenantId: TENANT, canApproveOfficeActions: true } });
    await svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: false }, ADMIN);
    expect(prisma.lawyer.update.mock.calls[0][0].data.canApproveOfficeActions).toBe(false);
    expect(audit.log.mock.calls[0][0].metadata.canApproveOfficeActions).toEqual({ from: true, to: false });
  });

  // ── YETKİLİ: PARTNER ──
  it("linkli PARTNER avukat değiştirebilir → yazılır + audit", async () => {
    const { svc, prisma, audit } = build({ actorUser: partnerUser });
    await svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: true }, PARTNER_ACTOR);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.lawyer.update.mock.calls[0][0].data.canApproveOfficeActions).toBe(true);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  // ── YETKİSİZ → 403, YAZILMAZ, AUDIT YOK ──
  it("non-PARTNER non-ADMIN (LAWYER rank) → 403; lawyer.update ÇAĞRILMAZ, audit YOK", async () => {
    const { svc, prisma, audit } = build({ actorUser: nonPartnerUser });
    await expect(svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: true }, NONPARTNER_ACTOR)).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("staff/linksiz aktör (lawyer yok, role USER) → 403 (approver yönetemez)", async () => {
    const { svc, prisma } = build({ actorUser: staffUser });
    await expect(svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: true }, NONPARTNER_ACTOR)).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("cross-tenant PARTNER aktör → 403 (same-tenant şartı)", async () => {
    const { svc, prisma } = build({ actorUser: { tenantId: "t-OTHER", isActive: true, lawyer: { lawyerRank: "PARTNER" } } });
    await expect(svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: true }, PARTNER_ACTOR)).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("inactive PARTNER aktör → 403", async () => {
    const { svc, prisma } = build({ actorUser: { tenantId: TENANT, isActive: false, lawyer: { lawyerRank: "PARTNER" } } });
    await expect(svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: true }, PARTNER_ACTOR)).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("actor YOK (undefined) → 403", async () => {
    const { svc, prisma } = build();
    await expect(svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: true }, undefined as never)).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  // ── NO-OP: değer DEĞİŞMİYOR → guard/audit tetiklenmez ──
  it("değer DEĞİŞMİYOR (existing=false, gelen=false) → guard YOK, audit YOK; non-PARTNER bile reddedilmez, flag write'a SOKULMAZ", async () => {
    const { svc, prisma, audit } = build({ actorUser: nonPartnerUser }); // existing.canApproveOfficeActions=false
    await svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: false, phone: "5551112233" }, NONPARTNER_ACTOR);
    expect(prisma.user.findUnique).not.toHaveBeenCalled(); // guard hiç çağrılmadı
    expect(audit.log).not.toHaveBeenCalled();
    expect(prisma.lawyer.update).toHaveBeenCalledTimes(1);
    expect("canApproveOfficeActions" in prisma.lawyer.update.mock.calls[0][0].data).toBe(false); // generic write'a girmedi
    expect(prisma.lawyer.update.mock.calls[0][0].data.phone).toBe("5551112233"); // diğer alan normal yazılır
  });

  it("delegation alanı HİÇ gönderilmedi (yalnız phone) → guard/audit YOK, normal update", async () => {
    const { svc, prisma, audit } = build();
    await svc.update(TENANT, LAWYER_ID, { phone: "5550001122" }, NONPARTNER_ACTOR);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(prisma.lawyer.update).toHaveBeenCalledTimes(1);
  });
});
