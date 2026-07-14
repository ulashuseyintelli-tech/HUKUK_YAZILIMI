/**
 * L1A (owner-locked 2026-07-02) — Lawyer artık kalıcı kimlik: DELETE /lawyers/:id fiziksel
 * silme DEĞİL, isActive=false pasifleştirmedir. ClientService.remove() ile birebir desen:
 * capability-gate (PARTNER veya canApproveOfficeActions delege avukat) + audit-in-transaction.
 * CaseLawyer/PowerOfAttorney/Case.responsibleLawyer ilişkilerine (deleteMany ile) DOKUNULMAZ.
 *
 * H1 (bu dosya, sonraki blok) — sorumlu avukat (CaseLawyer.isResponsible) invariant'ı ARTIK
 * kilitlenmekle kalmıyor, GERÇEKTEN uygulanıyor: sorumlu dosyası olan bir avukat replacementLawyerId
 * OLMADAN pasifleştirilemez; devir + pasifleştirme AYNI transaction'da. Önceki tur (PR #790) bu
 * invariant'ı yalnız KARAKTERİZE etmişti ("CaseLawyer'a hiç dokunulmaz") — o karakterizasyon artık
 * YANLIŞ (bilerek), bu görev tam da o boşluğu kapatıyor; eski testler bu dosyada GÜNCELLENDİ.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { LawyerService } from "../lawyer.service";

const TENANT = "t1";
const LAWYER_ID = "L1";
const REPLACEMENT_ID = "L2";

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

const build = (
  opts: {
    existing?: Record<string, unknown>;
    isEligible?: boolean;
    replacementLawyer?: Record<string, unknown> | null;
    responsibleCaseLawyers?: Array<{ id: string; caseId: string }>;
    replacementCaseLawyers?: Array<{ id: string; caseId: string }>;
    userUpdateCount?: number; // CANDIDATE-A: tx.user.updateMany({id,tenantId}) mock count'u
  } = {},
) => {
  const existing = opts.existing ?? EXISTING;
  const responsibleCaseLawyers = opts.responsibleCaseLawyers ?? [];
  const replacementCaseLawyers = opts.replacementCaseLawyers ?? [];

  const prisma: any = {
    lawyer: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === LAWYER_ID) return Promise.resolve(existing);
        if (where.id === REPLACEMENT_ID) return Promise.resolve(opts.replacementLawyer ?? null);
        return Promise.resolve(null);
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn(), // hard-delete ÇAĞRILMAMALI
    },
    user: {
      // CANDIDATE-A (OFF/OD-14, RATIFIED Contract): bağlı UserAccount fail-closed deaktivasyonu
      updateMany: jest.fn().mockResolvedValue({ count: opts.userUpdateCount ?? 1 }),
    },
    caseLawyer: {
      deleteMany: jest.fn(), // ÇAĞRILMAMALI (L1A: ilişkiler korunur)
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        if (where.lawyerId === LAWYER_ID) return Promise.resolve(responsibleCaseLawyers);
        if (where.lawyerId === REPLACEMENT_ID) return Promise.resolve(replacementCaseLawyers);
        return Promise.resolve([]);
      }),
      update: jest.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
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

/**
 * H1 — sorumlu avukat (CaseLawyer.isResponsible) devri, deactivate ile AYNI transaction.
 * Kanonik LegalResponsibleLawyerService (WP-1d-5-4) ile AYNI state-transition deseni
 * (clear-before-set, isResponsible⇔role coupling, audit şekli) — o servis BİLEREK çağrılmaz
 * (kendi tx'i + ADMIN-only + tek-case+reason-zorunlu; bu akış PARTNER/delege + çoklu-case).
 */
describe("H1 — LawyerService.delete() sorumlu avukat devri", () => {
  it("sorumlu dosyası YOK → replacementLawyerId istenmez, caseLawyer.update hiç çağrılmaz", async () => {
    const { svc, prisma } = build();
    const result = await svc.delete(TENANT, LAWYER_ID, { userId: "u1" });
    expect(prisma.caseLawyer.findMany).toHaveBeenCalledWith({
      where: { lawyerId: LAWYER_ID, isResponsible: true },
      select: { id: true, caseId: true },
    });
    expect(prisma.caseLawyer.update).not.toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });

  it("sorumlu dosyası VAR + replacementLawyerId YOK → BadRequestException (400), hiçbir yazma yapılmaz", async () => {
    const { svc, prisma, audit } = build({
      responsibleCaseLawyers: [{ id: "cl1", caseId: "c1" }],
    });
    await expect(svc.delete(TENANT, LAWYER_ID, { userId: "u1" })).rejects.toThrow(BadRequestException);
    expect(prisma.lawyer.updateMany).not.toHaveBeenCalled();
    expect(prisma.caseLawyer.update).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it("replacement kendisiyle AYNI (replacementLawyerId===id) → BadRequestException", async () => {
    const { svc, prisma } = build({ responsibleCaseLawyers: [{ id: "cl1", caseId: "c1" }] });
    await expect(svc.delete(TENANT, LAWYER_ID, { userId: "u1" }, LAWYER_ID)).rejects.toThrow(BadRequestException);
    expect(prisma.lawyer.updateMany).not.toHaveBeenCalled();
  });

  it("replacement bulunamıyor (yok/başka tenant) → BadRequestException, hiçbir yazma yapılmaz", async () => {
    const { svc, prisma } = build({
      responsibleCaseLawyers: [{ id: "cl1", caseId: "c1" }],
      replacementLawyer: null, // yok VEYA farklı tenant → findFirst({tenantId}) null döner
    });
    await expect(svc.delete(TENANT, LAWYER_ID, { userId: "u1" }, REPLACEMENT_ID)).rejects.toThrow(BadRequestException);
    expect(prisma.lawyer.updateMany).not.toHaveBeenCalled();
  });

  it("replacement PASİF → BadRequestException, hiçbir yazma yapılmaz", async () => {
    const { svc, prisma } = build({
      responsibleCaseLawyers: [{ id: "cl1", caseId: "c1" }],
      replacementLawyer: { id: REPLACEMENT_ID, isActive: false },
    });
    await expect(svc.delete(TENANT, LAWYER_ID, { userId: "u1" }, REPLACEMENT_ID)).rejects.toThrow(BadRequestException);
    expect(prisma.lawyer.updateMany).not.toHaveBeenCalled();
  });

  it("replacement AKTİF ama etkilenen dosyaya ATANMAMIŞ → BadRequestException (REPLACEMENT_NOT_ASSIGNED_TO_CASES)", async () => {
    const { svc, prisma } = build({
      responsibleCaseLawyers: [{ id: "cl1", caseId: "c1" }],
      replacementLawyer: { id: REPLACEMENT_ID, isActive: true },
      replacementCaseLawyers: [], // c1'e atanmamış
    });
    await expect(svc.delete(TENANT, LAWYER_ID, { userId: "u1" }, REPLACEMENT_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "REPLACEMENT_NOT_ASSIGNED_TO_CASES", caseIds: ["c1"] }),
    });
    expect(prisma.lawyer.updateMany).not.toHaveBeenCalled();
  });

  it("başarılı devir: eski avukat isResponsible=false, yeni avukat isResponsible=true, AYNI transaction", async () => {
    const { svc, prisma } = build({
      responsibleCaseLawyers: [{ id: "cl-old-1", caseId: "c1" }],
      replacementLawyer: { id: REPLACEMENT_ID, isActive: true },
      replacementCaseLawyers: [{ id: "cl-new-1", caseId: "c1" }],
    });
    const result = await svc.delete(TENANT, LAWYER_ID, { userId: "u1" }, REPLACEMENT_ID);

    expect(prisma.caseLawyer.update).toHaveBeenCalledWith({
      where: { id: "cl-old-1" },
      data: { isResponsible: false, role: "ASSIGNED" },
    });
    expect(prisma.caseLawyer.update).toHaveBeenCalledWith({
      where: { id: "cl-new-1" },
      data: { isResponsible: true, role: "RESPONSIBLE" },
    });
    expect(prisma.lawyer.updateMany).toHaveBeenCalledWith({
      where: { id: LAWYER_ID, tenantId: TENANT },
      data: { isActive: false },
    });
    expect(result.isActive).toBe(false);
    // Devir + pasifleştirme AYNI $transaction callback'i içinde çağrıldı (fixture: $transaction tek fn(prisma) çağırır)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("çoklu sorumlu dosya: HER dosya için ayrı devir uygulanır", async () => {
    const { svc, prisma } = build({
      responsibleCaseLawyers: [
        { id: "cl-old-1", caseId: "c1" },
        { id: "cl-old-2", caseId: "c2" },
      ],
      replacementLawyer: { id: REPLACEMENT_ID, isActive: true },
      replacementCaseLawyers: [
        { id: "cl-new-1", caseId: "c1" },
        { id: "cl-new-2", caseId: "c2" },
      ],
    });
    await svc.delete(TENANT, LAWYER_ID, { userId: "u1" }, REPLACEMENT_ID);
    expect(prisma.caseLawyer.update).toHaveBeenCalledTimes(4); // 2 dosya × (demote+promote)
  });

  it("audit metadata devir bilgisini içerir: LAWYER_DEACTIVATE.metadata.responsibilityTransfer + ayrı CASE_LAWYER audit'i", async () => {
    const { svc, audit } = build({
      responsibleCaseLawyers: [{ id: "cl-old-1", caseId: "c1" }],
      replacementLawyer: { id: REPLACEMENT_ID, isActive: true },
      replacementCaseLawyers: [{ id: "cl-new-1", caseId: "c1" }],
    });
    await svc.delete(TENANT, LAWYER_ID, { userId: "u1" }, REPLACEMENT_ID);

    const calls = audit.logInTransaction.mock.calls;
    const caseLawyerCall = calls.find((c: any) => c[1].entityType === "CASE_LAWYER")![1];
    expect(caseLawyerCall).toMatchObject({
      tenantId: TENANT,
      entityType: "CASE_LAWYER",
      entityId: "cl-new-1",
      userId: "u1",
      newValues: { isResponsible: true, role: "RESPONSIBLE", lawyerId: REPLACEMENT_ID },
      metadata: expect.objectContaining({
        caseId: "c1",
        changeType: "LEGAL_RESPONSIBLE_LAWYER_CHANGED",
        previousLawyerId: LAWYER_ID,
        newLawyerId: REPLACEMENT_ID,
        source: "LAWYER_DEACTIVATE_TRANSFER",
      }),
    });

    const lawyerCall = calls.find((c: any) => c[1].entityType === "LAWYER")![1];
    expect(lawyerCall.metadata.responsibilityTransfer).toEqual({
      replacementLawyerId: REPLACEMENT_ID,
      caseCount: 1,
      caseIds: ["c1"],
    });
  });

  it("sorumlu dosyası yoksa LAWYER_DEACTIVATE audit'inde responsibilityTransfer alanı YOKTUR (regresyon)", async () => {
    const { svc, audit } = build();
    await svc.delete(TENANT, LAWYER_ID, { userId: "u1" });
    const metadata = audit.logInTransaction.mock.calls[0][1].metadata;
    expect(metadata).not.toHaveProperty("responsibilityTransfer");
  });
});

/**
 * CANDIDATE-A (OFF/OD-14, WAVE 1 — Session/Lifecycle Safety, RATIFIED Contract) — bağlı
 * UserAccount'ın Lawyer ile AYNI transaction içinde deaktive edilmesi. Fail-closed + atomic:
 * userId dolu VE user.updateMany count!==1 ise ConflictException fırlar (best-effort YASAK —
 * owner ratifikasyonu, ilk taslaktaki "sessiz no-op" tasarımı REDDETTİ). userId null ise
 * mevcut profile-only davranış (bu dosyanın ÜSTÜNDEKİ tüm testler) DEĞİŞMEDEN korunur.
 */
describe("CANDIDATE-A — LawyerService.delete() bağlı User deaktivasyonu", () => {
  it("userId NULL ise user.updateMany HİÇ ÇAĞRILMAZ (mevcut profile-only davranış korunur)", async () => {
    const { svc, prisma } = build(); // EXISTING'de userId yok
    await svc.delete(TENANT, LAWYER_ID, { userId: "u1" });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("bağlı userId VARSA → user.updateMany({id,tenantId}, isActive:false) doğru where ile çağrılır", async () => {
    const { svc, prisma } = build({ existing: { ...EXISTING, userId: "u-linked" } });
    const result = await svc.delete(TENANT, LAWYER_ID, { userId: "u1" });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u-linked", tenantId: TENANT },
      data: { isActive: false },
    });
    expect(result.isActive).toBe(false);
  });

  it("bağlı User ZATEN inactive olsa bile updateMany count=1 döner → idempotent, hata FIRLATILMAZ", async () => {
    const { svc } = build({ existing: { ...EXISTING, userId: "u-linked" }, userUpdateCount: 1 });
    await expect(svc.delete(TENANT, LAWYER_ID, { userId: "u1" })).resolves.toMatchObject({ isActive: false });
  });

  it("user.updateMany count!==1 (tenant uyuşmazlığı/bütünlük sorunu) → ConflictException; " +
     "Lawyer AKTİF profil YAYINLAMAZ (rollback — gerçek atomicity Prisma $transaction'ın kendi " +
     "garantisi, aynı tx callback'i içinde doğrulandı; bu unit test yalnız fail-closed throw'u doğrular)",
    async () => {
      const { svc } = build({ existing: { ...EXISTING, userId: "u-linked" }, userUpdateCount: 0 });
      await expect(svc.delete(TENANT, LAWYER_ID, { userId: "u1" })).rejects.toThrow(ConflictException);
    },
  );

  it("REGRESYON: H1 sorumluluk devri + User deaktivasyonu AYNI transaction'da birlikte çalışır", async () => {
    const { svc, prisma } = build({
      existing: { ...EXISTING, userId: "u-linked" },
      responsibleCaseLawyers: [{ id: "cl-old-1", caseId: "c1" }],
      replacementLawyer: { id: REPLACEMENT_ID, isActive: true },
      replacementCaseLawyers: [{ id: "cl-new-1", caseId: "c1" }],
    });
    const result = await svc.delete(TENANT, LAWYER_ID, { userId: "u1" }, REPLACEMENT_ID);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u-linked", tenantId: TENANT },
      data: { isActive: false },
    });
    expect(prisma.caseLawyer.update).toHaveBeenCalledWith({
      where: { id: "cl-new-1" },
      data: { isResponsible: true, role: "RESPONSIBLE" },
    });
    expect(result.isActive).toBe(false);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
