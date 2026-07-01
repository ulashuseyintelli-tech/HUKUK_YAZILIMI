/**
 * PR-1 — Müvekkil görünürlük bug'ı.
 * FIX A: create() duplicate eşleşme soft-deleted (isActive=false) ise REACTIVATE (isActive=true).
 * FIX B: findAll() aktif vekaletleri (powerOfAttorneys) include eder (Vekalet sütunu için).
 *
 * C0-a: reaktivasyon artık $transaction içinde + AuditService.logInTransaction (CLIENT_REACTIVATE).
 */

import { ClientService } from "../client.service";

describe("ClientService.create — soft-deleted reactivation (FIX A)", () => {
  const buildTx = () => ({
    client: { update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: "new" }) },
    clientContact: { createMany: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
  });
  const buildPrisma = (existing: any, tx: any) => ({
    client: {
      // findOne(id,tenantId) çağrısı where.id taşır; duplicate kontrolü OR taşır.
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        where.id ? Promise.resolve({ id: where.id, isActive: true }) : Promise.resolve(existing)
      ),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  });
  const buildAudit = () => ({ logInTransaction: jest.fn().mockResolvedValue(undefined) });

  it("duplicate soft-deleted → reactivate (tx) + audit CLIENT_REACTIVATE, create YOK", async () => {
    const tx = buildTx();
    const prisma = buildPrisma({ id: "c1", isActive: false, displayName: "ŞÜKRÜ AKDOĞAN" }, tx) as any;
    const audit = buildAudit();
    const svc = new ClientService(prisma, audit as any, {} as any);

    const res = await svc.create("t1", { tckn: "40294995552", firstName: "Ş", lastName: "A", type: "PERSON" });

    expect(tx.client.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { isActive: true } });
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "CLIENT_REACTIVATE", entityType: "CLIENT", entityId: "c1" }),
    );
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(tx.client.create).not.toHaveBeenCalled();
    expect((res as any)._existingReturned).toBe(true);
    expect((res as any)._reactivated).toBe(true);
  });

  it("duplicate AKTİF → reactivate YOK, mutation transaction'ı hiç açılmaz", async () => {
    const tx = buildTx();
    const prisma = buildPrisma({ id: "c2", isActive: true, displayName: "X" }, tx) as any;
    const svc = new ClientService(prisma, buildAudit() as any, {} as any);

    const res = await svc.create("t1", { tckn: "123", type: "PERSON" });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect((res as any)._existingReturned).toBe(true);
    expect((res as any)._reactivated).toBe(false);
  });
});

describe("ClientService.findAll — aktif vekalet include (FIX B)", () => {
  it("powerOfAttorneys aktif filtreyle include edilir + tenant/isActive where", async () => {
    const prisma: any = { client: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = new ClientService(prisma, { logInTransaction: jest.fn() } as any, {} as any);

    await svc.findAll("t1");

    const arg = prisma.client.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ tenantId: "t1", isActive: true });
    expect(arg.include.powerOfAttorneys).toEqual({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
    expect(arg.include._count).toEqual({ select: { cases: true } });
  });
});
