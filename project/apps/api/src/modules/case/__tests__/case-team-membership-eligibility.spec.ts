/**
 * CANDIDATE-K1 (STF-PRD-BOLA-002 baseline, OFF-INV-04) — Case Team-Membership Baseline
 * Eligibility Gate.
 *
 * Doğrular: dosya ekibine avukat/personel eklerken (addCaseLawyer / addCaseStaff) hedefin
 * aynı-tenant + AKTİF olması. Ekip üyeliği için sorumlu-uygunluk bayrağı (canBeResponsible)
 * ARANMAZ — yalnız tenant + aktiflik. Yalnız ileriye-dönük (write-time): mevcut ekip satırları
 * taranmaz.
 *
 * - aktif + aynı-tenant → kabul (create çağrılır)
 * - pasif + aynı-tenant → ret (BadRequest, create çağrılmaz)
 * - cross-tenant → mevcut ret davranışı korunur (tenant-scoped findFirst eşleşmez → NotFound)
 */

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CaseService } from "../case.service";

const makeService = () => {
  const stub = {} as any;
  return new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
};

// In-memory lawyer/staff tabloları: addCaseLawyer/addCaseStaff'ın `findFirst({ id, tenantId })`
// tenant-scoped sorgusunu gerçekten uygular; aktiflik kontrolü servis içinde yapılır.
const LAWYERS = [
  { id: "law-active", tenantId: "t1", lawyerRank: "LAWYER", isActive: true },
  { id: "law-inactive", tenantId: "t1", lawyerRank: "LAWYER", isActive: false },
  { id: "law-other", tenantId: "t2", lawyerRank: "LAWYER", isActive: true }, // farklı tenant
];
const STAFF = [
  { id: "stf-active", tenantId: "t1", staffType: "STAJYER", isActive: true },
  { id: "stf-inactive", tenantId: "t1", staffType: "STAJYER", isActive: false },
  { id: "stf-other", tenantId: "t2", staffType: "STAJYER", isActive: true },
];

const buildPrisma = () => {
  const lawyerCreate = jest.fn(async () => ({ id: "cl-new", lawyer: { id: "x" } }));
  const staffCreate = jest.fn(async () => ({ id: "cs-new" }));
  return {
    prisma: {
      case: { findFirst: jest.fn(async () => ({ id: "case-1", tenantId: "t1" })) },
      lawyer: {
        findFirst: jest.fn(({ where }: any) =>
          Promise.resolve(
            LAWYERS.find((l) => l.id === where.id && l.tenantId === where.tenantId) ?? null
          )
        ),
      },
      staffMember: {
        findFirst: jest.fn(({ where }: any) =>
          Promise.resolve(
            STAFF.find((s) => s.id === where.id && s.tenantId === where.tenantId) ?? null
          )
        ),
      },
      caseLawyer: { findFirst: jest.fn(async () => null), count: jest.fn(async () => 0), create: lawyerCreate },
      caseStaff: { findFirst: jest.fn(async () => null), create: staffCreate },
    },
    lawyerCreate,
    staffCreate,
  };
};

describe("CANDIDATE-K1 addCaseLawyer — ekip-üyesi aktiflik kapısı", () => {
  it("aktif + aynı-tenant avukat → kabul (caseLawyer.create çağrılır)", async () => {
    const svc = makeService();
    const m = buildPrisma();
    (svc as any).prisma = m.prisma;
    (svc as any).auditService = { log: jest.fn(async () => undefined) };

    await (svc as any).addCaseLawyer("t1", "case-1", { lawyerId: "law-active", role: "ASSIGNED" });

    expect(m.lawyerCreate).toHaveBeenCalledTimes(1);
  });

  it("pasif avukat → ret (BadRequest, caseLawyer.create çağrılmaz)", async () => {
    const svc = makeService();
    const m = buildPrisma();
    (svc as any).prisma = m.prisma;
    (svc as any).auditService = { log: jest.fn(async () => undefined) };

    await expect(
      (svc as any).addCaseLawyer("t1", "case-1", { lawyerId: "law-inactive", role: "ASSIGNED" })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(m.lawyerCreate).not.toHaveBeenCalled();
  });

  it("cross-tenant avukat → mevcut ret davranışı korunur (NotFound, create çağrılmaz)", async () => {
    const svc = makeService();
    const m = buildPrisma();
    (svc as any).prisma = m.prisma;
    (svc as any).auditService = { log: jest.fn(async () => undefined) };

    await expect(
      (svc as any).addCaseLawyer("t1", "case-1", { lawyerId: "law-other", role: "ASSIGNED" })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(m.lawyerCreate).not.toHaveBeenCalled();
  });
});

describe("CANDIDATE-K1 addCaseStaff — ekip-üyesi aktiflik kapısı", () => {
  it("aktif + aynı-tenant personel → kabul (caseStaff.create çağrılır)", async () => {
    const svc = makeService();
    const m = buildPrisma();
    (svc as any).prisma = m.prisma;
    (svc as any).auditService = { log: jest.fn(async () => undefined) };

    await (svc as any).addCaseStaff("t1", "case-1", { staffMemberId: "stf-active" });

    expect(m.staffCreate).toHaveBeenCalledTimes(1);
  });

  it("pasif personel → ret (BadRequest, caseStaff.create çağrılmaz)", async () => {
    const svc = makeService();
    const m = buildPrisma();
    (svc as any).prisma = m.prisma;
    (svc as any).auditService = { log: jest.fn(async () => undefined) };

    await expect(
      (svc as any).addCaseStaff("t1", "case-1", { staffMemberId: "stf-inactive" })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(m.staffCreate).not.toHaveBeenCalled();
  });

  it("cross-tenant personel → mevcut ret davranışı korunur (NotFound, create çağrılmaz)", async () => {
    const svc = makeService();
    const m = buildPrisma();
    (svc as any).prisma = m.prisma;
    (svc as any).auditService = { log: jest.fn(async () => undefined) };

    await expect(
      (svc as any).addCaseStaff("t1", "case-1", { staffMemberId: "stf-other" })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(m.staffCreate).not.toHaveBeenCalled();
  });
});
