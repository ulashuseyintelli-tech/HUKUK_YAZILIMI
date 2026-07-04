import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DebtorService } from "./debtor.service";

/**
 * GATE-3 — PASSIVE WRITER SWEEP (DebtorService.updateQuickNote).
 *
 * Sweep bulgusu: caseDebtor write yüzeyi büyük ölçüde guard'lı (Gate-1/2 + önceki adopsiyon);
 * geriye kalan TEK temiz (sonuç-kaydı OLMAYAN) operasyonel write = updateQuickNote (avukat kısa notu).
 * updateCaseDebtor/updateServiceStatus pasif-bloğunun ikizi olarak guard eklendi.
 *
 * Ürün kuralı: PASSIVE CaseDebtor → operasyonel not yazımı reddedilir; ACTIVE korunur;
 * cross-tenant güvenliği bozulmaz; tarihsel read (detay görünümünde quickNote okuma) DOKUNULMADI.
 *
 * Saf birim test (DB yok): prisma + lifecycle guard mock'lanır.
 */
describe("DebtorService.updateQuickNote — Gate-3 passive writer hardening", () => {
  const TENANT = "t1";
  const CASE = "case1";
  const CD = "cd1";

  function makePrisma() {
    return {
      caseDebtor: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({
          quickNote: "not",
          quickNoteUpdatedAt: new Date("2026-01-01T00:00:00Z"),
        }),
      },
    } as any;
  }

  function makeGuard(passive: boolean) {
    return {
      assertActiveByCaseDebtorId: passive
        ? jest.fn().mockRejectedValue(
            new BadRequestException("Pasif dosya borçlusu yeni operasyon hedefi olamaz."),
          )
        : jest.fn().mockResolvedValue({ id: CD, lifecycleStatus: "ACTIVE" }),
    } as any;
  }

  function makeSvc(prisma: any, guard: any) {
    // DebtorService(prisma, audit, officeApproval, caseDebtorLifecycleGuard?) — updateQuickNote
    // yalnız prisma+guard kullanır; audit/officeApproval Task D1A ile eklenen placeholder.
    return new DebtorService(
      prisma,
      { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      guard,
    );
  }

  it("NEGATIF: PASSIVE → reddedilir + caseDebtor.update ÇAĞRILMAZ + guard doğru (caseDebtorId, expectedCaseId)", async () => {
    const prisma = makePrisma();
    prisma.caseDebtor.findFirst.mockResolvedValue({ id: CD });
    const guard = makeGuard(true);
    const svc = makeSvc(prisma, guard);

    await expect(
      svc.updateQuickNote(TENANT, CASE, CD, "u1", "yeni not"),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(TENANT, CD, { expectedCaseId: CASE });
    expect(prisma.caseDebtor.update).not.toHaveBeenCalled();
  });

  it("POZİTİF: ACTIVE → mevcut davranış korunur (update çağrılır + { quickNote, updatedAt } döner)", async () => {
    const prisma = makePrisma();
    prisma.caseDebtor.findFirst.mockResolvedValue({ id: CD });
    const guard = makeGuard(false);
    const svc = makeSvc(prisma, guard);

    const res = await svc.updateQuickNote(TENANT, CASE, CD, "u1", "yeni not");

    expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(TENANT, CD, { expectedCaseId: CASE });
    expect(prisma.caseDebtor.update).toHaveBeenCalled();
    expect(res.quickNote).toBe("not");
  });

  it("CROSS-TENANT: yabancı caseDebtor (findFirst null) → NotFoundException; lifecycle guard'a İNİLMEZ, update YOK", async () => {
    const prisma = makePrisma();
    prisma.caseDebtor.findFirst.mockResolvedValue(null); // başka tenant/case → bulunamaz (tenant zinciri korunur)
    const guard = makeGuard(false);
    const svc = makeSvc(prisma, guard);

    await expect(
      svc.updateQuickNote(TENANT, CASE, CD, "u1", "yeni not"),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(guard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(prisma.caseDebtor.update).not.toHaveBeenCalled();
  });
});
