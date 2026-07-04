/**
 * DBND-D6A-1 — Paylaşılan Debtor.id (aynı borçlu birden fazla aktif dosyada) cross-file alert
 * (pull/MVP, push bildirim DEĞİL). getCrossFileDebtorAlerts() + update()/updateAddress()'in
 * audit metadata'sına yazdığı notifyCategories/sourceCaseId.
 */

import { DebtorService } from "../debtor.service";

const buildPrisma = (opts: {
  caseDebtors?: any[];
  auditLogs?: any[];
  existingDebtor?: any;
} = {}) => {
  const existing = opts.existingDebtor ?? {
    id: "d1",
    tenantId: "t1",
    type: "INDIVIDUAL",
    firstName: "Ali",
    lastName: "Veli",
    phone: "5551112233",
    email: null,
  };

  return {
    debtor: {
      findFirst: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ ...existing, ...a.data })),
    },
    caseDebtor: {
      findMany: jest.fn().mockResolvedValue(opts.caseDebtors ?? []),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue(opts.auditLogs ?? []),
    },
  } as any;
};

const buildService = (prisma: any) =>
  new DebtorService(
    prisma,
    { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) } as any,
    {} as any
  );

describe("DebtorService.getCrossFileDebtorAlerts (DBND-D6A-1)", () => {
  it("başka aktif dosyada değilse hasAlert=false döner (audit hiç sorgulanmaz)", async () => {
    const prisma = buildPrisma({ caseDebtors: [] });
    const svc = buildService(prisma);

    const result = await svc.getCrossFileDebtorAlerts("t1", "d1", "case-1");

    expect(result).toEqual({
      hasAlert: false,
      lastChangedAt: null,
      categories: [],
      sourceCaseId: null,
      otherActiveCases: [],
    });
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("caseDebtor sorgusu lifecycleStatus=ACTIVE ve excludeCaseId hariç filtresiyle çağrılır", async () => {
    const prisma = buildPrisma({ caseDebtors: [] });
    const svc = buildService(prisma);

    await svc.getCrossFileDebtorAlerts("t1", "d1", "case-1");

    expect(prisma.caseDebtor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          debtorId: "d1",
          lifecycleStatus: "ACTIVE",
          case: { tenantId: "t1" },
          caseId: { not: "case-1" },
        }),
      })
    );
  });

  it("ilgili (NOTIFY_FIELDS kapsamında) audit kaydı yoksa hasAlert=false", async () => {
    const prisma = buildPrisma({
      caseDebtors: [{ caseId: "case-2", case: { fileNumber: "2024/1", responsibleLawyer: null, responsibleStaff: null } }],
      auditLogs: [
        { action: "DEBTOR_UPDATE", createdAt: new Date("2026-07-01"), metadata: { fieldDiff: [{ field: "riskNotes" }] } },
      ],
    });
    const svc = buildService(prisma);

    const result = await svc.getCrossFileDebtorAlerts("t1", "d1", "case-1");

    expect(result.hasAlert).toBe(false);
  });

  it("başka case'ten gelen kimlik/iletişim/unvan değişikliği → hasAlert=true, kategori+diğer dosyalar doğru", async () => {
    const changedAt = new Date("2026-07-02T10:00:00.000Z");
    const prisma = buildPrisma({
      caseDebtors: [
        {
          caseId: "case-2",
          case: {
            fileNumber: "2024/55",
            responsibleLawyer: { name: "Ayşe", surname: "Kaya" },
            responsibleStaff: null,
          },
        },
      ],
      auditLogs: [
        {
          action: "DEBTOR_UPDATE",
          createdAt: changedAt,
          metadata: { sourceCaseId: "case-2", notifyCategories: ["contact"] },
        },
      ],
    });
    const svc = buildService(prisma);

    const result = await svc.getCrossFileDebtorAlerts("t1", "d1", "case-1");

    expect(result).toEqual({
      hasAlert: true,
      lastChangedAt: changedAt.toISOString(),
      categories: ["contact"],
      sourceCaseId: "case-2",
      otherActiveCases: [{ caseId: "case-2", fileNumber: "2024/55", responsibleName: "Ayşe Kaya" }],
    });
  });

  it("en son ilgili değişiklik KENDİ dosyandan (excludeCaseId) geldiyse hasAlert=false", async () => {
    const prisma = buildPrisma({
      caseDebtors: [{ caseId: "case-2", case: { fileNumber: "2024/55", responsibleLawyer: null, responsibleStaff: null } }],
      auditLogs: [
        {
          action: "DEBTOR_UPDATE",
          createdAt: new Date("2026-07-02"),
          metadata: { sourceCaseId: "case-1", notifyCategories: ["name"] },
        },
      ],
    });
    const svc = buildService(prisma);

    const result = await svc.getCrossFileDebtorAlerts("t1", "d1", "case-1");

    expect(result.hasAlert).toBe(false);
  });

  it("excludeCaseId verilmezse (güvenli fallback) kendi-dosya kontrolü atlanır, alert yine gösterilir", async () => {
    const prisma = buildPrisma({
      caseDebtors: [{ caseId: "case-2", case: { fileNumber: "2024/55", responsibleLawyer: null, responsibleStaff: null } }],
      auditLogs: [
        {
          action: "DEBTOR_UPDATE",
          createdAt: new Date("2026-07-02"),
          metadata: { sourceCaseId: "case-1", notifyCategories: ["name"] },
        },
      ],
    });
    const svc = buildService(prisma);

    const result = await svc.getCrossFileDebtorAlerts("t1", "d1", undefined);

    expect(result.hasAlert).toBe(true);
    expect(prisma.caseDebtor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ caseId: expect.anything() }),
      })
    );
  });

  it("DEBTOR_ADDRESS_UPDATE action → categories=['address'] (ham adres metni yok)", async () => {
    const prisma = buildPrisma({
      caseDebtors: [{ caseId: "case-2", case: { fileNumber: "2024/9", responsibleLawyer: null, responsibleStaff: { firstName: "Cem", lastName: "Öz" } } }],
      auditLogs: [
        {
          action: "DEBTOR_ADDRESS_UPDATE",
          createdAt: new Date("2026-07-03"),
          metadata: { addressId: "addr-1", sourceCaseId: "case-2" },
        },
      ],
    });
    const svc = buildService(prisma);

    const result = await svc.getCrossFileDebtorAlerts("t1", "d1", "case-1");

    expect(result.hasAlert).toBe(true);
    expect(result.categories).toEqual(["address"]);
    expect(result.otherActiveCases[0].responsibleName).toBe("Cem Öz");
  });
});

describe("DebtorService.update — DBND-D6A-1 audit metadata (notifyCategories/sourceCaseId)", () => {
  it("iletişim alanı (phone) değişince notifyCategories=['contact'] + sourceCaseId audit'e yazılır", async () => {
    const prisma = buildPrisma({
      existingDebtor: { id: "d1", tenantId: "t1", type: "INDIVIDUAL", firstName: "Ali", lastName: "Veli", phone: "5550000000", email: null },
    });
    const auditLog = jest.fn().mockResolvedValue(undefined);
    const svc = new DebtorService(prisma, { log: auditLog, logInTransaction: jest.fn() } as any, {} as any);

    await svc.update("t1", "d1", { phone: "5551234567", sourceCaseId: "case-9" } as any);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DEBTOR_UPDATE",
        metadata: expect.objectContaining({
          sourceCaseId: "case-9",
          notifyCategories: ["contact"],
        }),
      })
    );
    // sourceCaseId Debtor tablosuna YAZILMAZ (DTO'dan ayrıştırılır)
    expect(prisma.debtor.update.mock.calls[0][0].data.sourceCaseId).toBeUndefined();
  });

  it("bildirim kategorisi kapsamı dışı bir alan (riskNotes) değişince notifyCategories audit'e eklenmez", async () => {
    const prisma = buildPrisma({
      existingDebtor: { id: "d1", tenantId: "t1", type: "INDIVIDUAL", firstName: "Ali", lastName: "Veli", riskNotes: "eski not" },
    });
    const auditLog = jest.fn().mockResolvedValue(undefined);
    const svc = new DebtorService(prisma, { log: auditLog, logInTransaction: jest.fn() } as any, {} as any);

    await svc.update("t1", "d1", { riskNotes: "yeni not" } as any);

    const metadata = auditLog.mock.calls[0][0].metadata;
    expect(metadata.notifyCategories).toBeUndefined();
    expect(metadata.sourceCaseId).toBeNull();
  });
});
