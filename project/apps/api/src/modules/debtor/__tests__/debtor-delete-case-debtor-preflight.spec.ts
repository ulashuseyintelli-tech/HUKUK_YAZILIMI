import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DebtorService } from "../debtor.service";

describe("PR-D4 DebtorService.delete preflight expansion", () => {
  const tenantId = "tenant-1";
  const debtorId = "debtor-1";
  const actor = { userId: "u-partner" };

  const dependencyDelegates = [
    "debtorAddress",
    "estateHeir",
    "asset",
    "debtorCommunication",
    "task",
    "debtorIntelligence",
    "clientIntelStatement",
    "clientInfoRequest",
    "icrabotJobRun",
    "addressTask",
    "addressMissingTask",
    "addressAuditLog",
    "externalCase",
  ] as const;

  type DependencyDelegate = (typeof dependencyDelegates)[number];

  const directBlockers: Array<{
    delegate: DependencyDelegate;
    expectedWhere: Record<string, unknown>;
  }> = [
    { delegate: "debtorAddress", expectedWhere: { debtorId } },
    { delegate: "estateHeir", expectedWhere: { debtorId } },
    { delegate: "asset", expectedWhere: { debtorId } },
    { delegate: "debtorCommunication", expectedWhere: { tenantId, debtorId } },
    { delegate: "task", expectedWhere: { tenantId, debtorId } },
    { delegate: "debtorIntelligence", expectedWhere: { tenantId, debtorId } },
    { delegate: "clientIntelStatement", expectedWhere: { tenantId, debtorId } },
    { delegate: "clientInfoRequest", expectedWhere: { tenantId, debtorId } },
    { delegate: "icrabotJobRun", expectedWhere: { tenantId, debtorId } },
    { delegate: "addressTask", expectedWhere: { tenantId, debtorId } },
  ];

  const looseBlockers: Array<{
    delegate: DependencyDelegate;
    expectedWhere: Record<string, unknown>;
  }> = [
    { delegate: "addressMissingTask", expectedWhere: { tenantId, debtorId } },
    { delegate: "addressAuditLog", expectedWhere: { tenantId, debtorId } },
    { delegate: "externalCase", expectedWhere: { tenantId, counterpartyId: debtorId } },
  ];

  function countDelegate(count = 0) {
    return {
      count: jest.fn().mockResolvedValue(count),
    };
  }

  function makeService(
    counts: Partial<Record<DependencyDelegate | "caseDebtor", number>> = {},
    officeApprovalEligible = true
  ) {
    const prisma: any = {
      caseDebtor: countDelegate(counts.caseDebtor ?? 0),
      debtor: {
        delete: jest.fn().mockResolvedValue({ id: debtorId }),
      },
    };
    // Task D1A: delete() artık snapshot-audit + fiziksel-silme'yi $transaction'a sarıyor (C0-a
    // deseni). Mock tx = prisma'nın KENDİSİ → mevcut `prisma.debtor.delete` assertion'ları AYNEN
    // çalışır (tx.debtor.delete === prisma.debtor.delete, aynı jest.fn referansı).
    prisma.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(prisma));

    for (const delegate of dependencyDelegates) {
      prisma[delegate] = countDelegate(counts[delegate] ?? 0);
    }

    const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(officeApprovalEligible) };
    const service = new DebtorService(prisma, audit as any, officeApproval as any);
    jest.spyOn(service, "findOne").mockResolvedValue({ id: debtorId } as any);

    return { service, prisma, audit, officeApproval };
  }

  it("no blockers allows hard-delete", async () => {
    const { service, prisma } = makeService();

    await expect(service.delete(tenantId, debtorId, actor)).resolves.toEqual({
      id: debtorId,
    });

    expect(service.findOne).toHaveBeenCalledWith(tenantId, debtorId);
    expect(prisma.caseDebtor.count).toHaveBeenCalledWith({
      where: {
        debtorId,
        case: { tenantId },
      },
    });
    expect(prisma.debtorAddress.count).toHaveBeenCalledWith({
      where: { debtorId },
    });
    expect(prisma.debtorCommunication.count).toHaveBeenCalledWith({
      where: { tenantId, debtorId },
    });
    expect(prisma.externalCase.count).toHaveBeenCalledWith({
      where: { tenantId, counterpartyId: debtorId },
    });
    expect(prisma.debtor.delete).toHaveBeenCalledWith({ where: { id: debtorId } });
  });

  it("CaseDebtor blocks before dependency counts and delete", async () => {
    const { service, prisma } = makeService({ caseDebtor: 1 });

    await expect(service.delete(tenantId, debtorId, actor)).rejects.toBeInstanceOf(
      BadRequestException
    );

    expect(prisma.caseDebtor.count).toHaveBeenCalledWith({
      where: {
        debtorId,
        case: { tenantId },
      },
    });
    expect(prisma.caseDebtor.count.mock.calls[0][0].where.case).not.toHaveProperty(
      "caseStatus"
    );
    for (const delegate of dependencyDelegates) {
      expect(prisma[delegate].count).not.toHaveBeenCalled();
    }
    expect(prisma.debtor.delete).not.toHaveBeenCalled();
  });

  it.each(directBlockers)(
    "$delegate direct dependency blocks hard-delete",
    async ({ delegate, expectedWhere }) => {
      const { service, prisma } = makeService({ [delegate]: 1 });

      await expect(service.delete(tenantId, debtorId, actor)).rejects.toBeInstanceOf(
        BadRequestException
      );

      expect(prisma[delegate].count).toHaveBeenCalledWith({ where: expectedWhere });
      expect(prisma.debtor.delete).not.toHaveBeenCalled();
    }
  );

  it.each(looseBlockers)(
    "$delegate loose reference blocks hard-delete",
    async ({ delegate, expectedWhere }) => {
      const { service, prisma } = makeService({ [delegate]: 1 });

      await expect(service.delete(tenantId, debtorId, actor)).rejects.toBeInstanceOf(
        BadRequestException
      );

      expect(prisma[delegate].count).toHaveBeenCalledWith({ where: expectedWhere });
      expect(prisma.debtor.delete).not.toHaveBeenCalled();
    }
  );

  it("PASSIVE CaseDebtor remains blocked by the any-CaseDebtor preflight", async () => {
    const { service, prisma } = makeService({ caseDebtor: 1 });

    await expect(service.delete(tenantId, debtorId, actor)).rejects.toThrow(
      "Dosya bağlantısı veya tarihçe varken borçlu silinemez."
    );

    expect(prisma.caseDebtor.count).toHaveBeenCalledWith({
      where: {
        debtorId,
        case: { tenantId },
      },
    });
    expect(prisma.debtor.delete).not.toHaveBeenCalled();
  });

  it("CaseDebtor with ServiceHistory remains blocked through parent cascade containment", async () => {
    const { service, prisma } = makeService({ caseDebtor: 1 });

    await expect(service.delete(tenantId, debtorId, actor)).rejects.toBeInstanceOf(
      BadRequestException
    );

    expect(prisma.debtor.delete).not.toHaveBeenCalled();
  });

  it("Collection and Tebligat attributions remain protected through CaseDebtor blocker", async () => {
    const { service, prisma } = makeService({ caseDebtor: 1 });

    await expect(service.delete(tenantId, debtorId, actor)).rejects.toBeInstanceOf(
      BadRequestException
    );

    expect(prisma.caseDebtor.count).toHaveBeenCalledWith({
      where: {
        debtorId,
        case: { tenantId },
      },
    });
    expect(prisma.debtor.delete).not.toHaveBeenCalled();
  });

  it("cross-tenant or missing debtor stays NotFound and does not count or delete", async () => {
    const { service, prisma } = makeService();
    (service.findOne as jest.Mock).mockRejectedValueOnce(
      new NotFoundException("Borçlu bulunamadı")
    );

    await expect(service.delete("foreign-tenant", debtorId, actor)).rejects.toBeInstanceOf(
      NotFoundException
    );

    expect(service.findOne).toHaveBeenCalledWith("foreign-tenant", debtorId);
    expect(prisma.caseDebtor.count).not.toHaveBeenCalled();
    for (const delegate of dependencyDelegates) {
      expect(prisma[delegate].count).not.toHaveBeenCalled();
    }
    expect(prisma.debtor.delete).not.toHaveBeenCalled();
  });

  // Task D1A — capability gate (owner-locked 2026-07-02, Option B).
  describe("Task D1A: capability gate", () => {
    it("eligible (PARTNER/delege avukat) → hard-delete izinli (13-katman guard AYNEN çalışır)", async () => {
      const { service, prisma, officeApproval } = makeService({}, true);

      await expect(service.delete(tenantId, debtorId, actor)).resolves.toEqual({ id: debtorId });
      expect(officeApproval.isApproverEligible).toHaveBeenCalledWith("u-partner", tenantId);
      expect(prisma.debtor.delete).toHaveBeenCalledWith({ where: { id: debtorId } });
    });

    it("ineligible (Staff/normal kullanıcı) → ForbiddenException, YAZMA/bağımlılık-sorgusu YAPILMAZ", async () => {
      const { service, prisma, officeApproval } = makeService({}, false);

      await expect(service.delete(tenantId, debtorId, { userId: "u-staff" })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(officeApproval.isApproverEligible).toHaveBeenCalledWith("u-staff", tenantId);
      // Gate bağımlılık-kontrollerinden ÖNCE → yetkisiz aktöre borçlunun durumu bile sızmaz.
      expect(prisma.caseDebtor.count).not.toHaveBeenCalled();
      expect(prisma.debtor.delete).not.toHaveBeenCalled();
    });

    it("actor yoksa (userId yok) → ForbiddenException, fail-closed", async () => {
      const { service, prisma } = makeService({}, true);

      await expect(service.delete(tenantId, debtorId)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.debtor.delete).not.toHaveBeenCalled();
    });

    it("başarılı silmede DEBTOR_DELETE audit snapshot yazılır (eski-hâl + actor + hardDelete:true)", async () => {
      const { service, audit } = makeService({}, true);
      jest.spyOn(service, "findOne").mockResolvedValue({ id: debtorId, type: "INDIVIDUAL", name: "Test Borçlu", tckn: "10000000146" } as any);

      await service.delete(tenantId, debtorId, actor);

      expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
      const call = audit.logInTransaction.mock.calls[0][1];
      expect(call.action).toBe("DEBTOR_DELETE");
      expect(call.entityType).toBe("DEBTOR");
      expect(call.entityId).toBe(debtorId);
      expect(call.userId).toBe("u-partner");
      expect(call.metadata.hardDelete).toBe(true);
      expect(call.metadata.oldSnapshot).toBeTruthy();
      expect(call.metadata.oldSnapshot.type).toBe("INDIVIDUAL");
      // Ham PII (TCKN) audit'e SIZMAZ (KVKK) — yalnız maskelenmiş.
      expect(JSON.stringify(call)).not.toContain("10000000146");
    });
  });
});
