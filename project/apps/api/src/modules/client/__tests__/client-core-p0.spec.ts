/**
 * P0.4–P0.7 — Client-core low-risk patch testleri (Task 1).
 * - P0.5 tenant-scoped write: update/remove `updateMany {id,tenantId}`; eşleşme yoksa NotFoundException.
 * - P0.7 create/update map parity: create'te map'lenip update'te DÜŞEN alanlar (postalCode, isForeigner,
 *   nationality, companyType, mersisNo, ticaretSicilNo, gender, detsisNo) artık update payload'unda.
 * (P0.4 HTTP error contract = controller seviyesinde hata yutma kaldırıldı; servis NotFoundException
 *  fırlatır, controller try/catch'siz propagate eder.)
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ClientService } from "../client.service";

function buildHarness(
  opts: { existing?: any; updateCount?: number; updated?: any; officeApprovalEligible?: boolean } = {},
) {
  const tx = {
    client: {
      create: jest.fn().mockResolvedValue({ id: "c1" }),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
      findFirst: jest.fn().mockResolvedValue(opts.updated ?? { id: "c1", isActive: true }),
    },
    clientContact: { createMany: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockResolvedValue(
        opts.existing ?? { id: "c1", tenantId: "t1", isActive: true, contacts: [] },
      ),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
  // Task 8A: OfficeApprovalService.isApproverEligible — varsayılan eligible:true (mevcut testler
  // capability'yi bilmez, bozulmasın); yalnız ineligible senaryosu explicit false geçer.
  const officeApproval = {
    isApproverEligible: jest.fn().mockResolvedValue(opts.officeApprovalEligible ?? true),
  };
  const svc = new ClientService(prisma, audit as any, officeApproval as any);
  jest.spyOn(svc as any, "syncContactFollowUpTaskSafe").mockResolvedValue(undefined);
  return { svc, prisma, tx, audit, officeApproval };
}

describe("ClientService.update — P0.5 tenant-scoped + P0.7 parity", () => {
  it("P0.5: updateMany where {id, tenantId} ile yazar (tenant-scoped write)", async () => {
    const { svc, tx } = buildHarness();
    await svc.update("c1", "t1", { type: "PERSON", firstName: "A", lastName: "B" }, { userId: "u1" });
    expect(tx.client.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.client.updateMany.mock.calls[0][0].where).toEqual({ id: "c1", tenantId: "t1" });
  });

  it("P0.7: create'te map'lenen 8 alan update payload'unda taşınır (sessiz veri kaybı yok)", async () => {
    const { svc, tx } = buildHarness();
    await svc.update(
      "c1",
      "t1",
      {
        type: "COMPANY",
        companyName: "ACME",
        postalCode: "34000",
        isForeigner: true,
        nationality: "Alman",
        companyType: "Anonim",
        mersisNo: "M1",
        ticaretSicilNo: "TS1",
        gender: "E",
        detsisNo: "D1",
      },
      { userId: "u1" },
    );
    const data = tx.client.updateMany.mock.calls[0][0].data;
    expect(data.postalCode).toBe("34000");
    expect(data.isForeigner).toBe(true);
    expect(data.nationality).toBe("Alman");
    expect(data.companyType).toBe("Anonim");
    expect(data.mersisNo).toBe("M1");
    expect(data.ticaretSicilNo).toBe("TS1");
    expect(data.gender).toBe("E");
    expect(data.detsisNo).toBe("D1");
  });

  it("P0.4/P0.5: updateMany count=0 (cross-tenant/yarış) → NotFoundException", async () => {
    const { svc } = buildHarness({ updateCount: 0 });
    await expect(
      svc.update("c1", "t1", { type: "PERSON", firstName: "A", lastName: "B" }, { userId: "u1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("P0.4: pre-check existing yoksa NotFoundException (eski: düz Error)", async () => {
    const { svc, prisma } = buildHarness();
    (prisma.client.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      svc.update("cX", "t1", { type: "PERSON" }, { userId: "u1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ClientService.remove — P0.5 tenant-scoped soft-delete", () => {
  it("P0.5: updateMany {id, tenantId} ile soft-delete (isActive=false)", async () => {
    const { svc, tx } = buildHarness({ existing: { id: "c1", tenantId: "t1", isActive: true } });
    await svc.remove("c1", "t1", { userId: "u1" });
    expect(tx.client.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", tenantId: "t1" },
      data: { isActive: false },
    });
  });

  it("P0.4: pre-check existing yoksa NotFoundException", async () => {
    const { svc, prisma } = buildHarness();
    (prisma.client.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await expect(svc.remove("cX", "t1", { userId: "u1" })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ClientService.remove — Task 8A capability gate (owner-locked 2026-07-02)", () => {
  it("eligible (PARTNER/delege avukat) kullanıcı silebilir", async () => {
    const { svc, tx, officeApproval } = buildHarness({ officeApprovalEligible: true });
    await expect(svc.remove("c1", "t1", { userId: "u1" })).resolves.toBeTruthy();
    expect(officeApproval.isApproverEligible).toHaveBeenCalledWith("u1", "t1");
    expect(tx.client.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", tenantId: "t1" },
      data: { isActive: false },
    });
  });

  it("ineligible (Staff/normal kullanıcı) → ForbiddenException, YAZMA YAPILMAZ", async () => {
    const { svc, tx, prisma, officeApproval } = buildHarness({ officeApprovalEligible: false });
    await expect(svc.remove("c1", "t1", { userId: "u2" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(officeApproval.isApproverEligible).toHaveBeenCalledWith("u2", "t1");
    // Gate transaction'dan ÖNCE → yetkisizken hiçbir soft-delete/audit yazması olmaz.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.client.updateMany).not.toHaveBeenCalled();
  });

  it("userId yoksa (actor eksik) → ForbiddenException (fail-closed)", async () => {
    const { svc, prisma } = buildHarness();
    await expect(svc.remove("c1", "t1", {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("başarılı silmede audit davranışı DEĞİŞMEDİ (CLIENT_DELETE + eski-hâl snapshot + actor)", async () => {
    const existing = { id: "c1", tenantId: "t1", isActive: true, displayName: "Test Müvekkil" };
    const { svc, audit } = buildHarness({ existing, officeApprovalEligible: true });
    await svc.remove("c1", "t1", { userId: "u1" });
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    const call = audit.logInTransaction.mock.calls[0][1];
    expect(call.action).toBe("CLIENT_DELETE");
    expect(call.entityType).toBe("CLIENT");
    expect(call.entityId).toBe("c1");
    expect(call.userId).toBe("u1");
    expect(call.metadata.softDelete).toBe(true);
    expect(call.metadata.oldSnapshot).toBeTruthy();
  });

  it("tenant-scoping DEĞİŞMEDİ: eligibility kontrolü DOĞRU tenantId ile çağrılır, cross-tenant sızmaz", async () => {
    const { svc, officeApproval } = buildHarness({
      existing: { id: "c1", tenantId: "t-real", isActive: true },
    });
    await svc.remove("c1", "t-real", { userId: "u1" });
    expect(officeApproval.isApproverEligible).toHaveBeenCalledWith("u1", "t-real");
    expect(officeApproval.isApproverEligible).not.toHaveBeenCalledWith("u1", "t-other");
  });
});

describe("ClientService.findOne — Task 4A soft-delete default-exclude (owner karar #2)", () => {
  it("default: where {id, tenantId, isActive:true} → arşivlenmiş müvekkil GET /clients/:id'de gelmez", async () => {
    const { svc, prisma } = buildHarness();
    await svc.findOne("c1", "t1");
    const where = (prisma.client.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where).toEqual({ id: "c1", tenantId: "t1", isActive: true });
  });

  it("includeInactive:true: where {id, tenantId} → iç mutasyon dönüşü soft-deleted'i de alır (davranış korunur)", async () => {
    const { svc, prisma } = buildHarness();
    await svc.findOne("c1", "t1", { includeInactive: true });
    const where = (prisma.client.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where).toEqual({ id: "c1", tenantId: "t1" });
  });

  it("update() arşivleme (isActive:false) sonrası kaydı yine döndürür (includeInactive ile)", async () => {
    const { svc, prisma } = buildHarness({ updated: { id: "c1", isActive: false } });
    const result = await svc.update("c1", "t1", { type: "PERSON", isActive: false }, { userId: "u1" });
    // update sonu findOne(includeInactive:true) → soft-deleted kaydı döndürür (null değil).
    expect(result).toBeTruthy();
    const lastWhere = (prisma.client.findFirst as jest.Mock).mock.calls.at(-1)[0].where;
    expect(lastWhere).toEqual({ id: "c1", tenantId: "t1" });
  });
});
