/**
 * PR-A (ASSIGN-4b-DB) — partial unique index ÖN-HAZIRLIĞI:
 *  1) clear-before-set: sorumlu SET edilmeden ÖNCE diğer sorumlular düşürülür (geçici 2-true yok)
 *     → updateCaseLawyer: demote, target-update'ten ÖNCE · addCaseLawyer: demote, create'ten ÖNCE.
 *  2) dormant P2002→409: YALNIZ `case_lawyer_one_responsible_per_case` index'i 409'a çevrilir;
 *     başka tüm P2002/unique ihlalleri AYNEN rethrow (Ulaş şartı #2).
 *  3) fix-case-lawyer-roles.ts EMEKLİ (hard-fail).
 *
 * NOT: "tam 1 sorumlu" END-STATE'i case-responsible-invariant.spec'te kanıtlanır (reorder onu BOZMAZ);
 * burada yalnız index-güvenli SIRA + dormant 409 + deprecate kanıtlanır.
 */
import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CaseService } from "../case.service";
import { main as fixRolesMain, RETIREMENT_NOTICE } from "../../../scripts/fix-case-lawyer-roles";

const makeService = () => {
  const stub = {} as any;
  return new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
};

describe("PR-A clear-before-set — updateCaseLawyer: demote ÖNCE, target SET SONRA", () => {
  it("hedef sorumlu yapılırken demote(cl-0), target(cl-1) güncellemesinden ÖNCE çağrılır", async () => {
    const service = makeService();
    const order: string[] = [];
    const txUpdate = jest.fn(async ({ where, data }: any) => {
      order.push(where.id);
      return {
        id: where.id,
        role: data.role ?? "ASSIGNED",
        casePermissions: null,
        ...data,
        lawyer: { id: "l", name: "A", surname: "B", barNumber: "1", lawyerRank: "LAWYER" },
      };
    });
    (service as any).prisma = {
      case: { findFirst: jest.fn(async () => ({ id: "case-1", tenantId: "t1" })) },
      caseLawyer: {
        findFirst: jest.fn(async () => ({
          id: "cl-1",
          caseId: "case-1",
          isResponsible: false,
          lawyer: { name: "A", surname: "B" },
        })),
        findMany: jest.fn(async () => [
          { id: "cl-0", isResponsible: true },
          { id: "cl-1", isResponsible: false },
        ]),
      },
      $transaction: jest.fn(async (cb: any) => cb({ caseLawyer: { update: txUpdate } })),
    };
    (service as any).auditService = { log: jest.fn(async () => undefined) };

    await (service as any).updateCaseLawyer("t1", "case-1", "cl-1", { role: "RESPONSIBLE" });

    // clear-before-set: önce eski sorumlu (cl-0) düşer, SONRA hedef (cl-1) sorumlu olur.
    expect(order).toEqual(["cl-0", "cl-1"]);
  });
});

describe("PR-A clear-before-set — addCaseLawyer: demote ÖNCE, create SONRA", () => {
  it("yeni sorumlu eklenirken demote(update), create'ten ÖNCE çağrılır", async () => {
    const service = makeService();
    const txCreate = jest.fn(async ({ data }: any) => ({
      id: "cl-new",
      ...data,
      lawyer: { id: data.lawyerId, name: "Y", surname: "A", barNumber: "9", lawyerRank: "PARTNER" },
    }));
    const txUpdate = jest.fn(async () => ({}));
    const txFindMany = jest.fn(async () => [{ id: "cl-0" }]);
    (service as any).prisma = {
      case: { findFirst: jest.fn(async () => ({ id: "case-1", tenantId: "t1" })) },
      lawyer: { findFirst: jest.fn(async () => ({ id: "law-1", tenantId: "t1", lawyerRank: "PARTNER" })) },
      caseLawyer: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (cb: any) =>
        cb({ caseLawyer: { create: txCreate, findMany: txFindMany, update: txUpdate } }),
      ),
    };
    (service as any).auditService = { log: jest.fn(async () => undefined) };

    await (service as any).addCaseLawyer("t1", "case-1", { lawyerId: "law-1", role: "RESPONSIBLE" });

    // demote (update) create'ten ÖNCE: geçici 2-true olmaz.
    expect(txUpdate).toHaveBeenCalledWith({ where: { id: "cl-0" }, data: { isResponsible: false, role: "ASSIGNED" } });
    expect(txCreate).toHaveBeenCalled();
    expect(txUpdate.mock.invocationCallOrder[0]).toBeLessThan(txCreate.mock.invocationCallOrder[0]);
  });
});

describe("PR-A dormant P2002→409 — SADECE sorumlu-index çevrilir, gerisi rethrow (Ulaş şartı #2)", () => {
  const service = makeService();
  const mkP2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target },
    } as any);

  it("sorumlu-index adı (string) → ConflictException(409)", () => {
    expect(() =>
      (service as any).translateResponsibleConflict(mkP2002("case_lawyer_one_responsible_per_case")),
    ).toThrow(ConflictException);
  });

  it("sorumlu-index adı (alan listesinde) → ConflictException(409)", () => {
    expect(() =>
      (service as any).translateResponsibleConflict(mkP2002(["case_lawyer_one_responsible_per_case"])),
    ).toThrow(ConflictException);
  });

  it("caseId+lawyerId unique P2002 → AYNEN rethrow (ConflictException DEĞİL)", () => {
    const err = mkP2002(["caseId", "lawyerId"]);
    expect(() => (service as any).translateResponsibleConflict(err)).toThrow(err);
    expect(() => (service as any).translateResponsibleConflict(err)).not.toThrow(ConflictException);
  });

  it("tenant+fileNumber unique P2002 → AYNEN rethrow", () => {
    const err = mkP2002(["tenantId", "fileNumber"]);
    expect(() => (service as any).translateResponsibleConflict(err)).toThrow(err);
  });

  it("P2002 olmayan hata → AYNEN rethrow", () => {
    const err = new Error("boom");
    expect(() => (service as any).translateResponsibleConflict(err)).toThrow(err);
  });
});

describe("PR-A — fix-case-lawyer-roles.ts EMEKLİ (hard-fail)", () => {
  it("main() → process.exit(1) + emeklilik uyarısı (DB yazımı yok)", () => {
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const run: () => void = fixRolesMain; // () => never'ı void olarak çağır (sonraki satırlar erişilebilir kalsın)
    run();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy).toHaveBeenCalledWith(RETIREMENT_NOTICE);
    expect(RETIREMENT_NOTICE).toMatch(/EMEKL/i);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
