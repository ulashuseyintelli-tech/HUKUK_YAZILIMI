/**
 * PR-AUDIT: Staff + Lawyer duplicate guard (kimlik VEYA ad-soyad) + name normalize.
 * Eskiden guard yoktu → "Fatih engin"/"Ulaş Hüseyin Telli" mükerrer açılıyordu.
 */

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

describe("StaffService.create — duplicate guard", () => {
  const build = (existing: any[]) => {
    const prisma: any = {
      staffMember: {
        findMany: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: "new" }),
      },
      office: { findUnique: jest.fn().mockResolvedValue({ id: "o1" }) },
    };
    return { svc: new StaffService(prisma), prisma };
  };

  it("aynı ad-soyad (case/diakritik farklı) → yeni AÇMAZ, mevcut + bayrak", async () => {
    const { svc, prisma } = build([{ id: "s1", firstName: "Fatih", lastName: "Engin", isActive: true }]);
    const res = await svc.create("t1", { firstName: "fatih", lastName: "engin" });
    expect(prisma.staffMember.create).not.toHaveBeenCalled();
    expect((res as any)._existingReturned).toBe(true);
  });

  it("aynı TCKN → yeni AÇMAZ", async () => {
    const { svc, prisma } = build([{ id: "s1", firstName: "A", lastName: "B", tckn: "111", isActive: true }]);
    await svc.create("t1", { firstName: "X", lastName: "Y", tckn: "111" });
    expect(prisma.staffMember.create).not.toHaveBeenCalled();
  });

  it("soft-deleted eşleşme → reactivate", async () => {
    const { svc, prisma } = build([{ id: "s1", firstName: "Fatih", lastName: "Engin", isActive: false }]);
    const res = await svc.create("t1", { firstName: "Fatih", lastName: "Engin" });
    expect(prisma.staffMember.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { isActive: true } });
    expect((res as any)._reactivated).toBe(true);
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
    return { svc: new LawyerService(prisma), prisma };
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
