/**
 * PR-1 — Müvekkil görünürlük bug'ı.
 * ~~FIX A: create() duplicate eşleşme soft-deleted (isActive=false) ise REACTIVATE (isActive=true).~~
 *   → **CL-R04 (owner kararı 2026-10-29/30): create ÜZERİNDEN REAKTİVASYON KALDIRILDI.** Pasif mükerrer kayıt 409
 *   DUPLICATE_IDENTITY_INACTIVE (kapsam içi) ya da genel 409 DUPLICATE_IDENTITY (kapsam dışı) döner; hiçbir bayrak çevrilmez,
 *   audit yazılmaz, transaction açılmaz. Yaşam döngüsü yalnız mevcut yetkili uç (PUT /clients/:id isActive).
 * FIX B: findAll() aktif vekaletleri (powerOfAttorneys) include eder (Vekalet sütunu için) — DEĞİŞMEDİ.
 */

import { ConflictException } from "@nestjs/common";
import { ClientService } from "../client.service";

describe("ClientService.create — pasif mükerrer kayıt (CL-R04: create reaktive ETMEZ)", () => {
  const buildTx = () => ({
    client: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: "new" }),
    },
    clientContact: { createMany: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
  });
  /** `inScope`: K16 kapsam probu (where.AND) sonucu; `existing`: dedup probu (where.OR) sonucu; where.id → findOne. */
  const buildPrisma = (existing: any, tx: any, inScope = true) => ({
    user: { findFirst: jest.fn().mockResolvedValue({ id: "fixture-actor" }) },
    client: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        where.OR
          ? Promise.resolve(existing)
          : where.AND
            ? Promise.resolve(inScope ? { id: where.id } : null)
            : Promise.resolve({ id: where.id, isActive: true, tckn: "40294995552", notes: "gizli not" })
      ),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  });
  const buildAudit = () => ({ logInTransaction: jest.fn().mockResolvedValue(undefined) });
  // Yetkili approver stub'ı BİLİNÇLİ verilir: CL-R04 sonrası yetki OLSA BİLE create reaktive etmez (yetkiden bağımsız).
  const buildEligibleApproval = () => ({ isApproverEligible: jest.fn().mockResolvedValue(true) });
  const actor = { userId: "fixture-actor", tenantId: "t1", role: "ADMIN" };
  const conflictCode = async (p: Promise<unknown>) => {
    try { await p; } catch (e) { expect(e).toBeInstanceOf(ConflictException); return ((e as ConflictException).getResponse() as any).code; }
    throw new Error("ConflictException bekleniyordu");
  };

  it("duplicate soft-deleted (kapsam içi) → 409 DUPLICATE_IDENTITY_INACTIVE; updateMany/audit/create YOK, tx AÇILMAZ, yetki SORULMAZ", async () => {
    const tx = buildTx();
    const prisma = buildPrisma({ id: "c1", isActive: false, displayName: "ŞÜKRÜ AKDOĞAN" }, tx) as any;
    const audit = buildAudit();
    const approval = buildEligibleApproval();
    const svc = new ClientService(prisma, audit as any, approval as any);

    expect(await conflictCode(svc.create("t1", { tckn: "40294995552", firstName: "Ş", lastName: "A", type: "PERSON" }, actor))).toBe("DUPLICATE_IDENTITY_INACTIVE");

    expect(tx.client.updateMany).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(tx.client.create).not.toHaveBeenCalled();
    expect(approval.isApproverEligible).not.toHaveBeenCalled();
  });

  it("duplicate soft-deleted KAPSAM DIŞI → genel 409 DUPLICATE_IDENTITY (aktiflik bilgisi YOK); hiçbir yazma yok", async () => {
    const tx = buildTx();
    const prisma = buildPrisma({ id: "c1", isActive: false, displayName: "X" }, tx, false) as any;
    const svc = new ClientService(prisma, buildAudit() as any, buildEligibleApproval() as any);
    expect(await conflictCode(svc.create("t1", { tckn: "40294995552", type: "PERSON" }, actor))).toBe("DUPLICATE_IDENTITY");
    expect(tx.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("duplicate AKTİF kapsam içi → maskeli mevcut kayıt + _existingReturned; mutation transaction'ı hiç açılmaz; _reactivated daima false", async () => {
    const tx = buildTx();
    const prisma = buildPrisma({ id: "c2", isActive: true, displayName: "X" }, tx) as any;
    const svc = new ClientService(prisma, buildAudit() as any, {} as any);

    const res: any = await svc.create("t1", { tckn: "40294995552", type: "PERSON" }, actor);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(res._existingReturned).toBe(true);
    expect(res._reactivated).toBe(false);
    expect(res.id).toBe("c2");
    expect(res.tckn).toBe("402****52"); // K16 CONTACT_DETAIL presenter: kimlik maskeli
    expect(res).not.toHaveProperty("notes"); // notlar dönmez
  });

  it("duplicate AKTİF kapsam DIŞI → genel 409 DUPLICATE_IDENTITY; profil ve id dönmez", async () => {
    const tx = buildTx();
    const prisma = buildPrisma({ id: "c2", isActive: true, displayName: "X" }, tx, false) as any;
    const svc = new ClientService(prisma, buildAudit() as any, {} as any);
    let caught: any;
    try { await svc.create("t1", { tckn: "40294995552", type: "PERSON" }, actor); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ConflictException);
    const body = caught.getResponse();
    expect(body.code).toBe("DUPLICATE_IDENTITY");
    expect(JSON.stringify(body)).not.toContain("c2");
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("isActive");
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
