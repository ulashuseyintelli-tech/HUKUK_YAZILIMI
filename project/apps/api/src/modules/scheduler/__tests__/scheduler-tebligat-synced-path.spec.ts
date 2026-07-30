/**
 * P0 — PTT barkod sorgusu artık sahte (Math.random) sonuç üretmez.
 *
 * Önceki davranış (PR-S2): cron, Math.random() ile TESLIM_EDILDI/IADE_GELDI/GONDERILDI
 * arasından rastgele seçim yapıp TebligatService.recordPttResult ortak kapısı üzerinden
 * CaseDebtor.serviceStatus'a kadar yazıyordu; IADE halinde case-seviyesi takip görevi de
 * otomatik açılıyordu. Gerçek PTT API entegrasyonu olmadığından bu, uydurma tebliğ tarihi
 * → yanlış itiraz süresi/kesinleşme riski taşıyordu (P0 güvenlik/hukuki-doğruluk düzeltmesi).
 *
 * Yeni davranış: gerçek entegrasyon gelene kadar queryPttBarcode hiçbir yazma yan etkisi
 * üretmez (recordPttResult/tebligat.update/task.create hiçbiri çağrılmaz), yalnızca uyarı
 * loglar. queryElectronicDelivery (UETS/KEP) değişmedi — hâlâ recordElectronicResult ortak
 * kapısından geçer.
 */

import { SchedulerService } from "../scheduler.service";

describe("SchedulerService — cron tebligat synced-path (P0: PTT mock kapatıldı)", () => {
  const build = () => {
    const prisma: any = {
      tebligat: { update: jest.fn().mockResolvedValue({}) },
      case: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "c1", fileNumber: "2024/1", tenantId: "t1", sorumluPersonelId: "u9" }),
      },
      task: { create: jest.fn().mockResolvedValue({}) },
    };
    const metrics: any = { record: jest.fn() };
    const tebligatService: any = {
      recordPttResult: jest.fn().mockResolvedValue({}),
      recordElectronicResult: jest.fn().mockResolvedValue({ synced: true }),
    };
    const errorReporter: any = { reportCronError: jest.fn() };
    const caseDebtorLifecycleGuard: any = { isPassiveByCaseAndDebtor: jest.fn().mockResolvedValue(false) };
    const svc = new SchedulerService(prisma, metrics, tebligatService, errorReporter, caseDebtorLifecycleGuard);
    return { svc, prisma, tebligatService };
  };

  const ptt = { id: "tb1", tenantId: "t1", barcodeNo: "PTT9", caseId: "c1", recipientName: "Ali Veli", channel: "PTT" };

  it("queryPttBarcode: gerçek entegrasyon yok → hiçbir yazma yan etkisi tetiklenmez (recordPttResult/update/task.create)", async () => {
    const { svc, prisma, tebligatService } = build();

    await (svc as any).queryPttBarcode(ptt);

    expect(tebligatService.recordPttResult).not.toHaveBeenCalled();
    expect(prisma.tebligat.update).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("queryPttBarcode: çağrı sorunsuz tamamlanır (cron çökmez)", async () => {
    const { svc } = build();

    await expect((svc as any).queryPttBarcode(ptt)).resolves.toBeUndefined();
  });

  it("UETS/KEP → recordElectronicResult(tenant, id); db.tebligat.update DOĞRUDAN çağrılmaz", async () => {
    const { svc, prisma, tebligatService } = build();
    const eTebligat = { id: "tb2", tenantId: "t1", barcodeNo: "UETS5", channel: "UETS" };

    await (svc as any).queryElectronicDelivery(eTebligat);

    expect(tebligatService.recordElectronicResult).toHaveBeenCalledWith("t1", "tb2");
    expect(prisma.tebligat.update).not.toHaveBeenCalled();
  });

  it("queryElectronicDelivery: recordElectronicResult hata fırlatırsa cron çökmez (best-effort, yutulur)", async () => {
    const { svc, tebligatService } = build();
    tebligatService.recordElectronicResult.mockRejectedValueOnce(new Error("boom"));
    const eTebligat = { id: "tb2", tenantId: "t1", barcodeNo: "UETS5", channel: "UETS" };

    await expect((svc as any).queryElectronicDelivery(eTebligat)).resolves.toBeUndefined();
  });
});
