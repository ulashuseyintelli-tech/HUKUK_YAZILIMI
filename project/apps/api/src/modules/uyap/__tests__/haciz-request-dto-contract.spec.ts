import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HacizTargetTypeDto, PushHacizRequestDto } from "../dto/haciz-request.dto";

// I15-D1-R1 — OWNER DECISION RATIFIED zorunlu backend test #9 (Missing caseDebtorId → DTO
// reject) ve #11/#12'nin transport-katmanı savunması (body.debtorId / tenantId / userId /
// lawyerId enjeksiyonu forbidNonWhitelisted ile reddedilir). main.ts'teki global ValidationPipe
// ile AYNI ayarlar kullanılır (whitelist:true, forbidNonWhitelisted:true) — bu suite pipe'ın
// gerçek çalışma zamanı davranışını birebir yansıtır.

async function validateDto(input: any) {
  const dto = plainToInstance(PushHacizRequestDto, input);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors };
}

const VALID = {
  caseId: "case-1",
  caseDebtorId: "cd-1",
  targetType: "BANK",
  targetDetails: { assetId: "a1" },
  amount: 1000,
};

function omit(obj: Record<string, any>, key: string) {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe("PushHacizRequestDto (I15-D1-R1 — CASEDEBTOR_TARGET_UNBOUND düzeltmesi)", () => {
  it("TEST-1: tam geçerli payload → hata YOK", async () => {
    const { errors } = await validateDto(VALID);
    expect(errors).toHaveLength(0);
  });

  it("TEST-2 (ZORUNLU BACKEND TEST #9): caseDebtorId eksik → DTO reject", async () => {
    const { errors } = await validateDto(omit(VALID, "caseDebtorId"));
    expect(errors.some((e) => e.property === "caseDebtorId")).toBe(true);
  });

  it("TEST-3: caseDebtorId boş string → DTO reject (IsNotEmpty)", async () => {
    const { errors } = await validateDto({ ...VALID, caseDebtorId: "" });
    expect(errors.some((e) => e.property === "caseDebtorId")).toBe(true);
  });

  it("TEST-4: caseId eksik → DTO reject", async () => {
    const { errors } = await validateDto(omit(VALID, "caseId"));
    expect(errors.some((e) => e.property === "caseId")).toBe(true);
  });

  it("TEST-5: targetType enum dışı değer → DTO reject", async () => {
    const { errors } = await validateDto({ ...VALID, targetType: "UYDURMA_TIP" });
    expect(errors.some((e) => e.property === "targetType")).toBe(true);
  });

  it.each(Object.values(HacizTargetTypeDto))("TEST-6.%s: geçerli targetType enum değeri → hata YOK", async (t) => {
    const { errors } = await validateDto({ ...VALID, targetType: t });
    expect(errors).toHaveLength(0);
  });

  it("TEST-7: amount negatif → DTO reject (IsPositive)", async () => {
    const { errors } = await validateDto({ ...VALID, amount: -100 });
    expect(errors.some((e) => e.property === "amount")).toBe(true);
  });

  it("TEST-8: amount sayı olmayan string → DTO reject", async () => {
    const { errors } = await validateDto({ ...VALID, amount: "bin-lira" });
    expect(errors.some((e) => e.property === "amount")).toBe(true);
  });

  it("TEST-9: targetDetails object değil → DTO reject", async () => {
    const { errors } = await validateDto({ ...VALID, targetDetails: "not-an-object" });
    expect(errors.some((e) => e.property === "targetDetails")).toBe(true);
  });

  // ZORUNLU BACKEND TEST #11/#12: body.debtorId / tenantId / userId / lawyerId artık DTO'da
  // TANIMLI DEĞİL — global pipe forbidNonWhitelisted:true ile bu alanlar authority'ye
  // ulaşamadan reddedilir (whitelist-dışı alan enjeksiyonu).
  it.each(["debtorId", "tenantId", "userId", "lawyerId", "clientId"])(
    "TEST-10.%s: whitelist-dışı '%s' alanı enjeksiyonu → DTO reject (forbidNonWhitelisted)",
    async (field) => {
      const { errors } = await validateDto({ ...VALID, [field]: "enjekte-edilmis-deger" });
      expect(errors.length).toBeGreaterThan(0);
    },
  );
});
