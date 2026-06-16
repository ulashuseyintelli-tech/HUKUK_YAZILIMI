/**
 * PR-1 — Müvekkil görünürlük bug'ı.
 * FIX A: create() duplicate eşleşme soft-deleted (isActive=false) ise REACTIVATE (isActive=true).
 * FIX B: findAll() aktif vekaletleri (powerOfAttorneys) include eder (Vekalet sütunu için).
 */

import { ClientService } from "../client.service";

describe("ClientService.create — soft-deleted reactivation (FIX A)", () => {
  const buildPrisma = (existing: any) => ({
    client: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        // findOne(id,tenantId) çağrısı where.id taşır; duplicate kontrolü OR taşır.
        where.id ? Promise.resolve({ id: where.id, isActive: true }) : Promise.resolve(existing)
      ),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
    },
  });

  it("duplicate soft-deleted → client.update({isActive:true}) çağrılır, create ÇAĞRILMAZ", async () => {
    const prisma = buildPrisma({ id: "c1", isActive: false, displayName: "ŞÜKRÜ AKDOĞAN" }) as any;
    const svc = new ClientService(prisma);

    await svc.create("t1", { tckn: "40294995552", firstName: "Ş", lastName: "A", type: "PERSON" });

    expect(prisma.client.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { isActive: true } });
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it("duplicate AKTİF → reactivate YOK, create YOK (mevcut döner)", async () => {
    const prisma = buildPrisma({ id: "c2", isActive: true, displayName: "X" }) as any;
    const svc = new ClientService(prisma);

    await svc.create("t1", { tckn: "123", type: "PERSON" });

    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(prisma.client.create).not.toHaveBeenCalled();
  });
});

describe("ClientService.findAll — aktif vekalet include (FIX B)", () => {
  it("powerOfAttorneys aktif filtreyle include edilir + tenant/isActive where", async () => {
    const prisma: any = { client: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = new ClientService(prisma);

    await svc.findAll("t1");

    const arg = prisma.client.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ tenantId: "t1", isActive: true });
    expect(arg.include.powerOfAttorneys).toEqual({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
    expect(arg.include._count).toEqual({ select: { cases: true } });
  });
});
