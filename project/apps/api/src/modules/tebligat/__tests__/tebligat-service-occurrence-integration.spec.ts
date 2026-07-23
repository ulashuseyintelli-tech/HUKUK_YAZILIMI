/**
 * DEBTOR-OF01-HISTORY-P03 — TebligatService.recordPttResult() ServiceOccurrence/outbox
 * atomik entegrasyon unit testleri (Prisma mock). Disposable-DB rollback kanıtı için bkz.
 * tebligat-service-occurrence-write.db-gated.integration.spec.ts.
 */
import { TebligatService } from "../tebligat.service";
import { TebligatPttResult } from "../dto/tebligat.dto";

function buildHarness(overrides: { createOccurrence?: any; appendEvent?: any } = {}) {
  const tebligat = {
    id: "tb-1",
    channel: "PTT",
    barcodeNo: "PTT-100",
    caseId: "case-1",
    caseDebtorId: "cd-1",
    addressId: "a1",
    addressType: "BILINEN",
  };
  const prisma: any = {
    tebligat: {
      findFirst: jest.fn().mockResolvedValue(tebligat),
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
  };
  const debtorService: any = {
    syncServiceStatusInTx: jest.fn().mockResolvedValue({
      debtorId: "d1",
      addressId: "a1",
      newStatus: "DELIVERED",
      channel: "NORMAL",
      returnReason: null,
    }),
    runServiceResultIntelligence: jest.fn().mockResolvedValue(undefined),
  };
  const caseDebtorLifecycleGuard: any = { assertActiveByCaseDebtorId: jest.fn() };
  const uetsService: any = {
    checkDeliveryStatus: jest.fn().mockResolvedValue({ status: "TESLIM_EDILDI", deliveredAt: new Date("2026-07-21T00:00:00Z") }),
  };
  const serviceOccurrenceService: any = {
    createWithinTransaction:
      overrides.createOccurrence ??
      jest.fn().mockResolvedValue({
        occurrence: { id: "occ-1", recordedAt: new Date("2026-07-22T00:00:00Z") },
        created: true,
      }),
  };
  const domainEventIngestService: any = {
    appendInTransaction: overrides.appendEvent ?? jest.fn().mockResolvedValue({ aggregateVersion: BigInt(1) }),
  };
  const svc = new TebligatService(
    prisma,
    debtorService,
    uetsService,
    caseDebtorLifecycleGuard,
    serviceOccurrenceService,
    domainEventIngestService,
  );
  return { svc, prisma, debtorService, serviceOccurrenceService, domainEventIngestService, uetsService, tebligat };
}

describe("TebligatService.recordPttResult — ServiceOccurrence/outbox entegrasyonu", () => {
  it("TEST-01/02/03/04: doğru occurrence mapping'i üretir (occurrenceType/sourceSystemCode/occurredOn/occurredAt/timePrecision)", async () => {
    const { svc, serviceOccurrenceService } = buildHarness();

    await svc.recordPttResult(
      "t1",
      "tb-1",
      { pttResult: TebligatPttResult.TESLIM_EDILDI, pttResultDate: "2026-07-20" } as any,
      "user-1",
    );

    expect(serviceOccurrenceService.createWithinTransaction).toHaveBeenCalledTimes(1);
    const [, command] = serviceOccurrenceService.createWithinTransaction.mock.calls[0];
    expect(command.occurrenceType).toBe("POSTAL_DELIVERY_RESULT");
    expect(command.sourceSystemCode).toBe("MANUAL");
    expect(command.sourceCode).toBe(TebligatPttResult.TESLIM_EDILDI);
    expect(command.occurredOn).toEqual(new Date("2026-07-20"));
    expect(command.occurredAt).toBeNull();
    expect(command.timePrecision).toBe("DATE_ONLY");
  });

  it("TEST-05: authenticated actor recordedByUserId olarak aktarılır", async () => {
    const { svc, serviceOccurrenceService } = buildHarness();

    await svc.recordPttResult("t1", "tb-1", { pttResult: TebligatPttResult.TESLIM_EDILDI } as any, "actor-42");

    const [, command] = serviceOccurrenceService.createWithinTransaction.mock.calls[0];
    expect(command.actor).toEqual({ userId: "actor-42" });
  });

  it("TEST-06: caseId/caseDebtorId command'da YOK — parent'tan (ServiceOccurrenceService içinde) türetilir, caller command'a koyamaz", async () => {
    const { svc, serviceOccurrenceService } = buildHarness();

    await svc.recordPttResult("t1", "tb-1", { pttResult: TebligatPttResult.TESLIM_EDILDI } as any, "user-1");

    const [tx, command] = serviceOccurrenceService.createWithinTransaction.mock.calls[0];
    expect(command).not.toHaveProperty("caseId");
    expect(command).not.toHaveProperty("caseDebtorId");
    expect(command.sourceTebligatId).toBe("tb-1");
    expect(tx).toBeDefined();
  });

  it("TEST-07: ServiceOccurrence create başarısızsa recordPttResult reddedilir", async () => {
    const { svc, prisma } = buildHarness({
      createOccurrence: jest.fn().mockRejectedValue(new Error("occurrence create failed")),
    });

    await expect(
      svc.recordPttResult("t1", "tb-1", { pttResult: TebligatPttResult.TESLIM_EDILDI } as any, "user-1"),
    ).rejects.toThrow("occurrence create failed");
    // $transaction callback'i hata fırlattı — gerçek Prisma'da bu tüm transaction'ı rollback eder
    // (disposable-DB kanıtı: tebligat-service-occurrence-write.db-gated.integration.spec.ts TEST-12).
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("TEST-08: outbox (DomainEventIngestService) append başarısızsa recordPttResult reddedilir", async () => {
    const { svc, prisma, serviceOccurrenceService } = buildHarness({
      appendEvent: jest.fn().mockRejectedValue(new Error("outbox append failed")),
    });

    await expect(
      svc.recordPttResult("t1", "tb-1", { pttResult: TebligatPttResult.TESLIM_EDILDI } as any, "user-1"),
    ).rejects.toThrow("outbox append failed");
    expect(serviceOccurrenceService.createWithinTransaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("TEST-09: recordElectronicResult hiçbir ServiceOccurrence veya outbox event üretmez", async () => {
    const { svc, serviceOccurrenceService, domainEventIngestService, prisma } = buildHarness();
    prisma.tebligat.findFirst.mockResolvedValue({
      id: "tb-2",
      channel: "UETS",
      barcodeNo: "UETS-1",
      caseId: "case-1",
      caseDebtorId: "cd-1",
      addressId: "a1",
    });

    await svc.recordElectronicResult("t1", "tb-2");

    expect(serviceOccurrenceService.createWithinTransaction).not.toHaveBeenCalled();
    expect(domainEventIngestService.appendInTransaction).not.toHaveBeenCalled();
  });

  // DEBTOR-OF01-HISTORY-P04-A1
  it("TEST-12: recordPttResult doğru addressTypeAtOccurrence yazar (Tebligat.addressType'tan türetilir)", async () => {
    const { svc, serviceOccurrenceService } = buildHarness();

    await svc.recordPttResult("t1", "tb-1", { pttResult: TebligatPttResult.TESLIM_EDILDI } as any, "user-1");

    const [, command] = serviceOccurrenceService.createWithinTransaction.mock.calls[0];
    expect(command.addressTypeAtOccurrence).toBe("BILINEN"); // buildHarness fixture'ının tebligat.addressType'ı
  });

  it("TEST-13: recordPttResult doğru serviceDateRole üretir (DIRECT_DELIVERY/MUHTAR_DELIVERY/null)", async () => {
    // DIRECT_DELIVERY — başarılı teslim.
    {
      const { svc, serviceOccurrenceService } = buildHarness();
      await svc.recordPttResult("t1", "tb-1", { pttResult: TebligatPttResult.TESLIM_EDILDI } as any, "user-1");
      const [, command] = serviceOccurrenceService.createWithinTransaction.mock.calls[0];
      expect(command.serviceDateRole).toBe("DIRECT_DELIVERY");
    }
    // MUHTAR_DELIVERY — muhtarlığa bırakıldı (bilinen adres).
    {
      const { svc, serviceOccurrenceService } = buildHarness();
      await svc.recordPttResult("t1", "tb-1", { pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI } as any, "user-1");
      const [, command] = serviceOccurrenceService.createWithinTransaction.mock.calls[0];
      expect(command.serviceDateRole).toBe("MUHTAR_DELIVERY");
    }
    // null — başarısız/yönlendirme sonucu (hiçbir teslim/tevdi mekanizması gerçekleşmedi).
    {
      const { svc, serviceOccurrenceService } = buildHarness();
      await svc.recordPttResult("t1", "tb-1", { pttResult: TebligatPttResult.ADRESTE_BULUNAMADI } as any, "user-1");
      const [, command] = serviceOccurrenceService.createWithinTransaction.mock.calls[0];
      expect(command.serviceDateRole).toBeNull();
      expect(command.addressTypeAtOccurrence).toBe("BILINEN"); // context fact yine de dolu
    }
    // Operatörün açıkça seçtiği TK m.20 override — pttResult'tan BAĞIMSIZ MUHTAR_DELIVERY.
    {
      const { svc, serviceOccurrenceService } = buildHarness();
      await svc.recordPttResult(
        "t1",
        "tb-1",
        {
          pttResult: TebligatPttResult.ADRESTE_BULUNAMADI,
          tk21Type: "TK_20",
          ilanDate: "2026-07-15",
          // DEBTOR-OF01-HISTORY-P04-A1-R2 STOP-03 çözümü: artık zorunlu operatör girdisi.
          tk20CompletionMode: "NOTICE_POSTED",
          tk20CompletionDate: "2026-07-15",
        } as any,
        "user-1",
      );
      const [, command] = serviceOccurrenceService.createWithinTransaction.mock.calls[0];
      expect(command.serviceDateRole).toBe("MUHTAR_DELIVERY");
    }
  });

  it("TEST-14: belirsiz/desteklenmeyen pttResult uydurma serviceDateRole üretmeden fail eder", async () => {
    const { svc } = buildHarness();

    await expect(
      svc.recordPttResult("t1", "tb-1", { pttResult: "TAMAMEN_BILINMEYEN_DEGER" } as any, "user-1"),
    ).rejects.toThrow(/serviceDateRole belirlenemedi/);
  });
});
