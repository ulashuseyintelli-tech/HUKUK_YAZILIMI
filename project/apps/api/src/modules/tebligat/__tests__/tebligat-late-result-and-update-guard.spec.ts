import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CaseDebtorLifecycleStatus } from "@prisma/client";
import { TebligatService } from "../tebligat.service";
import { CaseDebtorLifecycleGuardService } from "../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service";
import { TebligatStatus } from "../dto/tebligat.dto";

/**
 * P1-I13 (R02-A, owner "ACCEPT-AS-HISTORICAL-EVIDENCE" + "GENERIC-UPDATE-DENIED-FOR-PASSIVE"):
 * update() PASSIVE CaseDebtor için genel/geniş düzeltme yüzeyi olarak reddedilir; markAsSent()
 * (ve zaten guard'sız olan recordPttResult/recordElectronicResult — bkz. tebligat-electronic-result.spec.ts)
 * dar/tek yönlü ratified late-result kanalları olarak guard'sız kalır.
 */
describe("P1-I13 (R02-A) TebligatService — update() genel guard vs late-result kanalları", () => {
  const buildCaseDebtor = (overrides: Record<string, unknown> = {}) => ({
    id: "cd-1",
    caseId: "case-1",
    debtorId: "debtor-1",
    case: { tenantId: "tenant-1" },
    lifecycleStatus: CaseDebtorLifecycleStatus.ACTIVE,
    ...overrides,
  });

  const buildTebligat = (overrides: Record<string, unknown> = {}) => ({
    id: "tb-1",
    tenantId: "tenant-1",
    caseId: "case-1",
    caseDebtorId: "cd-1",
    channel: "PTT",
    status: TebligatStatus.GONDERILDI,
    barcodeNo: "PTT1",
    ...overrides,
  });

  const build = (opts: { caseDebtor?: any; tebligat?: any } = {}) => {
    const caseDebtorFixture = opts.caseDebtor === undefined ? buildCaseDebtor() : opts.caseDebtor;
    const tebligatFixture = opts.tebligat === undefined ? buildTebligat() : opts.tebligat;

    const prisma: any = {
      tebligat: {
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          if (!tebligatFixture) return null;
          if (where.id && tebligatFixture.id !== where.id) return null;
          if (where.tenantId && tebligatFixture.tenantId !== where.tenantId) return null;
          return { ...tebligatFixture };
        }),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...tebligatFixture, ...data })),
      },
      caseDebtor: {
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          if (!caseDebtorFixture) return null;
          if (where.id && caseDebtorFixture.id !== where.id) return null;
          if (where.case?.tenantId && caseDebtorFixture.case?.tenantId !== where.case.tenantId) return null;
          if (where.case?.id && caseDebtorFixture.caseId !== where.case.id) return null;
          return {
            id: caseDebtorFixture.id,
            caseId: caseDebtorFixture.caseId,
            debtorId: caseDebtorFixture.debtorId,
            lifecycleStatus: caseDebtorFixture.lifecycleStatus,
          };
        }),
        // withCaseDebtorLifecycleMetadata: findMany kasıtlı olarak tanımlanmadı — guard'dan
        // bağımsız salt-okuma annotation yolu bu testlerin kapsamı dışında, no-op'a düşer.
      },
    };

    const guard = new CaseDebtorLifecycleGuardService(prisma);
    const svc = new TebligatService(prisma, {} as any, {} as any, guard, {} as any, {} as any);
    return { svc, prisma, tebligatFixture, caseDebtorFixture };
  };

  it("1) ACTIVE CaseDebtor'a bağlı tebligat update() başarılı olur ve guard doğru argümanlarla çağrılır", async () => {
    const { svc, prisma } = build();

    const result = await svc.update("tenant-1", "tb-1", { notes: "not" } as any);

    expect(prisma.caseDebtor.findFirst).toHaveBeenCalledWith({
      where: { id: "cd-1", case: { tenantId: "tenant-1", id: "case-1" } },
      select: { id: true, caseId: true, debtorId: true, lifecycleStatus: true },
    });
    expect(prisma.tebligat.update).toHaveBeenCalledTimes(1);
    expect(result.notes).toBe("not");
  });

  it("2) PASSIVE CaseDebtor'a bağlı tebligat update() BadRequestException ile reddedilir, yazma denenmez", async () => {
    const { svc, prisma } = build({
      caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }),
    });

    await expect(svc.update("tenant-1", "tb-1", { notes: "not" } as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.tebligat.update).not.toHaveBeenCalled();
  });

  it("3) CaseDebtor tamamen bulunamazsa update() NotFoundException fırlatır, yazma denenmez", async () => {
    const { svc, prisma } = build({ caseDebtor: null });

    await expect(svc.update("tenant-1", "tb-1", { notes: "not" } as any)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.tebligat.update).not.toHaveBeenCalled();
  });

  it("4) cross-tenant CaseDebtor, tamamen-yok ile AYNI güvenli hatayı üretir (varlık sızıntısı yok), yazma denenmez", async () => {
    const notFound = build({ caseDebtor: null });
    const crossTenant = build({
      caseDebtor: buildCaseDebtor({ case: { tenantId: "tenant-2" } }),
    });

    let notFoundMessage = "";
    let crossTenantMessage = "";
    try {
      await notFound.svc.update("tenant-1", "tb-1", { notes: "not" } as any);
    } catch (e: any) {
      notFoundMessage = e.message;
    }
    try {
      await crossTenant.svc.update("tenant-1", "tb-1", { notes: "not" } as any);
    } catch (e: any) {
      crossTenantMessage = e.message;
    }

    expect(notFoundMessage).toBe("Dosya borçlusu bulunamadı.");
    expect(crossTenantMessage).toBe("Dosya borçlusu bulunamadı.");
    expect(crossTenant.prisma.tebligat.update).not.toHaveBeenCalled();
  });

  it("5) wrong-case: CaseDebtor başka bir dosyaya aitse update() NotFoundException ile reddedilir (expectedCaseId ihlali)", async () => {
    const { svc, prisma } = build({
      caseDebtor: buildCaseDebtor({ caseId: "case-OTHER" }),
    });

    await expect(svc.update("tenant-1", "tb-1", { notes: "not" } as any)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.tebligat.update).not.toHaveBeenCalled();
  });

  it("6) caseDebtorId=null olan tebligat için update() guard'ı hiç çağırmaz, serbestçe güncellenir", async () => {
    const { svc, prisma } = build({
      tebligat: buildTebligat({ caseDebtorId: null }),
    });

    const result = await svc.update("tenant-1", "tb-1", { notes: "bağımsız" } as any);

    expect(prisma.caseDebtor.findFirst).not.toHaveBeenCalled();
    expect(prisma.tebligat.update).toHaveBeenCalledTimes(1);
    expect(result.notes).toBe("bağımsız");
  });

  it("7) PASSIVE CaseDebtor için markAsSent() başarıyla tamamlanır (ratified late-result kanalı etkilenmez)", async () => {
    const { svc, prisma } = build({
      caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }),
    });

    const result = await svc.markAsSent("tenant-1", "tb-1", "PTT-YENI");

    expect(prisma.tebligat.update).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(TebligatStatus.GONDERILDI);
  });

  it("8) markAsSent() caller'ın status seçimine bakılmaksızın her zaman yalnız GONDERILDI yazar (dar/tek yönlü imza)", async () => {
    const { svc, prisma } = build({
      caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }),
    });

    await svc.markAsSent("tenant-1", "tb-1", "PTT-YENI");

    expect(prisma.tebligat.update).toHaveBeenCalledWith({
      where: { id: "tb-1" },
      data: {
        status: TebligatStatus.GONDERILDI,
        sentAt: expect.any(Date),
        barcodeNo: "PTT-YENI",
      },
    });
  });

  it("9) PASSIVE CaseDebtor için markAsSent() sırasında caseDebtor.findFirst HİÇ çağrılmaz (guard tamamen devre dışı, yalnız non-throw değil)", async () => {
    const { svc, prisma } = build({
      caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }),
    });

    await svc.markAsSent("tenant-1", "tb-1");

    expect(prisma.caseDebtor.findFirst).not.toHaveBeenCalled();
  });

  it("10) PASSIVE CaseDebtor için markAsSent() task/adres-workflow gibi başka hiçbir delege çağırmaz (fake prisma'da tanımsız delege çağrılsaydı throw ederdi)", async () => {
    const { svc } = build({
      caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }),
    });

    await expect(svc.markAsSent("tenant-1", "tb-1")).resolves.toBeDefined();
  });

  it("11) PASSIVE CaseDebtor için update() reddi tekrar (replay) edilse de idempotent biçimde reddeder, kısmi/degişken yazma birikmez", async () => {
    const { svc, prisma } = build({
      caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }),
    });

    await expect(svc.update("tenant-1", "tb-1", { notes: "1" } as any)).rejects.toThrow(
      BadRequestException,
    );
    await expect(svc.update("tenant-1", "tb-1", { notes: "2" } as any)).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.tebligat.update).not.toHaveBeenCalled();
  });

  it("12) guard her update() çağrısında CANLI sorgu yapar: ACTIVE iken başarılı, sonradan PASSIFLEŞTİRİLİNCE aynı tebligat için reddedilir (stale snapshot YOK)", async () => {
    const { svc, prisma, caseDebtorFixture } = build();

    await expect(svc.update("tenant-1", "tb-1", { notes: "ilk" } as any)).resolves.toBeDefined();
    expect(prisma.tebligat.update).toHaveBeenCalledTimes(1);

    caseDebtorFixture.lifecycleStatus = CaseDebtorLifecycleStatus.PASSIVE;

    await expect(svc.update("tenant-1", "tb-1", { notes: "ikinci" } as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.tebligat.update).toHaveBeenCalledTimes(1);
  });

  it("13) update() PASSIVE için reddedilse de AYNI tebligat için sonraki markAsSent() çağrısı başarıyla tamamlanır (geniş yüzey reddi dar yüzeyi engellemez)", async () => {
    const { svc, prisma } = build({
      caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }),
    });

    await expect(svc.update("tenant-1", "tb-1", { status: TebligatStatus.IPTAL } as any)).rejects.toThrow(
      BadRequestException,
    );
    await expect(svc.markAsSent("tenant-1", "tb-1", "PTT-SON")).resolves.toBeDefined();

    expect(prisma.tebligat.update).toHaveBeenCalledTimes(1);
  });

  it("14) ACTIVE yolda update() tüm DTO alanlarını (status/sentAt/deliveredAt/notes/barcodeNo) doğru eşler (guard eklenmesi mevcut yazma şeklini bozmadı)", async () => {
    const { svc, prisma } = build();

    await svc.update("tenant-1", "tb-1", {
      status: TebligatStatus.TESLIM_EDILDI,
      sentAt: "2026-01-01T00:00:00.000Z",
      deliveredAt: "2026-01-02T00:00:00.000Z",
      notes: "not",
      barcodeNo: "PTT-X",
    } as any);

    expect(prisma.tebligat.update).toHaveBeenCalledWith({
      where: { id: "tb-1" },
      data: {
        status: TebligatStatus.TESLIM_EDILDI,
        sentAt: new Date("2026-01-01T00:00:00.000Z"),
        deliveredAt: new Date("2026-01-02T00:00:00.000Z"),
        notes: "not",
        barcodeNo: "PTT-X",
      },
    });
  });

  it("15) caller DTO'ya caseDebtorId/lifecycleStatus gibi ilgisiz alanlar eklese de guard her zaman tebligatın KENDİ persisted caseDebtorId/caseId'sini kullanır", async () => {
    const { svc, prisma } = build();

    await svc.update("tenant-1", "tb-1", {
      notes: "not",
      caseDebtorId: "baska-cd",
      lifecycleStatus: "ACTIVE",
    } as any);

    expect(prisma.caseDebtor.findFirst).toHaveBeenCalledWith({
      where: { id: "cd-1", case: { tenantId: "tenant-1", id: "case-1" } },
      select: { id: true, caseId: true, debtorId: true, lifecycleStatus: true },
    });
  });
});
