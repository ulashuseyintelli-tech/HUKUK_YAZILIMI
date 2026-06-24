// WP-1d-5-4 — Hukuki Sorumlu Avukat kontrollü değişikliği (backend) — test-first.
// Sözleşme: docs/wp1d5-legal-responsible-lawyer-change-endpoint-audit-contract.md
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { LegalResponsibleLawyerService } from "../legal-responsible-lawyer.service";
import { ResponsibilityHistoryService } from "../responsibility-history.service";

function makeService(
  opts: { case?: any; target?: any; responsibles?: any[] } = {},
) {
  const auditCreate = jest.fn(async (_a: any) => ({
    id: "audit-1",
    createdAt: new Date("2026-06-25T10:00:00.000Z"),
  }));
  const clUpdate = jest.fn(async (_a: any) => ({}));
  const caseUpdate = jest.fn(async (_a: any) => ({}));
  const tx = { caseLawyer: { update: clUpdate }, auditLog: { create: auditCreate } };
  const prisma = {
    case: {
      findFirst: jest.fn(async (..._a: any[]) => ("case" in opts ? opts.case : { id: "c1" })),
      update: caseUpdate,
    },
    caseLawyer: {
      findFirst: jest.fn(async (..._a: any[]) =>
        "target" in opts ? opts.target : { id: "cl-new", lawyerId: "L2", isResponsible: false },
      ),
      findMany: jest.fn(async (..._a: any[]) =>
        "responsibles" in opts ? opts.responsibles : [{ id: "cl-old", lawyerId: "L1" }],
      ),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  } as any;
  const hardGuard = {
    assertBridgeAdmin: jest.fn(async (_op: string, ctx: any) => {
      if (ctx.role !== "ADMIN") throw new ForbiddenException();
    }),
  } as any;
  const service = new LegalResponsibleLawyerService(prisma, hardGuard);
  return { service, prisma, hardGuard, clUpdate, caseUpdate, auditCreate };
}

const DTO = { lawyerId: "L2", reason: "Dosya hukuki sorumlusu değişiklik kararı", note: "opsiyonel not" };

describe("LegalResponsibleLawyerService.changeLegalResponsibleLawyer (WP-1d-5-4)", () => {
  it("1+2: ADMIN başarı → eski demote, yeni promote; role coupling (clear-before-set sırası)", async () => {
    const { service, clUpdate } = makeService();
    const out = await service.changeLegalResponsibleLawyer("t1", "c1", DTO, "u-admin", "ADMIN");
    expect(out).toEqual({
      caseId: "c1",
      previousLawyerId: "L1",
      newLawyerId: "L2",
      changedAt: "2026-06-25T10:00:00.000Z",
      auditLogId: "audit-1",
    });
    // clear-before-set: önce demote (cl-old), sonra promote (cl-new)
    expect(clUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "cl-old" },
      data: { isResponsible: false, role: "ASSIGNED" },
    });
    expect(clUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "cl-new" },
      data: { isResponsible: true, role: "RESPONSIBLE" },
    });
  });

  it("3: audit LEGAL_RESPONSIBLE_LAWYER_CHANGED metadata + actor + tek otorite", async () => {
    const { service, auditCreate } = makeService();
    await service.changeLegalResponsibleLawyer("t1", "c1", DTO, "u-admin", "ADMIN");
    const arg = auditCreate.mock.calls[0][0];
    expect(arg.data.entityType).toBe("CASE_LAWYER");
    expect(arg.data.action).toBe("UPDATE");
    expect(arg.data.userId).toBe("u-admin");
    expect(arg.data.tenantId).toBe("t1");
    expect(arg.data.newValues).toMatchObject({ isResponsible: true, role: "RESPONSIBLE", lawyerId: "L2" });
    expect(arg.data.metadata).toMatchObject({
      caseId: "c1",
      changeType: "LEGAL_RESPONSIBLE_LAWYER_CHANGED",
      previousLawyerId: "L1",
      newLawyerId: "L2",
      reason: "Dosya hukuki sorumlusu değişiklik kararı",
      note: "opsiyonel not",
      source: "LEGAL_RESPONSIBLE_LAWYER_CHANGE_ENDPOINT",
    });
  });

  it("4: üretilen audit event responsibility-history'de EVENT_CONFIRMED legalResponsibleLawyer okunur", async () => {
    const { service, auditCreate } = makeService();
    await service.changeLegalResponsibleLawyer("t1", "c1", DTO, "u-admin", "ADMIN");
    // Servisin yazdığı audit data'sını gerçek AuditLog satırına çevir.
    const row = {
      ...auditCreate.mock.calls[0][0].data,
      id: "audit-1",
      createdAt: new Date("2026-06-25T10:00:00.000Z"),
    };
    // Gerçek history servisi: CASE_LAWYER sorgusuna bu event'i, CASE/owner sorgusuna boş döndür.
    const histPrisma = {
      case: { findFirst: jest.fn(async () => ({ id: "c1" })) },
      auditLog: {
        findMany: jest.fn(async (args: any) => (args.where.entityType === "CASE_LAWYER" ? [row] : [])),
      },
      caseLawyer: { findUnique: jest.fn(async () => null) },
    } as any;
    const hist = new ResponsibilityHistoryService(histPrisma);
    const result = await hist.getResponsibilityHistory("t1", "c1");
    const legal = result.events.find((e) => e.type === "legalResponsibleLawyer");
    expect(legal).toBeDefined();
    expect(legal!.confidence).toBe("EVENT_CONFIRMED");
    expect(legal!.newValue).toEqual({ type: "LAWYER", id: "L2" });
    // caseLawyer.findUnique (junction fallback) çağrılmaz → metadata.caseId güvenilir yol.
    expect(histPrisma.caseLawyer.findUnique).not.toHaveBeenCalled();
  });

  it("5: reason boş/yok → 400; state değişmez, audit yazılmaz", async () => {
    const { service, prisma, clUpdate, auditCreate } = makeService();
    await expect(
      service.changeLegalResponsibleLawyer("t1", "c1", { lawyerId: "L2", reason: "   " }, "u-admin", "ADMIN"),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(clUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("5b: lawyerId yok → 400", async () => {
    const { service } = makeService();
    await expect(
      service.changeLegalResponsibleLawyer("t1", "c1", { lawyerId: "  ", reason: "x" } as any, "u-admin", "ADMIN"),
    ).rejects.toThrow(BadRequestException);
  });

  it("6: hedef lawyer case'e bağlı değil → 404; state değişmez, audit yazılmaz", async () => {
    const { service, prisma, auditCreate } = makeService({ target: null });
    await expect(
      service.changeLegalResponsibleLawyer("t1", "c1", DTO, "u-admin", "ADMIN"),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("7: hedef zaten current responsible → 409; state değişmez, audit yazılmaz", async () => {
    const { service, prisma, auditCreate } = makeService({
      target: { id: "cl-cur", lawyerId: "L2", isResponsible: true },
      responsibles: [{ id: "cl-cur", lawyerId: "L2" }],
    });
    await expect(
      service.changeLegalResponsibleLawyer("t1", "c1", DTO, "u-admin", "ADMIN"),
    ).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("8: mevcut responsible zero → 409 (repair yapmaz); audit yazılmaz", async () => {
    const { service, prisma, auditCreate } = makeService({ responsibles: [] });
    await expect(
      service.changeLegalResponsibleLawyer("t1", "c1", DTO, "u-admin", "ADMIN"),
    ).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("9: mevcut responsible multiple → 409 (repair yapmaz)", async () => {
    const { service, prisma } = makeService({
      responsibles: [{ id: "a", lawyerId: "L1" }, { id: "b", lawyerId: "L3" }],
    });
    await expect(
      service.changeLegalResponsibleLawyer("t1", "c1", DTO, "u-admin", "ADMIN"),
    ).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("10: non-admin → 403; state değişmez, audit yazılmaz", async () => {
    const { service, prisma, clUpdate, auditCreate } = makeService();
    await expect(
      service.changeLegalResponsibleLawyer("t1", "c1", DTO, "u-staff", "STAFF"),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(clUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("11: tenant isolation → case tenant-scoped sorgulanır", async () => {
    const { service, prisma } = makeService();
    await service.changeLegalResponsibleLawyer("t1", "c1", DTO, "u-admin", "ADMIN");
    expect(prisma.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1", tenantId: "t1" } }),
    );
  });

  it("12: operation owner alanları DEĞİŞMEZ (Case.update çağrılmaz)", async () => {
    const { service, caseUpdate } = makeService();
    await service.changeLegalResponsibleLawyer("t1", "c1", DTO, "u-admin", "ADMIN");
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it("13: yalnız CaseLawyer + AuditLog yazılır (legacy/staff/task'a dokunulmaz)", async () => {
    const { service, clUpdate, auditCreate, caseUpdate } = makeService();
    await service.changeLegalResponsibleLawyer("t1", "c1", DTO, "u-admin", "ADMIN");
    expect(clUpdate).toHaveBeenCalledTimes(2);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(caseUpdate).not.toHaveBeenCalled();
  });
});
