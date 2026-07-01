/**
 * Task D1A (owner-locked 2026-07-02, Option B) — DebtorService create/update audit regresyonu.
 * Delete()'in capability-gate + snapshot-audit testleri debtor-delete-case-debtor-preflight.spec.ts
 * dosyasında (doğal ev — 13-katman guard'ı zaten orada test ediliyor). Bu dosya yalnız
 * DEBTOR_CREATE/DEBTOR_UPDATE audit davranışını kapsar (create/update capability-gate'e TABİ
 * DEĞİL — yalnız delete() gate'li, owner kararı).
 */
import { DebtorService } from "../debtor.service";

const TENANT = "t1";
const RAW_TCKN = "10000000146";

function buildHarness(opts: { existing?: any; created?: any; updated?: any } = {}) {
  const prisma: any = {
    debtor: {
      // where.OR → duplicate/dedup sorgusu (null=yok); aksi hâlde findOne (update'in "existing"i).
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where?.OR ? null : (opts.existing ?? null)),
      ),
      findMany: jest.fn().mockResolvedValue([]), // benzer-isim adayları yok
      create: jest.fn().mockResolvedValue(
        opts.created ?? {
          id: "d1",
          type: "INDIVIDUAL",
          firstName: "Ali",
          lastName: "Veli",
          tckn: RAW_TCKN,
          name: "Ali Veli",
          identityNo: RAW_TCKN,
          debtorAddresses: [],
          estateHeirs: [],
        },
      ),
      update: jest.fn().mockResolvedValue(
        opts.updated ?? {
          id: "d1",
          type: "INDIVIDUAL",
          firstName: "Ali",
          lastName: "Yılmaz",
          tckn: RAW_TCKN,
          name: "Ali Yılmaz",
          identityNo: RAW_TCKN,
          debtorAddresses: [],
          estateHeirs: [],
        },
      ),
    },
    task: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) };
  const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
  const svc = new DebtorService(prisma, audit as any, officeApproval as any);
  return { svc, prisma, audit, officeApproval };
}

describe("DebtorService.create — Task D1A DEBTOR_CREATE audit", () => {
  it("başarılı create → DEBTOR_CREATE audit; actor auth-context'ten; capability-gate ÇAĞRILMAZ (create gate'siz)", async () => {
    const { svc, audit, officeApproval } = buildHarness();

    await svc.create(TENANT, { type: "INDIVIDUAL", firstName: "Ali", lastName: "Veli", tckn: RAW_TCKN } as any, {
      userId: "u1",
    });

    expect(audit.log).toHaveBeenCalledTimes(1);
    const call = audit.log.mock.calls[0][0];
    expect(call.tenantId).toBe(TENANT);
    expect(call.action).toBe("DEBTOR_CREATE");
    expect(call.entityType).toBe("DEBTOR");
    expect(call.entityId).toBe("d1");
    expect(call.userId).toBe("u1");
    expect(call.metadata.fieldDiff).toBeTruthy();
    // create() capability-gate'e TABİ DEĞİL (owner kararı: yalnız delete gate'li).
    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
  });

  it("actor verilmezse → userId undefined (body/dto'dan türetilmez), create YİNE BAŞARILI (gate yok)", async () => {
    const { svc, audit } = buildHarness();

    await svc.create(TENANT, { type: "INDIVIDUAL", firstName: "Ali", lastName: "Veli", tckn: RAW_TCKN } as any);

    const call = audit.log.mock.calls[0][0];
    expect(call.userId).toBeUndefined();
  });

  it("ham TCKN audit'e SIZMAZ (KVKK) — yalnız maskelenmiş/digest", async () => {
    const { svc, audit } = buildHarness();

    await svc.create(TENANT, { type: "INDIVIDUAL", firstName: "Ali", lastName: "Veli", tckn: RAW_TCKN } as any, {
      userId: "u1",
    });

    expect(JSON.stringify(audit.log.mock.calls[0][0])).not.toContain(RAW_TCKN);
  });
});

describe("DebtorService.update — Task D1A DEBTOR_UPDATE audit", () => {
  const existing = {
    id: "d1",
    tenantId: TENANT,
    type: "INDIVIDUAL",
    firstName: "Ali",
    lastName: "Veli",
    tckn: RAW_TCKN,
    companyName: null,
    institutionName: null,
    deceasedName: null,
    vkn: null,
    detsisNo: null,
    deceasedTckn: null,
    name: "Ali Veli",
    identityNo: RAW_TCKN,
    debtorAddresses: [],
    estateHeirs: [],
  };

  it("başarılı update → DEBTOR_UPDATE audit; field diff eski/yeni; capability-gate ÇAĞRILMAZ (update gate'siz)", async () => {
    const { svc, audit, officeApproval } = buildHarness({ existing });

    await svc.update(TENANT, "d1", { lastName: "Yılmaz" } as any, { userId: "u2" });

    expect(audit.log).toHaveBeenCalledTimes(1);
    const call = audit.log.mock.calls[0][0];
    expect(call.tenantId).toBe(TENANT);
    expect(call.action).toBe("DEBTOR_UPDATE");
    expect(call.entityType).toBe("DEBTOR");
    expect(call.entityId).toBe("d1");
    expect(call.userId).toBe("u2");
    expect(call.metadata.fieldDiff).toBeTruthy();
    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
  });

  it("ham TCKN/ad-soyad audit'e SIZMAZ (KVKK) — yalnız maskelenmiş/digest", async () => {
    const { svc, audit } = buildHarness({ existing });

    await svc.update(TENANT, "d1", { lastName: "Yılmaz" } as any, { userId: "u2" });

    const json = JSON.stringify(audit.log.mock.calls[0][0]);
    expect(json).not.toContain(RAW_TCKN);
    expect(json).not.toContain("Yılmaz");
  });
});
