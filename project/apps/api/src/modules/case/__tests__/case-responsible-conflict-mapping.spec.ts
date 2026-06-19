/**
 * PR-C-FU — toCaseLawyerConflict: CaseLawyer P2002'sini doğru HTTP sınıfına eşle.
 *
 * Canlı doğrulama (PR-C): Prisma, sorumlu partial unique index (case_lawyer_one_responsible_per_case)
 * için P2002 meta.target'ını KOLON raporlar = ["caseId"] (index ADI DEĞİL). Bu yüzden:
 *   target ["caseId"]            → 409 ConflictException (sorumlu çakışması)
 *   target ["caseId","lawyerId"] → 400 BadRequestException (avukat zaten ekli)
 *   target index-adı (substring) → 409 (belt-and-suspenders; başka Prisma sürümü adı raporlarsa)
 *   diğer P2002 / P2002-olmayan  → AYNEN geri döner (rethrow; yutulmaz)
 */
import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CaseService } from "../case.service";

const makeService = () => {
  const stub = {} as any;
  return new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
};

const p2002 = (target: unknown) =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  } as any);

describe("PR-C-FU toCaseLawyerConflict — P2002 sınıflandırma", () => {
  const service = makeService();
  const map = (e: unknown) => (service as any).toCaseLawyerConflict(e) as Error;

  it('sorumlu index target=["caseId"] → 409 ConflictException', () => {
    expect(map(p2002(["caseId"]))).toBeInstanceOf(ConflictException);
  });

  it('caseId+lawyerId target=["caseId","lawyerId"] → 400 BadRequestException', () => {
    expect(map(p2002(["caseId", "lawyerId"]))).toBeInstanceOf(BadRequestException);
  });

  it("index adı (substring, belt-and-suspenders) → 409 ConflictException", () => {
    expect(map(p2002("case_lawyer_one_responsible_per_case"))).toBeInstanceOf(ConflictException);
    expect(map(p2002(["case_lawyer_one_responsible_per_case"]))).toBeInstanceOf(ConflictException);
  });

  it("alakasız P2002 (tenant+fileNumber) → AYNEN geri döner (Conflict/BadRequest DEĞİL)", () => {
    const err = p2002(["tenantId", "fileNumber"]);
    const out = map(err);
    expect(out).toBe(err);
    expect(out).not.toBeInstanceOf(ConflictException);
    expect(out).not.toBeInstanceOf(BadRequestException);
  });

  it("P2002 olmayan hata → AYNEN geri döner", () => {
    const err = new Error("boom");
    expect(map(err)).toBe(err);
  });
});
