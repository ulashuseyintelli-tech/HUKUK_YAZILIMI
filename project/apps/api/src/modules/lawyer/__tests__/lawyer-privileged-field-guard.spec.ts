/**
 * H2 — Yetki/rütbe alanları (lawyerRank, defaultPermissions, permissionsLocked,
 * canModifyOtherPermissions) write-path guard'ı.
 * KESİN: yalnız ADMIN VEYA linkli PARTNER avukat değiştirebilir; non-PARTNER/linksiz/cross-tenant/
 *   inactive/no-actor → 403 (yazılmaz). K1-4b (canApproveOfficeActions) ile AYNI otorite kuralı
 *   (assertActorIsAdminOrLinkedPartner) paylaşılır ama K1-4b'nin kendi davranışı/mesajı DEĞİŞMEDİ.
 *   Alan payload'da YOKSA guard hiç tetiklenmez → normal profil güncellemeleri (phone vb.) etkilenmez.
 */
import { ForbiddenException } from "@nestjs/common";
import { LawyerService } from "../lawyer.service";

const TENANT = "t1";
const LAWYER_ID = "L1";

const build = (opts: { self?: Record<string, unknown>; actorUser?: unknown } = {}) => {
  const self = opts.self ?? {
    id: LAWYER_ID, name: "Ada", surname: "Lovelace", tckn: null, barNumber: null,
    isActive: true, tenantId: TENANT, lawyerRank: "LAWYER", canModifyOtherPermissions: false,
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
  return { svc: new LawyerService(prisma, audit), prisma, audit };
};

const ADMIN = { userId: "admin1", role: "ADMIN" };
const PARTNER_ACTOR = { userId: "p1", role: "USER" };
const partnerUser = { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: "PARTNER" } };
const NONPARTNER_ACTOR = { userId: "u1", role: "USER" };
const nonPartnerUser = { tenantId: TENANT, isActive: true, lawyer: { lawyerRank: "LAWYER" } };
const staffUser = { tenantId: TENANT, isActive: true, lawyer: null };

describe("H2 LawyerService — privileged field guard (lawyerRank/defaultPermissions/permissionsLocked/canModifyOtherPermissions)", () => {
  // ── YETKİLİ: ADMIN ──
  it("ADMIN lawyerRank değiştirir → yazılır; user-lookup YAPILMAZ (ADMIN kısa-yol)", async () => {
    const { svc, prisma } = build();
    await svc.update(TENANT, LAWYER_ID, { lawyerRank: "PARTNER" as never }, ADMIN);
    expect(prisma.lawyer.update).toHaveBeenCalledTimes(1);
    expect(prisma.lawyer.update.mock.calls[0][0].data.lawyerRank).toBe("PARTNER");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("ADMIN dört alanı BİRLİKTE değiştirir → tek guard geçişiyle hepsi yazılır", async () => {
    const { svc, prisma } = build();
    await svc.update(
      TENANT,
      LAWYER_ID,
      {
        lawyerRank: "PARTNER" as never,
        defaultPermissions: { canEditCase: true },
        permissionsLocked: true,
        canModifyOtherPermissions: true,
      },
      ADMIN,
    );
    const written = prisma.lawyer.update.mock.calls[0][0].data;
    expect(written.lawyerRank).toBe("PARTNER");
    expect(written.defaultPermissions).toEqual({ canEditCase: true });
    expect(written.permissionsLocked).toBe(true);
    expect(written.canModifyOtherPermissions).toBe(true);
  });

  // ── YETKİLİ: PARTNER ──
  it("linkli PARTNER avukat defaultPermissions değiştirebilir → yazılır", async () => {
    const { svc, prisma } = build({ actorUser: partnerUser });
    await svc.update(TENANT, LAWYER_ID, { defaultPermissions: { canSyncUYAP: true } }, PARTNER_ACTOR);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.lawyer.update.mock.calls[0][0].data.defaultPermissions).toEqual({ canSyncUYAP: true });
  });

  // ── YETKİSİZ → 403, YAZILMAZ (asıl H2 exploit yolu: sıradan JWT ile yetki yükseltme) ──
  it("non-PARTNER non-ADMIN → lawyerRank='PARTNER' denemesi 403; lawyer.update ÇAĞRILMAZ", async () => {
    const { svc, prisma } = build({ actorUser: nonPartnerUser });
    await expect(
      svc.update(TENANT, LAWYER_ID, { lawyerRank: "PARTNER" as never }, NONPARTNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("non-PARTNER non-ADMIN → defaultPermissions denemesi 403", async () => {
    const { svc, prisma } = build({ actorUser: nonPartnerUser });
    await expect(
      svc.update(TENANT, LAWYER_ID, { defaultPermissions: { canEditCase: true } }, NONPARTNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("non-PARTNER non-ADMIN → permissionsLocked denemesi 403", async () => {
    const { svc, prisma } = build({ actorUser: nonPartnerUser });
    await expect(
      svc.update(TENANT, LAWYER_ID, { permissionsLocked: true }, NONPARTNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("non-PARTNER non-ADMIN → canModifyOtherPermissions denemesi 403 (yetki yükseltme zinciri kırılır)", async () => {
    const { svc, prisma } = build({ actorUser: nonPartnerUser });
    await expect(
      svc.update(TENANT, LAWYER_ID, { canModifyOtherPermissions: true }, NONPARTNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("staff/linksiz aktör (lawyer yok, role USER) → 403", async () => {
    const { svc, prisma } = build({ actorUser: staffUser });
    await expect(
      svc.update(TENANT, LAWYER_ID, { lawyerRank: "PARTNER" as never }, NONPARTNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("cross-tenant PARTNER aktör → 403 (same-tenant şartı)", async () => {
    const { svc, prisma } = build({ actorUser: { tenantId: "t-OTHER", isActive: true, lawyer: { lawyerRank: "PARTNER" } } });
    await expect(
      svc.update(TENANT, LAWYER_ID, { lawyerRank: "PARTNER" as never }, PARTNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("inactive PARTNER aktör → 403", async () => {
    const { svc, prisma } = build({ actorUser: { tenantId: TENANT, isActive: false, lawyer: { lawyerRank: "PARTNER" } } });
    await expect(
      svc.update(TENANT, LAWYER_ID, { lawyerRank: "PARTNER" as never }, PARTNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("actor YOK (undefined) → 403", async () => {
    const { svc, prisma } = build();
    await expect(
      svc.update(TENANT, LAWYER_ID, { lawyerRank: "PARTNER" as never }, undefined as never),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("hata mesajı K1-4b'nin 'office approval delegation' mesajından FARKLI (yanlış bağlam sızdırmaz)", async () => {
    const { svc } = build({ actorUser: nonPartnerUser });
    await expect(svc.update(TENANT, LAWYER_ID, { lawyerRank: "PARTNER" as never }, NONPARTNER_ACTOR)).rejects.toThrow(
      /Yetki\/rütbe alanları yalnız PARTNER veya ADMIN/,
    );
  });

  // ── REGRESYON: privileged alan HİÇ gönderilmedi → guard tetiklenmez, normal update AYNEN çalışır ──
  it("privileged alan HİÇ gönderilmedi (yalnız phone) → guard/user-lookup YOK, normal update çalışır", async () => {
    const { svc, prisma } = build();
    await svc.update(TENANT, LAWYER_ID, { phone: "5550001122" }, NONPARTNER_ACTOR);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.lawyer.update).toHaveBeenCalledTimes(1);
    expect(prisma.lawyer.update.mock.calls[0][0].data.phone).toBe("5550001122");
    expect("lawyerRank" in prisma.lawyer.update.mock.calls[0][0].data).toBe(false);
  });

  it("K1-4b canApproveOfficeActions davranışı DEĞİŞMEDİ: non-PARTNER hâlâ 403, ayrı guard/mesaj", async () => {
    const { svc, prisma } = build({ actorUser: nonPartnerUser, self: { id: LAWYER_ID, name: "A", surname: "B", isActive: true, tenantId: TENANT, canApproveOfficeActions: false } });
    await expect(svc.update(TENANT, LAWYER_ID, { canApproveOfficeActions: true }, NONPARTNER_ACTOR)).rejects.toThrow(
      /Office approval delegation yalnız PARTNER veya ADMIN/,
    );
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });
});
