/**
 * PR-AUDIT: Staff + Lawyer duplicate guard (kimlik VEYA ad-soyad) + name normalize.
 * Eskiden guard yoktu → "Fatih engin"/"Ulaş Hüseyin Telli" mükerrer açılıyordu.
 */

import { ConflictException } from "@nestjs/common";
import { normalizePersonName } from "../../../common/name-match.util";
import { StaffService } from "../staff.service";
import { LawyerService } from "../../lawyer/lawyer.service";

describe("normalizePersonName", () => {
  it("diakritik + case + boşluk foldlar", () => {
    expect(normalizePersonName("Ulaş Hüseyin", "Telli")).toBe("ULAS HUSEYIN TELLI");
    expect(normalizePersonName("ulaş  hüseyin", "telli")).toBe("ULAS HUSEYIN TELLI");
    expect(normalizePersonName("Fatih", "engin")).toBe("FATIH ENGIN");
  });
  it("boş → ''", () => {
    expect(normalizePersonName(null, undefined)).toBe("");
  });
});

describe("StaffService.create — duplicate handling (PR-S)", () => {
  const build = (existing: any[]) => {
    const prisma: any = {
      staffMember: {
        findMany: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: "new" }),
      },
      office: { findUnique: jest.fn().mockResolvedValue({ id: "o1" }) },
      // O-5 inceleme özeti (salt okuma): dosya atamaları, sorumluluk ve bağlı hesap durumu.
      caseStaff: { count: jest.fn().mockResolvedValue(2) },
      case: { count: jest.fn().mockResolvedValue(1) },
      user: { findFirst: jest.fn().mockResolvedValue({ isActive: false }) },
    };
    return { svc: new StaffService(prisma), prisma };
  };

  it("aynı TCKN → kesin duplicate: yeni AÇMAZ, mevcut döner", async () => {
    const { svc, prisma } = build([{ id: "s1", firstName: "A", lastName: "B", tckn: "111", isActive: true }]);
    const res = await svc.create("t1", { firstName: "X", lastName: "Y", tckn: "111" });
    expect(prisma.staffMember.create).not.toHaveBeenCalled();
    expect((res as any)._existingReturned).toBe(true);
  });

  it("aynı e-posta → kesin duplicate: yeni AÇMAZ, mevcut döner", async () => {
    const { svc, prisma } = build([{ id: "s1", firstName: "A", lastName: "B", email: "x@y.z", isActive: true }]);
    const res = await svc.create("t1", { firstName: "X", lastName: "Y", email: "x@y.z" });
    expect(prisma.staffMember.create).not.toHaveBeenCalled();
    expect((res as any)._existingReturned).toBe(true);
  });

  // O-5 (owner 05.11.2026, C politikası): pasif kart create ile SESSİZCE etkinleşmez. Eskiden burada
  // `update({ isActive: true })` çalışıyor, ESKİ izinler geri geliyor, formdaki değerler yazılmıyordu.
  const PASIF = {
    id: "s1", firstName: "A", lastName: "B", tckn: "111", email: "a@b.test", isActive: false, userId: "u1",
    staffType: "MUHASEBE", canCreateCase: false, canEditCase: true, canGenerateDocuments: false, canApproveDocuments: false,
    canSeeFinance: true, canApproveFinance: false, canPrepareCollectionDisposition: true, canSendNotifications: false,
    isDefaultForNewCases: true,
  };
  const yazimYok = (prisma: any) => {
    expect(prisma.staffMember.update).not.toHaveBeenCalled();
    expect(prisma.staffMember.updateMany).not.toHaveBeenCalled();
    expect(prisma.staffMember.create).not.toHaveBeenCalled();
  };

  it("soft-deleted + aynı TCKN → YAZIMSIZ 409 STAFF_REACTIVATION_REVIEW (O-5)", async () => {
    const { svc, prisma } = build([PASIF]);
    const err: any = await svc
      .create("t1", { firstName: "X", lastName: "Y", tckn: "111", canSeeFinance: false, isDefaultForNewCases: false })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    const body = err.getResponse();
    expect(body.code).toBe("STAFF_REACTIVATION_REVIEW");
    expect(body.message).toContain("hiçbir değişiklik yapılmadı");
    // Gözden geçirme için kartın MEVCUT izinleri + etki; istekteki değerler değil.
    expect(body.staff).toEqual({
      id: "s1", firstName: "A", lastName: "B", staffType: "MUHASEBE",
      canCreateCase: false, canEditCase: true, canGenerateDocuments: false, canApproveDocuments: false,
      canSeeFinance: true, canApproveFinance: false, canPrepareCollectionDisposition: true, canSendNotifications: false,
      isDefaultForNewCases: true,
      linkedAccount: { exists: true, isActive: false }, caseAssignmentCount: 2, responsibleCaseCount: 1,
    });
    // Yanıt kimlik / iletişim / hesap kimliği taşımaz.
    for (const k of ["tckn", "email", "phone", "mobilePhone", "userId", "tenantId"]) expect(body.staff).not.toHaveProperty(k);
    yazimYok(prisma);
  });

  it("soft-deleted + aynı e-posta → YAZIMSIZ 409 STAFF_REACTIVATION_REVIEW (O-5)", async () => {
    const { svc, prisma } = build([PASIF]);
    await expect(svc.create("t1", { firstName: "X", lastName: "Y", email: "a@b.test" })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "STAFF_REACTIVATION_REVIEW" }),
    });
    yazimYok(prisma);
  });

  it("forceCreate pasif kimlik incelemesini GEÇMEZ (O-5)", async () => {
    const { svc, prisma } = build([PASIF]);
    await expect(svc.create("t1", { firstName: "X", lastName: "Y", tckn: "111", forceCreate: true })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "STAFF_REACTIVATION_REVIEW" }),
    });
    yazimYok(prisma);
  });

  it("aynı kimlik hem aktif hem pasif kartta → AKTİF kart döner, pasif kart açılmaz (O-5)", async () => {
    const { svc, prisma } = build([PASIF, { ...PASIF, id: "s2", isActive: true }]);
    const res: any = await svc.create("t1", { firstName: "X", lastName: "Y", tckn: "111" });
    expect(res.id).toBe("s2");
    expect(res._existingReturned).toBe(true);
    expect(res._reactivated).toBe(false);
    yazimYok(prisma);
  });

  it("kimliksiz aynı ad-soyad + forceCreate yok → SESSİZ MERGE YOK, 409 SIMILAR_NAME_REVIEW", async () => {
    const { svc, prisma } = build([{ id: "s1", firstName: "Fatih", lastName: "Engin", isActive: true }]);
    await expect(svc.create("t1", { firstName: "fatih", lastName: "engin" })).rejects.toThrow(ConflictException);
    expect(prisma.staffMember.create).not.toHaveBeenCalled();
  });

  it("409 gövdesi code + candidates döndürür", async () => {
    const { svc } = build([{ id: "s1", firstName: "Fatih", lastName: "Engin", isActive: true }]);
    expect.assertions(2);
    try {
      await svc.create("t1", { firstName: "fatih", lastName: "engin" });
    } catch (e: any) {
      const body = e.getResponse();
      expect(body.code).toBe("SIMILAR_NAME_REVIEW");
      expect(body.candidates).toEqual([{ id: "s1", name: "Fatih Engin" }]);
    }
  });

  it("kimliksiz aynı ad-soyad + forceCreate=true → ayrı kişi olarak YENİ açılır", async () => {
    const { svc, prisma } = build([{ id: "s1", firstName: "Fatih", lastName: "Engin", isActive: true }]);
    await svc.create("t1", { firstName: "fatih", lastName: "engin", forceCreate: true });
    expect(prisma.staffMember.create).toHaveBeenCalled();
  });

  it("eşleşme yok → YENİ açılır", async () => {
    const { svc, prisma } = build([{ id: "s1", firstName: "Fatih", lastName: "Engin", isActive: true }]);
    await svc.create("t1", { firstName: "Başka", lastName: "Kişi" });
    expect(prisma.staffMember.create).toHaveBeenCalled();
  });
});

describe("LawyerService.create — duplicate guard", () => {
  const build = (existing: any[]) => {
    const prisma: any = {
      lawyer: {
        findMany: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
        create: jest.fn().mockResolvedValue({ id: "new" }),
      },
      office: { findUnique: jest.fn().mockResolvedValue({ id: "o1" }) },
    };
    // AK-2: create avukat + audit'i tek transaction'da yazar; tx = aynı mock.
    prisma.$transaction = jest.fn(async (fn: (tx: any) => unknown) => fn(prisma));
    // K1-4b: LawyerService artık AuditService de alıyor; create duplicate-guard testleri delegation'a dokunmaz → audit mock yeter.
    const audit: any = {
      log: jest.fn().mockResolvedValue(undefined),
      logInTransaction: jest.fn().mockResolvedValue(undefined),
    };
    return { svc: new LawyerService(prisma, audit), prisma };
  };

  it("aynı ad-soyad → yeni AÇMAZ, mevcut + bayrak", async () => {
    const { svc, prisma } = build([{ id: "l1", name: "Ulaş Hüseyin", surname: "Telli", isActive: true }]);
    const res = await svc.create("t1", { name: "ulaş hüseyin", surname: "telli" });
    expect(prisma.lawyer.create).not.toHaveBeenCalled();
    expect((res as any)._existingReturned).toBe(true);
  });

  it("aynı baro no → yeni AÇMAZ", async () => {
    const { svc, prisma } = build([{ id: "l1", name: "A", surname: "B", barNumber: "34851", isActive: true }]);
    await svc.create("t1", { name: "X", surname: "Y", barNumber: "34851" });
    expect(prisma.lawyer.create).not.toHaveBeenCalled();
  });

  it("eşleşme yok → YENİ açılır", async () => {
    const { svc, prisma } = build([{ id: "l1", name: "Ulaş", surname: "Telli", isActive: true }]);
    await svc.create("t1", { name: "Başka", surname: "Avukat" });
    expect(prisma.lawyer.create).toHaveBeenCalled();
  });
});
