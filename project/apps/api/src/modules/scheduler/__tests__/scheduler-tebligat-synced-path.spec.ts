/**
 * PR-S2 — cron tebligat sonuçları ortak senkron yoluna alındı.
 * Doğrulanan: cron artık db.tebligat.update'i DOĞRUDAN çağırmaz; tüm sonuçlar
 * TebligatService.recordPttResult / recordElectronicResult kapısından geçer (doğru tenant/id ile),
 * IADE halinde case-seviyesi takip görevi (createTebligatFollowupTask) recordPttResult'tan SONRA korunur.
 */

import { SchedulerService } from "../scheduler.service";
import { TebligatPttResult } from "../../tebligat/dto/tebligat.dto";

describe("SchedulerService — cron tebligat synced-path (PR-S2)", () => {
  const build = () => {
    const prisma: any = {
      tebligat: { update: jest.fn().mockResolvedValue({}) },
      case: { findUnique: jest.fn().mockResolvedValue({ id: "c1", fileNumber: "2024/1", tenantId: "t1" }) },
      task: { create: jest.fn().mockResolvedValue({}) },
    };
    const metrics: any = { record: jest.fn() };
    const tebligatService: any = {
      recordPttResult: jest.fn().mockResolvedValue({}),
      recordElectronicResult: jest.fn().mockResolvedValue({ synced: true }),
    };
    const svc = new SchedulerService(prisma, metrics, tebligatService);
    return { svc, prisma, tebligatService };
  };

  const ptt = { id: "tb1", tenantId: "t1", barcodeNo: "PTT9", caseId: "c1", recipientName: "Ali Veli", channel: "PTT" };

  afterEach(() => jest.spyOn(Math, "random").mockRestore?.());

  it("PTT TESLIM_EDILDI → recordPttResult(tenant, id, {TESLIM_EDILDI}); db.tebligat.update DOĞRUDAN çağrılmaz", async () => {
    const { svc, prisma, tebligatService } = build();
    jest.spyOn(Math, "random").mockReturnValue(0); // index 0 → TESLIM_EDILDI

    await (svc as any).queryPttBarcode(ptt);

    expect(tebligatService.recordPttResult).toHaveBeenCalledWith(
      "t1",
      "tb1",
      expect.objectContaining({ pttResult: TebligatPttResult.TESLIM_EDILDI })
    );
    expect(prisma.tebligat.update).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled(); // teslimde takip görevi yok
  });

  it("PTT IADE_GELDI → recordPttResult(ADRESTE_BULUNAMADI) + SONRA createTebligatFollowupTask; doğrudan update yok", async () => {
    const { svc, prisma, tebligatService } = build();
    jest.spyOn(Math, "random").mockReturnValue(0.5); // index 1 → IADE_GELDI

    await (svc as any).queryPttBarcode(ptt);

    expect(tebligatService.recordPttResult).toHaveBeenCalledWith(
      "t1",
      "tb1",
      expect.objectContaining({ pttResult: TebligatPttResult.ADRESTE_BULUNAMADI })
    );
    expect(prisma.task.create).toHaveBeenCalled(); // A kararı: case-seviyesi takip görevi korunur
    expect(prisma.tebligat.update).not.toHaveBeenCalled();
  });

  it("PTT GONDERILDI (sonuç yok) → no-op (recordPttResult, update, followup hiçbiri yok)", async () => {
    const { svc, prisma, tebligatService } = build();
    jest.spyOn(Math, "random").mockReturnValue(0.9); // index 2 → GONDERILDI

    await (svc as any).queryPttBarcode(ptt);

    expect(tebligatService.recordPttResult).not.toHaveBeenCalled();
    expect(prisma.tebligat.update).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("UETS/KEP → recordElectronicResult(tenant, id); db.tebligat.update DOĞRUDAN çağrılmaz", async () => {
    const { svc, prisma, tebligatService } = build();
    const eTebligat = { id: "tb2", tenantId: "t1", barcodeNo: "UETS5", channel: "UETS" };

    await (svc as any).queryElectronicDelivery(eTebligat);

    expect(tebligatService.recordElectronicResult).toHaveBeenCalledWith("t1", "tb2");
    expect(prisma.tebligat.update).not.toHaveBeenCalled();
  });

  it("recordPttResult hata fırlatırsa cron çökmez (best-effort, yutulur)", async () => {
    const { svc, tebligatService } = build();
    jest.spyOn(Math, "random").mockReturnValue(0);
    tebligatService.recordPttResult.mockRejectedValueOnce(new Error("boom"));

    await expect((svc as any).queryPttBarcode(ptt)).resolves.toBeUndefined();
  });
});
