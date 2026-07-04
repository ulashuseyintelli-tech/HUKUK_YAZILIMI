/**
 * DBND-D1: Borçlu domain boundary review (2026-07-03) bulgusu.
 *
 * Önce (bug): Debtor.type yaratımdan sonra serbestçe değişebiliyordu ve eski-tip
 * alanları (örn. firstName/tckn) temizlenmiyordu → INDIVIDUAL→COMPANY geçişinde
 * hem firstName hem companyName dolu "Frankenstein kayıt" üretilebiliyordu. Ayrıca
 * type hiç değişmeden bile yabancı-tip alanı (örn. INDIVIDUAL kayda companyName)
 * serbestçe yazılabiliyordu (cross-type field kirliliği).
 *
 * Şimdi: update() içinde newType'a ait OLMAYAN tip-özel bir alan dto'da (non-null)
 * gelirse BadRequestException; tip GERÇEKTEN değişiyorsa eski tipin alanları
 * updateData'da açıkça null'a çekiliyor.
 */
import { BadRequestException } from "@nestjs/common";
import { DebtorService } from "../debtor.service";
import { DebtorType } from "../dto/debtor.dto";

const VALID_VKN = "1234567890"; // sentetik, checksum geçerli (bkz. debtor-identity-format.spec.ts)

describe("DebtorService.update — DBND-D1 type mutability + cross-type field guard", () => {
  const individual = {
    id: "self",
    type: DebtorType.INDIVIDUAL,
    firstName: "Ali",
    lastName: "Veli",
    tckn: "10000000146",
    gender: "E",
    birthDate: null,
    fatherName: null,
    motherName: null,
    birthPlace: null,
    companyName: null,
    vkn: null,
    name: "Ali Veli",
    detsisNo: null,
  };

  const build = (existing: any) => {
    const prisma: any = {
      debtor: {
        // findOne + syncDebtorTaskByIdSafe → existing; checkDuplicateInternal (where.OR) → null (dup yok)
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where?.OR ? null : existing),
        ),
        findMany: jest.fn().mockResolvedValue([]), // isim review adayları
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: existing.id, ...data })),
      },
    };
    const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) };
    return { svc: new DebtorService(prisma, audit as any, {} as any), prisma };
  };

  it("type değişmeden yabancı-tip alan (companyName INDIVIDUAL'a) → BadRequestException, update çağrılmaz", async () => {
    const { svc, prisma } = build(individual);
    await expect(
      svc.update("t1", "self", { companyName: "X AŞ" } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.debtor.update).not.toHaveBeenCalled();
  });

  it("type değişirken ESKİ tipin alanı da gönderilirse (firstName + type=COMPANY) → BadRequestException", async () => {
    const { svc, prisma } = build(individual);
    await expect(
      svc.update("t1", "self", {
        type: DebtorType.COMPANY,
        companyName: "X AŞ",
        vkn: VALID_VKN,
        firstName: "stale",
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.debtor.update).not.toHaveBeenCalled();
  });

  it("meşru type değişimi (INDIVIDUAL→COMPANY) → eski tipin TÜM alanları updateData'da null'a çekilir", async () => {
    const { svc, prisma } = build(individual);
    await svc.update("t1", "self", {
      type: DebtorType.COMPANY,
      companyName: "X AŞ",
      vkn: VALID_VKN,
    } as any);
    expect(prisma.debtor.update).toHaveBeenCalled();
    const writtenData = prisma.debtor.update.mock.calls[0][0].data;
    expect(writtenData).toMatchObject({
      type: DebtorType.COMPANY,
      companyName: "X AŞ",
      vkn: VALID_VKN,
      firstName: null,
      lastName: null,
      tckn: null,
      gender: null,
      birthDate: null,
      fatherName: null,
      motherName: null,
      birthPlace: null,
    });
    // Frankenstein kayıt YOK: companyName dolu + firstName aynı anda dolu değil.
    expect(writtenData.firstName).toBeNull();
    expect(writtenData.companyName).toBe("X AŞ");
  });

  it("aynı tip, ilgisiz alan (phone) → guard tetiklenmez, güncellenir", async () => {
    const { svc, prisma } = build(individual);
    await svc.update("t1", "self", { phone: "05551112233" } as any);
    expect(prisma.debtor.update).toHaveBeenCalled();
  });

  it("aynı tipin kendi alanı (firstName, type göndermeden) → guard tetiklenmez", async () => {
    const { svc, prisma } = build(individual);
    await svc.update("t1", "self", { firstName: "Yeni" } as any);
    expect(prisma.debtor.update).toHaveBeenCalled();
  });

  it("type aynı değere set edilirse (no-op type) → eski alanlar null'a ÇEKİLMEZ (gerçek değişim yok)", async () => {
    const { svc, prisma } = build(individual);
    // validateDebtorByType() dto'nun KENDİSİNİ (existing ile merge etmeden) doğrular — pre-existing
    // davranış; type gönderiliyorsa o tipin zorunlu alanları da (lastName) aynı payload'da olmalı.
    await svc.update("t1", "self", { type: DebtorType.INDIVIDUAL, firstName: "Güncel", lastName: "Veli" } as any);
    expect(prisma.debtor.update).toHaveBeenCalled();
    const writtenData = prisma.debtor.update.mock.calls[0][0].data;
    expect(writtenData.firstName).toBe("Güncel");
    expect(writtenData.tckn).toBeUndefined(); // dokunulmadı, null'a çekilmedi
  });
});
