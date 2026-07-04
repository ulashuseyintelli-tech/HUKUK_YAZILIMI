import { BadRequestException } from "@nestjs/common";
import { DebtorService } from "./debtor.service";

/**
 * GATE-4 — Kimlik FORMAT validasyonu (TCKN/VKN checksum + tip-katı cross-field).
 *
 * Servis-level (validateDebtorByType → validateIdentityFormat); create + update yollarını
 * kapsar (HTTP DTO'yu atlayan case.service server-side create dahil). isValidTckn/isValidVkn
 * (common/identity-validation.util) reuse. Tüm kimlik örnekleri SENTETİK (KVKK).
 *
 * Saf birim test (DB yok): prisma mock'lanır; negatifte validasyon prisma write'tan ÖNCE atar.
 */
const VALID_TCKN = "10000000146"; // sentetik, checksum geçerli
const BAD_TCKN = "12345678901"; // 11 hane ama checksum bozuk
const VALID_VKN = "1234567890"; // sentetik, checksum geçerli
const BAD_VKN = "1111111110"; // 10 hane ama checksum bozuk

describe("DebtorService — Gate-4 kimlik format validasyonu", () => {
  const T = "t1";

  function makePrisma() {
    return {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(null), // dedup → yok
        findMany: jest.fn().mockResolvedValue([]), // similar-name → yok
        create: jest.fn().mockResolvedValue({ id: "d1", name: "X", debtorAddresses: [], estateHeirs: [] }),
        update: jest.fn().mockResolvedValue({ id: "d1", name: "X", debtorAddresses: [], estateHeirs: [] }),
      },
      task: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;
  }
  function makeSvc(prisma: any) {
    // create/update lifecycle guard kullanmaz; Task D1A audit/officeApproval placeholder (bu dosya
    // negatif-validasyon testleri — gate/audit'e ulaşmadan önce reddedilir).
    return new DebtorService(
      prisma,
      { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
    );
  }

  // ───────────────────────── CREATE — negatif ─────────────────────────
  describe("CREATE — reddedilir", () => {
    it("INDIVIDUAL + VKN → reddedilir (cross-field: gerçek kişiye VKN yasak)", async () => {
      await expect(
        makeSvc(makePrisma()).create(T, { type: "INDIVIDUAL", firstName: "A", lastName: "B", vkn: VALID_VKN } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it("INDIVIDUAL + checksum-bozuk TCKN → reddedilir", async () => {
      await expect(
        makeSvc(makePrisma()).create(T, { type: "INDIVIDUAL", firstName: "A", lastName: "B", tckn: BAD_TCKN } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it("COMPANY + 11-haneli TCKN → reddedilir (TCKN yalnız INDIVIDUAL)", async () => {
      await expect(
        makeSvc(makePrisma()).create(T, { type: "COMPANY", companyName: "X AŞ", tckn: VALID_TCKN } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it("COMPANY + checksum-bozuk VKN → reddedilir", async () => {
      await expect(
        makeSvc(makePrisma()).create(T, { type: "COMPANY", companyName: "X AŞ", vkn: BAD_VKN } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it("prisma write'a İNİLMEZ (negatifte create çağrılmaz)", async () => {
      const prisma = makePrisma();
      await expect(
        makeSvc(prisma).create(T, { type: "COMPANY", companyName: "X AŞ", vkn: BAD_VKN } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.debtor.create).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────── CREATE — pozitif ─────────────────────────
  describe("CREATE — kabul (mevcut davranış korunur)", () => {
    it("geçerli INDIVIDUAL + TCKN → create çağrılır", async () => {
      const prisma = makePrisma();
      await makeSvc(prisma).create(T, { type: "INDIVIDUAL", firstName: "A", lastName: "B", tckn: VALID_TCKN } as any);
      expect(prisma.debtor.create).toHaveBeenCalled();
    });
    it("geçerli COMPANY + VKN → create çağrılır", async () => {
      const prisma = makePrisma();
      await makeSvc(prisma).create(T, { type: "COMPANY", companyName: "X AŞ", vkn: VALID_VKN } as any);
      expect(prisma.debtor.create).toHaveBeenCalled();
    });
    it("kimlik alanı boş → mevcut davranış (create çağrılır)", async () => {
      const prisma = makePrisma();
      await makeSvc(prisma).create(T, { type: "INDIVIDUAL", firstName: "A", lastName: "B", forceCreate: true } as any);
      expect(prisma.debtor.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────── UPDATE — payload-only ─────────────────────────
  describe("UPDATE — yalnız payload kimlik alanı doğrulanır", () => {
    function existing() {
      return {
        id: "d1", tenantId: T, type: "INDIVIDUAL", firstName: "A", lastName: "B", name: "A B",
        tckn: null, vkn: null, detsisNo: null, companyName: null, institutionName: null,
        deceasedName: null, deceasedTckn: null,
        debtorAddresses: [], estateHeirs: [], caseDebtors: [], assets: [], communications: [],
      };
    }

    it("alakasız alan (phone) güncellemesi → kimlik doğrulanmaz, update çağrılır (mevcut davranış)", async () => {
      const prisma = makePrisma();
      prisma.debtor.findFirst.mockResolvedValue(existing());
      await makeSvc(prisma).update(T, "d1", { phone: "555" } as any);
      expect(prisma.debtor.update).toHaveBeenCalled();
    });

    it("tip değişmeden checksum-bozuk TCKN → reddedilir + update çağrılmaz", async () => {
      const prisma = makePrisma();
      prisma.debtor.findFirst.mockResolvedValue(existing());
      await expect(makeSvc(prisma).update(T, "d1", { tckn: BAD_TCKN } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.debtor.update).not.toHaveBeenCalled();
    });
  });
});
