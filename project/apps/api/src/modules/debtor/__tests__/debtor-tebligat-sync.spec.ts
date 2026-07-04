/**
 * PR-D5-b-1 — Tebligat → CaseDebtor tek-yönlü senkron + ORTAK istihbarat method.
 * runServiceResultIntelligence (paylaşılan; istihbarat kaçmaz) + syncServiceStatusInTx (tx, no-op guard).
 */

import { DebtorService } from "../debtor.service";

describe("DebtorService.runServiceResultIntelligence (ORTAK istihbarat tetiği)", () => {
  const make = () => {
    const svc = new DebtorService({} as any, { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);
    (svc as any).syncIntelligenceTaskSafe = jest.fn().mockResolvedValue(undefined);
    return svc;
  };

  it("[B] DELIVERED + UETS/KEP + addressId → syncIntelligenceTaskSafe(checkRecent=true)", async () => {
    const svc = make();
    await svc.runServiceResultIntelligence("t1", "d1", "a1", "DELIVERED", "UETS", null);
    expect((svc as any).syncIntelligenceTaskSafe).toHaveBeenCalledWith("t1", "d1", "a1", true);
  });

  it("[C] RETURNED + MOVED → syncIntelligenceTaskSafe", async () => {
    const svc = make();
    await svc.runServiceResultIntelligence("t1", "d1", "a1", "RETURNED", "NORMAL", "MOVED");
    expect((svc as any).syncIntelligenceTaskSafe).toHaveBeenCalledWith("t1", "d1", "a1");
  });

  it("DELIVERED + NORMAL (UETS/KEP değil) → istihbarat tetiklenmez", async () => {
    const svc = make();
    await svc.runServiceResultIntelligence("t1", "d1", "a1", "DELIVERED", "NORMAL", null);
    expect((svc as any).syncIntelligenceTaskSafe).not.toHaveBeenCalled();
  });
});

describe("DebtorService.syncServiceStatusInTx (Tebligat → CaseDebtor)", () => {
  const buildTx = (caseDebtor: any) => ({
    caseDebtor: { findFirst: jest.fn().mockResolvedValue(caseDebtor), update: jest.fn().mockResolvedValue({}) },
    debtorAddress: { findUnique: jest.fn().mockResolvedValue({ type: "DECLARED", street: "X", district: "K", city: "İst" }) },
    serviceHistory: { create: jest.fn().mockResolvedValue({}) },
  });

  it("DELIVERED → CaseDebtor.serviceStatus güncellenir + deliveredAt + ServiceHistory + debtorId döner", async () => {
    const tx = buildTx({ id: "cd1", serviceStatus: "SENT", selectedAddressId: "a1", debtor: { id: "d1" } });
    const svc = new DebtorService({} as any, { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);

    const res = await svc.syncServiceStatusInTx(tx as any, { tenantId: "t1", caseDebtorId: "cd1", newStatus: "DELIVERED", channel: "NORMAL", addressId: "a1" });

    const upd = tx.caseDebtor.update.mock.calls[0][0].data;
    expect(upd.serviceStatus).toBe("DELIVERED");
    expect(upd.deliveredAt).toBeInstanceOf(Date);
    expect(tx.serviceHistory.create).toHaveBeenCalled();
    expect(res).toMatchObject({ debtorId: "d1", addressId: "a1", newStatus: "DELIVERED" });
  });

  it("RETURNED + returnReason → returnedAt + returnReason yazılır", async () => {
    const tx = buildTx({ id: "cd1", serviceStatus: "SENT", selectedAddressId: "a1", debtor: { id: "d1" } });
    const svc = new DebtorService({} as any, { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);

    await svc.syncServiceStatusInTx(tx as any, { tenantId: "t1", caseDebtorId: "cd1", newStatus: "RETURNED", returnReason: "MOVED", addressId: "a1" });

    const upd = tx.caseDebtor.update.mock.calls[0][0].data;
    expect(upd.serviceStatus).toBe("RETURNED");
    expect(upd.returnedAt).toBeInstanceOf(Date);
    expect(upd.returnReason).toBe("MOVED");
  });

  it("CaseDebtor yoksa → NO-OP (null, update yok)", async () => {
    const tx = buildTx(null);
    const svc = new DebtorService({} as any, { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);

    const res = await svc.syncServiceStatusInTx(tx as any, { tenantId: "t1", caseDebtorId: "cdX", newStatus: "DELIVERED" });

    expect(res).toBeNull();
    expect(tx.caseDebtor.update).not.toHaveBeenCalled();
    expect(tx.serviceHistory.create).not.toHaveBeenCalled();
  });
});
