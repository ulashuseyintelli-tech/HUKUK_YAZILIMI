import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { UpdateExternalCaseDto } from "../dto/third-party.dto";
import { ThirdPartyService } from "../third-party.service";

// I15 Phase C: updateExternalCase() daha once `dto: any` idi — hicbir DTO/
// class-validator yoktu (owner envanter talebi: "broad dto:any ve generic
// attachmentStatus mutation yuzeyi"). Bu suite iki ayri katmani kanitlar:
// (1) UpdateExternalCaseDto'nun class-validator seviyesinde dogru reddettigini
//     (global ValidationPipe ile AYNI whitelist/forbidNonWhitelisted ayarlariyla),
// (2) ThirdPartyService.updateExternalCase()'in externalOffice/externalCaseNo
//     mantiksal-kimlik cakismasinda P2002'yi Phase A'nin idempotent-replay
//     deseniyle DEGIL, temiz bir ConflictException ile reddettigini (update'te
//     baska bir satiri sessizce donmek veri-butunlugu ihlali olurdu).

async function validateDto(input: any) {
  const dto = plainToInstance(UpdateExternalCaseDto, input);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors };
}

describe("UpdateExternalCaseDto (I15 Phase C)", () => {
  it("TEST-1: boş payload ({}) → hata YOK (partial update, tüm alanlar optional)", async () => {
    const { errors } = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it("TEST-2: yalnız notes → hata YOK", async () => {
    const { errors } = await validateDto({ notes: "x" });
    expect(errors).toHaveLength(0);
  });

  // DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02 (OWNER-RATIFIED): attachmentStatus
  // UpdateExternalCaseDto'dan KALDIRILDI — durum artık yalnız Transition/CloseExternalCaseDto
  // üzerinden, actor-authority + CAS ile değişir. Bu 2 test o kaldırmanın regresyon-koruma
  // kanıtıdır (eskiden burada "geçerli enum → hata YOK" / "geçersiz enum → hata" testleri vardı;
  // artık alanın KENDİSİ whitelist-dışı sayılmalı).
  it.each(["HACIZ_TALEP", "HACIZ_KONDU", "CEVAP_BEKLENIYOR", "TAHSIL_BASLADI", "KAPANDI"])(
    "TEST-3.%s: attachmentStatus=%s artık whitelist-dışı — forbidNonWhitelisted hatası üretir",
    async (status) => {
      const { errors } = await validateDto({ attachmentStatus: status });
      expect(errors.length).toBeGreaterThan(0);
    },
  );

  it("TEST-4: attachmentStatus geçerli diğer alanlarla birlikte gönderilse bile tüm payload reddedilir", async () => {
    const { errors } = await validateDto({ notes: "geçerli metadata", attachmentStatus: "HACIZ_KONDU" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("TEST-5: bilinmeyen/whitelist-dışı alan (forbidNonWhitelisted) → hata", async () => {
    const { errors } = await validateDto({ tenantId: "baska-tenant-enjekte" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("TEST-6: claimAmount sayı olmayan string → hata", async () => {
    const { errors } = await validateDto({ claimAmount: "bin-lira" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("TEST-7: claimAmount geçerli sayı → hata YOK", async () => {
    const { errors } = await validateDto({ claimAmount: 1500.5 });
    expect(errors).toHaveLength(0);
  });

  it("TEST-8: attachedAt geçersiz tarih string → hata", async () => {
    const { errors } = await validateDto({ attachedAt: "bugun-degil-bir-tarih" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("TEST-9: attachedAt geçerli ISO tarih → hata YOK", async () => {
    const { errors } = await validateDto({ attachedAt: "2026-01-15T00:00:00.000Z" });
    expect(errors).toHaveLength(0);
  });

  it("TEST-10: externalOffice/externalCaseNo birlikte geçerli string → hata YOK", async () => {
    const { errors } = await validateDto({ externalOffice: "Ankara 5. İcra", externalCaseNo: "2026/123" });
    expect(errors).toHaveLength(0);
  });
});

describe("ThirdPartyService.updateExternalCase() (I15 Phase C)", () => {
  const TENANT = "t1";
  const CD = "cd1";
  const EC = "ec1";

  function makePrisma(opts: { updateRejectsWith?: unknown } = {}) {
    return {
      externalCase: {
        findFirst: jest.fn().mockResolvedValue({ id: EC, tenantId: TENANT, caseDebtorId: CD, receivedAmount: 0 }),
        update: opts.updateRejectsWith
          ? jest.fn().mockRejectedValue(opts.updateRejectsWith)
          : jest.fn().mockResolvedValue({ id: EC, tenantId: TENANT, caseDebtorId: CD }),
      },
    } as any;
  }

  function makeGuard() {
    return { assertActiveByCaseDebtorId: jest.fn().mockResolvedValue({ id: CD, lifecycleStatus: "ACTIVE" }) } as any;
  }

  function makeService(prisma: any, guard: any) {
    return new ThirdPartyService(prisma, { create: jest.fn() } as any, guard, {} as any);
  }

  function makeP2002() {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.22.0",
      meta: { target: ["tenantId", "caseDebtorId", "externalOffice", "externalCaseNo"] },
    });
  }

  it("TEST-11: geçerli update başarıyla uygulanır (mevcut davranış korunur)", async () => {
    const prisma = makePrisma();
    const guard = makeGuard();
    const svc = makeService(prisma, guard);

    const result = await svc.updateExternalCase(TENANT, EC, { notes: "güncellendi" } as UpdateExternalCaseDto);

    expect(guard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(TENANT, CD);
    expect(prisma.externalCase.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: EC } }),
    );
    expect(result).toEqual({ id: EC, tenantId: TENANT, caseDebtorId: CD });
  });

  it("TEST-12: externalOffice/externalCaseNo çakışması (P2002) → ConflictException (başka satır SESSİZCE dönülmez)", async () => {
    const prisma = makePrisma({ updateRejectsWith: makeP2002() });
    const guard = makeGuard();
    const svc = makeService(prisma, guard);

    await expect(
      svc.updateExternalCase(TENANT, EC, {
        externalOffice: "Başka İcra Dairesi",
        externalCaseNo: "2026/999",
      } as UpdateExternalCaseDto),
    ).rejects.toBeInstanceOf(ConflictException);
    // findUnique/findFirst ile BAŞKA satır aranıp sessizce dönülmediğini kanıtlar:
    expect(prisma.externalCase.findFirst).toHaveBeenCalledTimes(1); // yalnız on-kontrol çağrısı
  });

  it("TEST-13: non-P2002 hata (örn. P2025 kayıt bulunamadı) hiç yakalanmadan doğrudan fırlatılır", async () => {
    const notFoundErr = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "5.22.0",
    });
    const prisma = makePrisma({ updateRejectsWith: notFoundErr });
    const guard = makeGuard();
    const svc = makeService(prisma, guard);

    await expect(
      svc.updateExternalCase(TENANT, EC, { notes: "x" } as UpdateExternalCaseDto),
    ).rejects.toBe(notFoundErr);
  });

  it("TEST-14: externalCaseId yabancı tenant/yok → NotFoundException, guard hiç çağrılmaz, update denenmez", async () => {
    const prisma = makePrisma();
    prisma.externalCase.findFirst.mockResolvedValue(null);
    const guard = makeGuard();
    const svc = makeService(prisma, guard);

    await expect(
      svc.updateExternalCase(TENANT, "yabanci-ec", { notes: "x" } as UpdateExternalCaseDto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(guard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(prisma.externalCase.update).not.toHaveBeenCalled();
  });
});
