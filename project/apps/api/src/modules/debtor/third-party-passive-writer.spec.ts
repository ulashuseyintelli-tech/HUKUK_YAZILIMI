import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ThirdPartyService } from "./third-party.service";

/**
 * GATE-2 — PASSIVE WRITER HARDENING.
 *
 * Ürün kuralı: PASSIVE CaseDebtor = tarihsel kayıt OKUNABİLİR, ama üzerinde yeni
 * operasyonel write/mutation YAPILAMAZ. Read serbest.
 *
 * Bu suite, ThirdPartyService'in operasyonel write metotlarının mutation'dan ÖNCE
 * CaseDebtorLifecycleGuardService.assertActiveByCaseDebtorId çağırdığını ve guard
 * reddedince (PASSIVE) asıl prisma mutation'ına İNİLMEDİĞİNİ doğrular; ACTIVE'de
 * mevcut davranış korunur; tarihsel read guard'a hiç uğramaz.
 *
 * Saf birim test (DB yok): prisma + lifecycle guard mock'lanır.
 */
describe("ThirdPartyService — Gate-2 passive writer hardening", () => {
  const TENANT = "t1";
  const CD = "cd1"; // caseDebtorId

  function makePrisma() {
    return {
      thirdParty: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: "tp1" }),
        update: jest.fn().mockResolvedValue({ id: "tp1" }),
        delete: jest.fn().mockResolvedValue({ id: "tp1" }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      externalCase: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: "ec1" }),
        update: jest.fn().mockResolvedValue({ id: "ec1" }),
        delete: jest.fn().mockResolvedValue({ id: "ec1" }),
      },
      caseDebtor: { findFirst: jest.fn() },
    } as any;
  }

  // ACTIVE: guard resolve; PASSIVE: guard BadRequestException (gerçek guard davranışı).
  function makeGuard(passive: boolean) {
    return {
      assertActiveByCaseDebtorId: passive
        ? jest.fn().mockRejectedValue(
            new BadRequestException("Pasif dosya borçlusu yeni operasyon hedefi olamaz."),
          )
        : jest.fn().mockResolvedValue({ id: CD, lifecycleStatus: "ACTIVE" }),
    } as any;
  }

  function makeService(prisma: any, guard: any) {
    // collectionService yalnız addExternalCaseCollection'da kullanılır.
    return new ThirdPartyService(prisma, { create: jest.fn() } as any, guard);
  }

  const tp = { id: "tp1", tenantId: TENANT, caseDebtorId: CD };
  const ec = { id: "ec1", tenantId: TENANT, caseDebtorId: CD, receivedAmount: 0 };

  // ───────────────────────── ThirdParty writes ─────────────────────────
  describe.each([
    ["update", (s: ThirdPartyService) => s.update(TENANT, "tp1", { name: "X" } as any), "thirdParty", "update"],
    ["delete", (s: ThirdPartyService) => s.delete(TENANT, "tp1"), "thirdParty", "delete"],
    ["recordIhbarname", (s: ThirdPartyService) => s.recordIhbarname(TENANT, "tp1", { ihbarnameType: "89_1", date: "2026-01-01" } as any), "thirdParty", "update"],
    ["recordResponse", (s: ThirdPartyService) => s.recordResponse(TENANT, "tp1", { responseDate: "2026-01-01", responseContent: "ok" } as any), "thirdParty", "update"],
    ["sendNextIhbarname", (s: ThirdPartyService) => s.sendNextIhbarname(TENANT, "tp1"), "thirdParty", "update"],
  ])("%s (ThirdParty)", (_name, call, model, mutateFn) => {
    it("NEGATIF: PASSIVE → reddedilir + mutation çağrılmaz + guard doğru caseDebtorId ile çağrılır", async () => {
      const prisma = makePrisma();
      prisma.thirdParty.findFirst.mockResolvedValue({ ...tp }); // ihbarname tarihleri null → sendNext canProceed
      const guard = makeGuard(true);
      const svc = makeService(prisma, guard);

      await expect(call(svc)).rejects.toBeInstanceOf(BadRequestException);
      expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(TENANT, CD);
      expect(prisma[model][mutateFn]).not.toHaveBeenCalled();
    });

    it("POZİTİF: ACTIVE → mevcut davranış korunur (mutation çağrılır)", async () => {
      const prisma = makePrisma();
      prisma.thirdParty.findFirst.mockResolvedValue({ ...tp });
      const guard = makeGuard(false);
      const svc = makeService(prisma, guard);

      await call(svc);
      expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(TENANT, CD);
      expect(prisma[model][mutateFn]).toHaveBeenCalled();
    });
  });

  // ───────────────────────── ExternalCase writes ─────────────────────────
  describe.each([
    ["updateExternalCase", (s: ThirdPartyService) => s.updateExternalCase(TENANT, "ec1", { notes: "x" }), "update"],
    ["deleteExternalCase", (s: ThirdPartyService) => s.deleteExternalCase(TENANT, "ec1"), "delete"],
  ])("%s (ExternalCase)", (_name, call, mutateFn) => {
    it("NEGATIF: PASSIVE → reddedilir + mutation çağrılmaz + guard doğru caseDebtorId ile çağrılır", async () => {
      const prisma = makePrisma();
      prisma.externalCase.findFirst.mockResolvedValue({ ...ec });
      const guard = makeGuard(true);
      const svc = makeService(prisma, guard);

      await expect(call(svc)).rejects.toBeInstanceOf(BadRequestException);
      expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(TENANT, CD);
      expect(prisma.externalCase[mutateFn]).not.toHaveBeenCalled();
    });

    it("POZİTİF: ACTIVE → mevcut davranış korunur (mutation çağrılır)", async () => {
      const prisma = makePrisma();
      prisma.externalCase.findFirst.mockResolvedValue({ ...ec });
      const guard = makeGuard(false);
      const svc = makeService(prisma, guard);

      await call(svc);
      expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(TENANT, CD);
      expect(prisma.externalCase[mutateFn]).toHaveBeenCalled();
    });
  });

  // ───────────────────────── Historical READ serbest ─────────────────────────
  it("READ: getThirdPartiesForCaseDebtor PASSIVE'de de çalışır + lifecycle guard'a UĞRAMAZ", async () => {
    const prisma = makePrisma();
    prisma.caseDebtor.findFirst.mockResolvedValue({ id: CD, case: { tenantId: TENANT } });
    prisma.thirdParty.findMany.mockResolvedValue([{ id: "tp1" }]);
    const guard = makeGuard(false);
    const svc = makeService(prisma, guard);

    const res = await svc.getThirdPartiesForCaseDebtor(TENANT, CD);
    expect(res).toEqual([{ id: "tp1" }]);
    expect(guard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
  });

  // ─── addExternalCaseCollection: AÇIK ÜRÜN KARARI (late-result) → şu an guard YOK (kasıtlı) ───
  it("KARAKTERİZASYON: addExternalCaseCollection şu an lifecycle guard ÇAĞIRMAZ (tahsilat=late-result, ürün kararı bekliyor)", async () => {
    const prisma = makePrisma();
    prisma.externalCase.findFirst.mockResolvedValue({
      ...ec,
      claimAmount: 100,
      claimCurrency: "TRY",
      attachmentStatus: "HACIZ_TALEP",
      notes: null,
      caseDebtor: { case: { id: "case1" } },
    });
    const guard = makeGuard(false);
    const svc = makeService(prisma, guard);

    await svc.addExternalCaseCollection(TENANT, "ec1", { amount: 50, syncToMainCase: false });
    // Bilinçli: bu metoda Gate-2 guard'ı EKLENMEDİ (finansal late-result; bloklama vs istisna kararı ulas'ta).
    expect(guard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
  });

  // ─── caseDebtorId-bazlı create'ler (zaten guard'lıydı; spec gereği explicit kapsam) ───
  describe("create (ThirdParty) — caseDebtorId üzerinden", () => {
    it("NEGATIF: PASSIVE → reddedilir + thirdParty.create çağrılmaz", async () => {
      const prisma = makePrisma();
      const guard = makeGuard(true);
      const svc = makeService(prisma, guard);

      await expect(
        svc.create(TENANT, CD, { name: "Banka X", type: "BANKA" } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(TENANT, CD);
      expect(prisma.thirdParty.create).not.toHaveBeenCalled();
    });

    it("POZİTİF: ACTIVE → mevcut davranış (create çağrılır)", async () => {
      const prisma = makePrisma();
      prisma.caseDebtor.findFirst.mockResolvedValue({ id: CD, case: { tenantId: TENANT } });
      prisma.thirdParty.findMany.mockResolvedValue([]); // dedup: sibling yok
      const guard = makeGuard(false);
      const svc = makeService(prisma, guard);

      await svc.create(TENANT, CD, { name: "Banka X", type: "BANKA" } as any);
      expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(TENANT, CD);
      expect(prisma.thirdParty.create).toHaveBeenCalled();
    });
  });

  describe("createExternalCase — caseDebtorId üzerinden", () => {
    it("NEGATIF: PASSIVE → reddedilir + externalCase.create çağrılmaz", async () => {
      const prisma = makePrisma();
      const guard = makeGuard(true);
      const svc = makeService(prisma, guard);

      await expect(
        svc.createExternalCase(TENANT, CD, { externalCaseNo: "2024/1", counterpartyName: "Y", claimAmount: 100 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(TENANT, CD);
      expect(prisma.externalCase.create).not.toHaveBeenCalled();
    });

    it("POZİTİF: ACTIVE → mevcut davranış (create çağrılır)", async () => {
      const prisma = makePrisma();
      prisma.caseDebtor.findFirst.mockResolvedValue({ id: CD, case: { tenantId: TENANT } });
      const guard = makeGuard(false);
      const svc = makeService(prisma, guard);

      await svc.createExternalCase(TENANT, CD, { externalCaseNo: "2024/1", counterpartyName: "Y", claimAmount: 100 });
      expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(TENANT, CD);
      expect(prisma.externalCase.create).toHaveBeenCalled();
    });
  });

  // ─── Cross-tenant güvenlik bozulmadı: yabancı kayıt → 404, guard'a inilmez ───
  it("CROSS-TENANT: yabancı thirdPartyId → NotFoundException (lifecycle guard'a İNİLMEZ, mutation YOK)", async () => {
    const prisma = makePrisma();
    prisma.thirdParty.findFirst.mockResolvedValue(null); // findFirst({id, tenantId}) → başka tenant'ta bulunamaz
    const guard = makeGuard(false);
    const svc = makeService(prisma, guard);

    await expect(
      svc.update(TENANT, "foreign-tp", { name: "X" } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(guard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(prisma.thirdParty.update).not.toHaveBeenCalled();
  });

  it("CROSS-TENANT: yabancı externalCaseId → NotFoundException (guard'a İNİLMEZ, mutation YOK)", async () => {
    const prisma = makePrisma();
    prisma.externalCase.findFirst.mockResolvedValue(null);
    const guard = makeGuard(false);
    const svc = makeService(prisma, guard);

    await expect(
      svc.updateExternalCase(TENANT, "foreign-ec", { notes: "x" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(guard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(prisma.externalCase.update).not.toHaveBeenCalled();
  });
});
