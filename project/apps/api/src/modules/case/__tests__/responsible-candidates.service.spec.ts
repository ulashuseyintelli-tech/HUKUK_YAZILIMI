import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ResponsibleCandidatesService } from "../responsible-candidates.service";

// M2-G2: picker kaynağı servisi (salt-okuma). Prisma mock'lanır.
describe("ResponsibleCandidatesService (M2-G2)", () => {
  const makeService = (lawyers: any[], staff: any[]) => {
    const prisma = {
      lawyer: { findMany: jest.fn((..._a: any[]) => Promise.resolve(lawyers)) },
      staffMember: { findMany: jest.fn((..._a: any[]) => Promise.resolve(staff)) },
    } as any;
    return { service: new ResponsibleCandidatesService(prisma), prisma };
  };

  it("aktif avukat + aktif personeli doğru shape ile aday döndürür", async () => {
    const { service } = makeService(
      [{ id: "law1", name: "Ulaş", surname: "Telli", title: null, lawyerRank: "LAWYER" }],
      [{ id: "stf1", firstName: "Büşra", lastName: "Atmaca", staffType: "SEKRETER" }]
    );
    const out = await service.getResponsibleCandidates("t1");
    expect(out).toEqual([
      { type: "LAWYER", id: "law1", displayName: "Av. Ulaş Telli", subtitle: "Avukat" },
      { type: "STAFF", id: "stf1", displayName: "Büşra Atmaca", subtitle: "Sekreter" },
    ]);
  });

  it("filtreleri uygular: lawyer isActive+canBeResponsible, staff isActive (soft-deleted dışarıda)", async () => {
    const { service, prisma } = makeService([], []);
    await service.getResponsibleCandidates("t1");
    expect(prisma.lawyer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1", isActive: true, canBeResponsible: true } })
    );
    expect(prisma.staffMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1", isActive: true } })
    );
  });

  it("title varsa onu kullanır; yoksa INTERN→'Stj. Av.', diğer→'Av.'; subtitle=rank etiketi", async () => {
    const { service } = makeService(
      [
        { id: "l1", name: "A", surname: "B", title: "Huk. Müş.", lawyerRank: "LAWYER" },
        { id: "l2", name: "C", surname: "D", title: null, lawyerRank: "INTERN" },
        { id: "l3", name: "E", surname: "F", title: null, lawyerRank: "PARTNER" },
      ],
      []
    );
    const out = await service.getResponsibleCandidates("t1");
    expect(out.map((c) => c.displayName)).toEqual(["Huk. Müş. A B", "Stj. Av. C D", "Av. E F"]);
    expect(out.map((c) => c.subtitle)).toEqual(["Avukat", "Stajyer Avukat", "Ortak Avukat"]);
  });

  it("staffType subtitle haritası + isim boşluk normalizasyonu", async () => {
    const { service } = makeService(
      [],
      [
        { id: "s1", firstName: "Fatih ", lastName: " Engin", staffType: "MUHASEBE" },
        { id: "s2", firstName: "X", lastName: "Y", staffType: "DIGER" },
      ]
    );
    const out = await service.getResponsibleCandidates("t1");
    expect(out).toEqual([
      { type: "STAFF", id: "s1", displayName: "Fatih Engin", subtitle: "Muhasebe" },
      { type: "STAFF", id: "s2", displayName: "X Y", subtitle: "Diğer" },
    ]);
  });

  it("bilinmeyen staffType → 'Personel' fallback", async () => {
    const { service } = makeService([], [{ id: "s9", firstName: "Z", lastName: "Q", staffType: "FOO_UNKNOWN" }]);
    const out = await service.getResponsibleCandidates("t1");
    expect(out[0].subtitle).toBe("Personel");
  });
});

describe("ResponsibleCandidatesService.assignResponsiblePerson (M2-G3a)", () => {
  // case varsayılan: var ({id:"c1"}); lawyer/staff varsayılan: null (aday değil)
  const makeAssign = (opts: { case?: any; lawyer?: any; staff?: any } = {}) => {
    const prisma = {
      case: {
        findFirst: jest.fn((..._a: any[]) =>
          Promise.resolve("case" in opts ? opts.case : { id: "c1" })
        ),
        update: jest.fn((..._a: any[]) => Promise.resolve({})),
      },
      lawyer: { findFirst: jest.fn((..._a: any[]) => Promise.resolve(opts.lawyer ?? null)) },
      staffMember: { findFirst: jest.fn((..._a: any[]) => Promise.resolve(opts.staff ?? null)) },
    } as any;
    return { service: new ResponsibleCandidatesService(prisma), prisma };
  };

  it("LAWYER set → responsibleLawyerId yazılır, responsibleStaffId null'lanır", async () => {
    const { service, prisma } = makeAssign({ lawyer: { id: "L1" } });
    const out = await service.assignResponsiblePerson("t1", "c1", { responsibleLawyerId: "L1" });
    expect(out).toEqual({ responsibleLawyerId: "L1", responsibleStaffId: null });
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { responsibleLawyerId: "L1", responsibleStaffId: null },
    });
  });

  it("STAFF set → responsibleStaffId yazılır, responsibleLawyerId null'lanır", async () => {
    const { service, prisma } = makeAssign({ staff: { id: "S1" } });
    const out = await service.assignResponsiblePerson("t1", "c1", { responsibleStaffId: "S1" });
    expect(out).toEqual({ responsibleLawyerId: null, responsibleStaffId: "S1" });
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { responsibleStaffId: "S1", responsibleLawyerId: null },
    });
  });

  it("ikisi birden → 400 (BadRequest), update çağrılmaz", async () => {
    const { service, prisma } = makeAssign();
    await expect(
      service.assignResponsiblePerson("t1", "c1", { responsibleLawyerId: "L1", responsibleStaffId: "S1" })
    ).rejects.toThrow(BadRequestException);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it("hiçbiri → 400 (BadRequest), update çağrılmaz", async () => {
    const { service, prisma } = makeAssign();
    await expect(service.assignResponsiblePerson("t1", "c1", {})).rejects.toThrow(BadRequestException);
    await expect(
      service.assignResponsiblePerson("t1", "c1", { responsibleLawyerId: "  ", responsibleStaffId: "" })
    ).rejects.toThrow(BadRequestException);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it("pasif/aday-olmayan avukat → 400, update çağrılmaz", async () => {
    const { service, prisma } = makeAssign({ lawyer: null });
    await expect(
      service.assignResponsiblePerson("t1", "c1", { responsibleLawyerId: "Lx" })
    ).rejects.toThrow(BadRequestException);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it("pasif/aday-olmayan personel → 400, update çağrılmaz", async () => {
    const { service, prisma } = makeAssign({ staff: null });
    await expect(
      service.assignResponsiblePerson("t1", "c1", { responsibleStaffId: "Sx" })
    ).rejects.toThrow(BadRequestException);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it("dosya bu tenant'ta yok → 404 (NotFound)", async () => {
    const { service } = makeAssign({ case: null, lawyer: { id: "L1" } });
    await expect(
      service.assignResponsiblePerson("t1", "cX", { responsibleLawyerId: "L1" })
    ).rejects.toThrow(NotFoundException);
  });

  it("cross-tenant aday reddedilir (aday sorgusu tenantId ile scoped → eşleşmez → 400)", async () => {
    const { service, prisma } = makeAssign({ lawyer: null });
    await expect(
      service.assignResponsiblePerson("tA", "c1", { responsibleLawyerId: "Lother" })
    ).rejects.toThrow(BadRequestException);
    expect(prisma.lawyer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "Lother", tenantId: "tA", isActive: true, canBeResponsible: true }),
      })
    );
  });
});
