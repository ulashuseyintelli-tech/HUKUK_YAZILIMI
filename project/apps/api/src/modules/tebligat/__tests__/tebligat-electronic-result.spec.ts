/**
 * PR-S1 — UETS/KEP elektronik tebligat sonucu → kanonik durum senkronu (ölü-uç kapatma).
 * recordElectronicResult: UETS/KEP teslim durumu → Tebligat.status + CaseDebtor.serviceStatus
 * (atomik) + istihbarat tetiği. Kanal UETS/KEP KORUNUR (D4e-2 [B] için kritik).
 */

import { TebligatService, ELECTRONIC_DELIVERY_TO_TEBLIGAT_STATUS, TEBLIGAT_TO_SERVICE_STATUS } from "../tebligat.service";

describe("ELECTRONIC_DELIVERY_TO_TEBLIGAT_STATUS (UETS/KEP → TebligatStatus eşleme)", () => {
  it("TESLIM_EDILDI → TESLIM_EDILDI (→ DELIVERED, sync set'inde)", () => {
    expect(ELECTRONIC_DELIVERY_TO_TEBLIGAT_STATUS["TESLIM_EDILDI"]).toBe("TESLIM_EDILDI");
    expect(TEBLIGAT_TO_SERVICE_STATUS["TESLIM_EDILDI"]).toBe("DELIVERED");
  });
  it("HATA → IPTAL (→ FAILED, sync set'i DIŞINDA)", () => {
    expect(ELECTRONIC_DELIVERY_TO_TEBLIGAT_STATUS["HATA"]).toBe("IPTAL");
    expect(TEBLIGAT_TO_SERVICE_STATUS["IPTAL"]).toBe("FAILED");
  });
  it("ara durumlar (GONDERILDI/OKUNAMADI) eşlenmez → no-op", () => {
    expect(ELECTRONIC_DELIVERY_TO_TEBLIGAT_STATUS["GONDERILDI"]).toBeUndefined();
    expect(ELECTRONIC_DELIVERY_TO_TEBLIGAT_STATUS["OKUNAMADI"]).toBeUndefined();
  });
});

describe("TebligatService.recordElectronicResult", () => {
  const build = (tebligat: any, delivery: any) => {
    const prisma: any = {
      tebligat: {
        findFirst: jest.fn().mockResolvedValue(tebligat),
        update: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    };
    const debtorService: any = {
      syncServiceStatusInTx: jest.fn().mockResolvedValue({ debtorId: "d1", addressId: "a1", newStatus: "DELIVERED", channel: "UETS", returnReason: null }),
      runServiceResultIntelligence: jest.fn().mockResolvedValue(undefined),
    };
    const uetsService: any = { checkDeliveryStatus: jest.fn().mockResolvedValue(delivery) };
    const svc = new TebligatService(prisma, debtorService, uetsService);
    return { svc, prisma, debtorService, uetsService };
  };

  it("UETS + TESLIM_EDILDI + caseDebtorId → Tebligat.status=TESLIM_EDILDI + sync(channel=UETS,DELIVERED) + istihbarat", async () => {
    const { svc, prisma, debtorService } = build(
      { id: "tb1", channel: "UETS", barcodeNo: "UETS123", caseDebtorId: "cd1", addressId: "a1" },
      { uetsNo: "UETS123", status: "TESLIM_EDILDI", deliveredAt: new Date() }
    );

    const res = await svc.recordElectronicResult("t1", "tb1");

    const upd = prisma.tebligat.update.mock.calls[0][0].data;
    expect(upd.status).toBe("TESLIM_EDILDI");
    expect(upd.deliveredAt).toBeInstanceOf(Date);
    expect(debtorService.syncServiceStatusInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ caseDebtorId: "cd1", newStatus: "DELIVERED", channel: "UETS", addressId: "a1" })
    );
    expect(debtorService.runServiceResultIntelligence).toHaveBeenCalledWith("t1", "d1", "a1", "DELIVERED", "UETS", null);
    expect(res.synced).toBe(true);
  });

  it("KEP kanalı da korunur (channel=KEP sync'e geçer)", async () => {
    const { svc, debtorService } = build(
      { id: "tb2", channel: "KEP", barcodeNo: "KEP9", caseDebtorId: "cd1", addressId: "a1" },
      { uetsNo: "KEP9", status: "TESLIM_EDILDI", deliveredAt: new Date() }
    );

    await svc.recordElectronicResult("t1", "tb2");

    expect(debtorService.syncServiceStatusInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ channel: "KEP" })
    );
  });

  it("HATA → status=IPTAL (FAILED) → CaseDebtor sync YOK + istihbarat YOK", async () => {
    const { svc, prisma, debtorService } = build(
      { id: "tb3", channel: "UETS", barcodeNo: "UETS5", caseDebtorId: "cd1", addressId: "a1" },
      { uetsNo: "UETS5", status: "HATA", errorMessage: "kayıtlı değil" }
    );

    const res = await svc.recordElectronicResult("t1", "tb3");

    expect(prisma.tebligat.update.mock.calls[0][0].data.status).toBe("IPTAL");
    expect(debtorService.syncServiceStatusInTx).not.toHaveBeenCalled();
    expect(debtorService.runServiceResultIntelligence).not.toHaveBeenCalled();
    expect(res.synced).toBe(false);
  });

  it("caseDebtorId yok → Tebligat güncellenir ama sync NO-OP (synced=false)", async () => {
    const { svc, prisma, debtorService } = build(
      { id: "tb4", channel: "UETS", barcodeNo: "UETS7", caseDebtorId: null, addressId: null },
      { uetsNo: "UETS7", status: "TESLIM_EDILDI", deliveredAt: new Date() }
    );

    const res = await svc.recordElectronicResult("t1", "tb4");

    expect(prisma.tebligat.update.mock.calls[0][0].data.status).toBe("TESLIM_EDILDI");
    expect(debtorService.syncServiceStatusInTx).not.toHaveBeenCalled();
    expect(res.synced).toBe(false);
  });

  it("ara durum (GONDERILDI) → durum değiştirilmez, no-op", async () => {
    const { svc, prisma, debtorService } = build(
      { id: "tb5", channel: "UETS", barcodeNo: "UETS8", caseDebtorId: "cd1", addressId: "a1" },
      { uetsNo: "UETS8", status: "GONDERILDI" }
    );

    const res = await svc.recordElectronicResult("t1", "tb5");

    expect(prisma.tebligat.update).not.toHaveBeenCalled();
    expect(debtorService.syncServiceStatusInTx).not.toHaveBeenCalled();
    expect(res.synced).toBe(false);
  });

  it("elektronik olmayan kanal (PTT) → BadRequest", async () => {
    const { svc } = build(
      { id: "tb6", channel: "PTT", barcodeNo: "X", caseDebtorId: "cd1", addressId: "a1" },
      { uetsNo: "X", status: "TESLIM_EDILDI" }
    );

    await expect(svc.recordElectronicResult("t1", "tb6")).rejects.toThrow(/elektronik kanaldan/);
  });

  it("barcodeNo (UETS/KEP No) yok → BadRequest", async () => {
    const { svc } = build(
      { id: "tb7", channel: "UETS", barcodeNo: null, caseDebtorId: "cd1", addressId: "a1" },
      { uetsNo: "X", status: "TESLIM_EDILDI" }
    );

    await expect(svc.recordElectronicResult("t1", "tb7")).rejects.toThrow(/numarası/);
  });
});
