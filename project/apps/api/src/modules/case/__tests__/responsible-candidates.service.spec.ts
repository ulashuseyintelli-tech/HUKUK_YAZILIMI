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
