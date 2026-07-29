/**
 * DEBTOR-SERVICE-ATTEMPT-ADDRESS-OWNERSHIP-P1-I06 — bulgu DEBTOR-IDOR-01
 *
 * ÖNCEKİ DURUM (bu PR'dan önce):
 *   - `startNewServiceAttempt` içinde `newAddressId` HİÇBİR sahiplik/varlık
 *     kontrolünden geçmeden `selectedAddressId`'ye yazılıyordu;
 *   - FK yalnız adresin varlığını garanti ediyordu: cross-tenant GERÇEK bir id
 *     sessizce BAŞARILI olurken var olmayan id FK ihlaliyle (P2003 → 500)
 *     patlıyordu — hem IDOR hem varlık oracle'ı.
 *
 * SONRAKİ DURUM: adres sahipliği (id + hedef debtor + authenticated tenant)
 * herhangi bir yazımdan ÖNCE, aynı transaction içinde fail-closed doğrulanır;
 * üç red senaryosu (cross-tenant / başka borçlu / yok) dışarıya AYNI hatayı üretir.
 *
 * Fake prisma where-yüklemlerini GERÇEKTEN uygular: herhangi bir predicate
 * koddan kaldırılırsa (mutation check M1-M5) ilgili test kırmızıya döner.
 */

import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DebtorService } from "../debtor.service";
import { DebtorController } from "../debtor.controller";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";
const CASE_ID = "case-1";
const CASE_DEBTOR_ID = "cd-1";
const USER_ID = "user-1";

/** Adres tablosu — tenant yüklemini BAĞIMSIZ yük taşıyıcı yapan anomali satırı dahil. */
const ADDRESS_TABLE = [
  { id: "addr-own", debtorId: "debtor-1", debtor: { tenantId: TENANT_A } },
  { id: "addr-own-2", debtorId: "debtor-1", debtor: { tenantId: TENANT_A } },
  // Aynı tenant, BAŞKA borçlunun adresi:
  { id: "addr-other-debtor", debtorId: "debtor-2", debtor: { tenantId: TENANT_A } },
  // debtorId çakışan ama BAŞKA tenant'a ait anomali satırı — yalnız debtorId
  // yüklemiyle yakalanamaz; tenant yüklemi kaldırılırsa bu satır sızar (M1):
  { id: "addr-foreign", debtorId: "debtor-1", debtor: { tenantId: TENANT_B } },
];

function caseDebtorRow(overrides: Record<string, any> = {}) {
  return {
    id: CASE_DEBTOR_ID,
    caseId: CASE_ID,
    debtorId: "debtor-1",
    selectedAddressId: "addr-own",
    serviceStatus: "RETURNED",
    case: { tenantId: TENANT_A },
    ...overrides,
  };
}

function activeGuard() {
  return { assertActiveByCaseDebtorId: jest.fn().mockResolvedValue(undefined) };
}

/**
 * Fake'ler where-yüklemlerini uygular:
 *  - caseDebtor.findFirst: id + caseId + case.tenantId (M3 duyarlılığı)
 *  - tx.debtorAddress.findFirst: id + debtorId + debtor.tenantId (M1/M2 duyarlılığı)
 * Kök prisma'da debtorAddress BİLEREK YOK: kod sahiplik kontrolünü tx dışına
 * taşırsa TypeError ile düşer (kontrol-aynı-transaction yapısal kanıtı).
 */
function build(guard = activeGuard(), row: Record<string, any> | null = caseDebtorRow()) {
  const tx = {
    debtorAddress: {
      findFirst: jest.fn(async ({ where }: any) => {
        const found = ADDRESS_TABLE.find(
          (a) =>
            a.id === where.id &&
            (where.debtorId === undefined || a.debtorId === where.debtorId) &&
            (where.debtor?.tenantId === undefined ||
              a.debtor.tenantId === where.debtor.tenantId),
        );
        return found ? { id: found.id } : null;
      }),
    },
    serviceHistory: { create: jest.fn().mockResolvedValue({}) },
    caseDebtor: { update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    caseDebtor: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (!row) return null;
        const tenantOk =
          where.case?.tenantId === undefined || row.case.tenantId === where.case.tenantId;
        const ok = row.id === where.id && row.caseId === where.caseId && tenantOk;
        return ok ? { ...row } : null;
      }),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };

  const service = new DebtorService(
    prisma as any,
    {
      logInTransaction: jest.fn().mockResolvedValue(undefined),
      log: jest.fn().mockResolvedValue(undefined),
    } as any,
    {} as any,
    guard as any,
  );
  jest.spyOn(service, "getCaseDebtorDetail").mockResolvedValue({ id: CASE_DEBTOR_ID } as any);

  return { service, prisma, tx, guard };
}

const CONTROLLER_SRC = fs.readFileSync(
  path.join(__dirname, "..", "debtor.controller.ts"),
  "utf8",
);

// ============================================================
// AUTH / TENANT AUTHORITY
// ============================================================
describe("I06 · authentication ve tenant authority", () => {
  it("DebtorController sınıf-seviyesi JwtAuthGuard taşır (kimliksiz istek reddedilir)", () => {
    const guards = Reflect.getMetadata("__guards__", DebtorController) || [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it("retry ucu tenant'ı YALNIZ principal'dan alır; body'den authority okunmaz", () => {
    // Route body'den okunan tek alan newAddressId'dir; controller'da body tenant yok.
    expect(CONTROLLER_SRC).toMatch(/@Body\("newAddressId"\)/);
    expect(CONTROLLER_SRC).not.toMatch(/@Body\("tenantId"\)/);
    expect(CONTROLLER_SRC).toMatch(/@CurrentUser\("tenantId"\)/);
  });

  it("principal tenant boş ise FAIL-CLOSED (sorgu eşleşmez, yazım olmaz)", async () => {
    const { service, prisma, tx } = build();
    await expect(
      service.startNewServiceAttempt("", CASE_ID, CASE_DEBTOR_ID, USER_ID, "addr-own-2"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.serviceHistory.create).not.toHaveBeenCalled();
    expect(tx.caseDebtor.update).not.toHaveBeenCalled();
  });

  it("cross-tenant caseDebtor FAIL-CLOSED (M3: case.tenantId yüklemi yük taşır)", async () => {
    const { service, prisma, tx } = build();
    await expect(
      service.startNewServiceAttempt(TENANT_B, CASE_ID, CASE_DEBTOR_ID, USER_ID, "addr-own-2"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.caseDebtor.update).not.toHaveBeenCalled();
  });

  it("lifecycle guard reddi yazımdan ÖNCE durdurur", async () => {
    const guard = {
      assertActiveByCaseDebtorId: jest
        .fn()
        .mockRejectedValue(new BadRequestException("Pasif dosya borçlusu")),
    };
    const { service, prisma, tx } = build(guard);
    await expect(
      service.startNewServiceAttempt(TENANT_A, CASE_ID, CASE_DEBTOR_ID, USER_ID, "addr-own-2"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.serviceHistory.create).not.toHaveBeenCalled();
  });
});

// ============================================================
// ADDRESS OWNERSHIP — FAIL-CLOSED + HATA EŞİTLİĞİ
// ============================================================
describe("I06 · adres sahipliği fail-closed", () => {
  const denyCase = async (addressId: string) => {
    const { service, tx } = build();
    const err = await service
      .startNewServiceAttempt(TENANT_A, CASE_ID, CASE_DEBTOR_ID, USER_ID, addressId)
      .catch((e) => e);
    return { err, tx };
  };

  it("geçerli adres (aynı tenant + aynı borçlu) KABUL edilir ve yazılır", async () => {
    const { service, tx } = build();
    await service.startNewServiceAttempt(TENANT_A, CASE_ID, CASE_DEBTOR_ID, USER_ID, "addr-own-2");
    expect(tx.serviceHistory.create).toHaveBeenCalledTimes(1);
    expect(tx.caseDebtor.update).toHaveBeenCalledTimes(1);
    expect(tx.caseDebtor.update.mock.calls[0][0].data).toMatchObject({
      serviceStatus: "READY",
      trackingNo: null,
      selectedAddressId: "addr-own-2",
    });
  });

  it("var olmayan adres REDDEDİLİR; hiçbir yazım oluşmaz", async () => {
    const { err, tx } = await denyCase("addr-yok");
    expect(err).toBeInstanceOf(NotFoundException);
    expect(tx.serviceHistory.create).not.toHaveBeenCalled();
    expect(tx.caseDebtor.update).not.toHaveBeenCalled();
  });

  it("cross-tenant adres REDDEDİLİR (M1: debtor.tenantId yüklemi yük taşır)", async () => {
    // addr-foreign: debtorId AYNI (debtor-1) ama tenant-B — yalnız debtorId
    // yüklemi bu satırı yakalayamaz; tenant yüklemi kaldırılırsa test düşer.
    const { err, tx } = await denyCase("addr-foreign");
    expect(err).toBeInstanceOf(NotFoundException);
    expect(tx.serviceHistory.create).not.toHaveBeenCalled();
    expect(tx.caseDebtor.update).not.toHaveBeenCalled();
  });

  it("aynı tenant'ta BAŞKA borçlunun adresi REDDEDİLİR (M2: debtorId yüklemi yük taşır)", async () => {
    const { err, tx } = await denyCase("addr-other-debtor");
    expect(err).toBeInstanceOf(NotFoundException);
    expect(tx.serviceHistory.create).not.toHaveBeenCalled();
    expect(tx.caseDebtor.update).not.toHaveBeenCalled();
  });

  it("üç red senaryosu dışarıya AYNI hatayı üretir (varlık sızıntısı yok)", async () => {
    const nonexistent = (await denyCase("addr-yok")).err;
    const crossTenant = (await denyCase("addr-foreign")).err;
    const otherDebtor = (await denyCase("addr-other-debtor")).err;
    for (const e of [nonexistent, crossTenant, otherDebtor]) {
      expect(e).toBeInstanceOf(NotFoundException);
    }
    expect(crossTenant.message).toBe(nonexistent.message);
    expect(otherDebtor.message).toBe(nonexistent.message);
    // Kanonik kardeş yol (setActiveAddress) ile aynı sözleşme metni:
    expect(nonexistent.message).toBe("Adres bulunamadı veya bu borçluya ait değil");
  });

  it("newAddressId YOKSA sahiplik sorgusu çalışmaz, mevcut adres korunur (M4)", async () => {
    const { service, tx } = build();
    await service.startNewServiceAttempt(TENANT_A, CASE_ID, CASE_DEBTOR_ID, USER_ID, undefined);
    expect(tx.debtorAddress.findFirst).not.toHaveBeenCalled();
    expect(tx.caseDebtor.update.mock.calls[0][0].data.selectedAddressId).toBe("addr-own");
  });
});

// ============================================================
// MUTATION ORDER + STATE SÖZLEŞMESİ
// ============================================================
describe("I06 · mutasyon sırası ve state sözleşmesi", () => {
  it("sahiplik kontrolü her yazımdan ÖNCE ve AYNI transaction içinde çalışır (M5)", async () => {
    const { service, tx } = build();
    await service.startNewServiceAttempt(TENANT_A, CASE_ID, CASE_DEBTOR_ID, USER_ID, "addr-own-2");
    const addrOrder = tx.debtorAddress.findFirst.mock.invocationCallOrder[0];
    const historyOrder = tx.serviceHistory.create.mock.invocationCallOrder[0];
    const updateOrder = tx.caseDebtor.update.mock.invocationCallOrder[0];
    expect(addrOrder).toBeLessThan(historyOrder);
    expect(addrOrder).toBeLessThan(updateOrder);
    // Kontrolün tx client'ında yürüdüğü yapısaldır: kök prisma'da debtorAddress yok;
    // kod this.prisma.debtorAddress kullansaydı bu test TypeError ile düşerdi.
  });

  it("RETURNED/FAILED dışındaki durumdan başlatma REDDEDİLİR (mevcut sözleşme korunur)", async () => {
    const { service, prisma } = build(activeGuard(), caseDebtorRow({ serviceStatus: "SENT" }));
    await expect(
      service.startNewServiceAttempt(TENANT_A, CASE_ID, CASE_DEBTOR_ID, USER_ID, "addr-own-2"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("FAILED durumundan başlatma kabul edilir (regresyon)", async () => {
    const { service, tx } = build(activeGuard(), caseDebtorRow({ serviceStatus: "FAILED" }));
    await service.startNewServiceAttempt(TENANT_A, CASE_ID, CASE_DEBTOR_ID, USER_ID, undefined);
    expect(tx.caseDebtor.update).toHaveBeenCalledTimes(1);
  });
});
