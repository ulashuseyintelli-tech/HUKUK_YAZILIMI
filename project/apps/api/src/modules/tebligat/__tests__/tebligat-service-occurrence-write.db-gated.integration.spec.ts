/**
 * DEBTOR-OF01-HISTORY-P03 — recordPttResult() atomik entegrasyon: disposable-DB kanıtı.
 * Tebligat + CaseDebtor sync + ServiceOccurrence + outbox (IcrabotTimelineEntry+IcrabotOutboxAction)
 * TEK transaction'da; herhangi bir adım başarısız olursa TÜM transaction rollback olur.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { TebligatService } from "../tebligat.service";
import { TebligatPttResult } from "../dto/tebligat.dto";
import { ServiceOccurrenceService } from "../service-occurrence/service-occurrence.service";
import { DomainEventIngestService } from "../../icrabot/domain-event-ingest/domain-event-ingest.service";
import { AggregateVersionAllocator } from "../../icrabot/domain-event-ingest/aggregate-version-allocator";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "recordPttResult ServiceOccurrence entegrasyon disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("TebligatService.recordPttResult — ServiceOccurrence/outbox disposable-DB", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function buildFixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-p03-${label}-${suffix}`;

    await prisma.tenant.create({
      data: { id: tenantId, name: `P03 Test ${label}`, slug: `test-p03-${label}-${suffix}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: "P03 Test Müvekkil", type: "INDIVIDUAL" },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-P03-${randomUUID().slice(0, 6)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
        isAutoMode: false,
        workflowStage: "PAYMENT_ORDER" as any,
      },
    });
    const debtor = await prisma.debtor.create({
      data: { tenantId, type: "INDIVIDUAL", firstName: "Test", lastName: "Borçlu", name: "Test Borçlu" },
    });
    const caseDebtor = await prisma.caseDebtor.create({
      data: { caseId: caseRow.id, debtorId: debtor.id },
    });
    const tebligat = await prisma.tebligat.create({
      data: {
        tenantId,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
        tebligatType: "ODEME_EMRI",
        addressType: "BILINEN",
        addressText: "Test Adres No:1",
        recipientName: "Test Borçlu",
        channel: "PTT",
      },
    });

    return { tenantId, caseId: caseRow.id, caseDebtorId: caseDebtor.id, tebligatId: tebligat.id };
  }

  /** debtorService.syncServiceStatusInTx'in GERÇEK bir CaseDebtor.serviceStatus update'i yapan dar test-double'ı —
   * TEST-11'in "4 gerçek write aynı tx'te" iddiasını anlamlı kılar. Prod DebtorService'in kendi zengin
   * davranışını TAKLİT ETMEZ (istihbarat tetiği vb. kapsam dışı) — yalnız atomik-write kanıtı için gerekli olanı yapar. */
  function buildRealisticDebtorServiceStub() {
    return {
      syncServiceStatusInTx: jest.fn().mockImplementation(async (tx: any, args: any) => {
        await tx.caseDebtor.update({ where: { id: args.caseDebtorId }, data: { serviceStatus: args.newStatus } });
        return {
          debtorId: "stub-debtor",
          addressId: args.addressId,
          newStatus: args.newStatus,
          channel: args.channel,
          returnReason: args.returnReason,
        };
      }),
      runServiceResultIntelligence: jest.fn().mockResolvedValue(undefined),
    };
  }

  function buildService(overrides: { domainEventIngestService?: any } = {}) {
    const serviceOccurrenceService = new ServiceOccurrenceService(prisma as any);
    const domainEventIngestService =
      overrides.domainEventIngestService ?? new DomainEventIngestService(new AggregateVersionAllocator());
    const debtorService = buildRealisticDebtorServiceStub();
    const caseDebtorLifecycleGuard: any = { assertActiveByCaseDebtorId: jest.fn() };
    const uetsService: any = {
      checkDeliveryStatus: jest.fn().mockResolvedValue({ status: "TESLIM_EDILDI", deliveredAt: new Date() }),
    };
    const svc = new TebligatService(
      prisma as any,
      debtorService as any,
      uetsService,
      caseDebtorLifecycleGuard,
      serviceOccurrenceService,
      domainEventIngestService,
    );
    return { svc, debtorService };
  }

  // TEST-10 + TEST-11
  it("TEST-10/11: başarılı recordPttResult — Tebligat+CaseDebtor+ServiceOccurrence+outbox AYNI transaction'da 4 write üretir", async () => {
    const fx = await buildFixture("happy");
    const { svc } = buildService();

    const result = await svc.recordPttResult(
      fx.tenantId,
      fx.tebligatId,
      { pttResult: TebligatPttResult.TESLIM_EDILDI, pttResultDate: "2026-07-20" } as any,
      "actor-1",
    );

    expect(result.tebligat.status).toBe("TESLIM_EDILDI");

    const caseDebtor = await prisma.caseDebtor.findUniqueOrThrow({ where: { id: fx.caseDebtorId } });
    expect(caseDebtor.serviceStatus).toBe("DELIVERED");

    const occurrences = await prisma.serviceOccurrence.findMany({ where: { tenantId: fx.tenantId, sourceTebligatId: fx.tebligatId } });
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].caseId).toBe(fx.caseId);
    expect(occurrences[0].caseDebtorId).toBe(fx.caseDebtorId);

    const timelineEntries = await (prisma as any).icrabotTimelineEntry.findMany({ where: { caseId: fx.caseId, type: "SERVICE_OCCURRENCE_RECORDED" } });
    expect(timelineEntries).toHaveLength(1);

    const outboxRows = await (prisma as any).icrabotOutboxAction.findMany({ where: { caseId: fx.caseId, actionType: "EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED" } });
    expect(outboxRows).toHaveLength(1);
  });

  // TEST-12
  it("TEST-12: ServiceOccurrence create başarısız olursa Tebligat/CaseDebtor/occurrence/outbox HİÇBİRİ kalıcı olmaz", async () => {
    const fx = await buildFixture("occurrence-fail-rollback");
    const { svc } = buildService();

    // Boş actorUserId → ServiceOccurrenceService.createWithinTransaction kendi validation'ında
    // ServiceOccurrenceValidationError fırlatır (actor.userId VE systemCode ikisi de yok) — gerçek
    // bir uygulama-katmanı reddi, yapay DB hatası enjeksiyonu değil.
    await expect(
      svc.recordPttResult(fx.tenantId, fx.tebligatId, { pttResult: TebligatPttResult.TESLIM_EDILDI } as any, ""),
    ).rejects.toThrow();

    const tebligatAfter = await prisma.tebligat.findUniqueOrThrow({ where: { id: fx.tebligatId } });
    expect(tebligatAfter.status).toBe("HAZIRLANDI"); // değişmedi

    const caseDebtorAfter = await prisma.caseDebtor.findUniqueOrThrow({ where: { id: fx.caseDebtorId } });
    expect(caseDebtorAfter.serviceStatus).toBe("NOT_STARTED"); // değişmedi

    const occurrences = await prisma.serviceOccurrence.findMany({ where: { sourceTebligatId: fx.tebligatId } });
    expect(occurrences).toHaveLength(0);

    const outboxRows = await (prisma as any).icrabotOutboxAction.findMany({ where: { caseId: fx.caseId } });
    expect(outboxRows).toHaveLength(0);
  });

  // TEST-13
  it("TEST-13: outbox append başarısız olursa (ServiceOccurrence insert BAŞARILI olsa dahi) HİÇBİRİ kalıcı olmaz", async () => {
    const fx = await buildFixture("outbox-fail-rollback");
    const failingDomainEventIngest: any = {
      appendInTransaction: jest.fn().mockRejectedValue(new Error("forced outbox failure")),
    };
    const { svc } = buildService({ domainEventIngestService: failingDomainEventIngest });

    await expect(
      svc.recordPttResult(fx.tenantId, fx.tebligatId, { pttResult: TebligatPttResult.TESLIM_EDILDI } as any, "actor-1"),
    ).rejects.toThrow("forced outbox failure");

    const tebligatAfter = await prisma.tebligat.findUniqueOrThrow({ where: { id: fx.tebligatId } });
    expect(tebligatAfter.status).toBe("HAZIRLANDI");

    const caseDebtorAfter = await prisma.caseDebtor.findUniqueOrThrow({ where: { id: fx.caseDebtorId } });
    expect(caseDebtorAfter.serviceStatus).toBe("NOT_STARTED");

    // ServiceOccurrence insert transaction içinde BAŞARILI olmuştu (rollback'ten önce) — ama
    // transaction rollback olduğu için kalıcı satır YOK.
    const occurrences = await prisma.serviceOccurrence.findMany({ where: { sourceTebligatId: fx.tebligatId } });
    expect(occurrences).toHaveLength(0);
  });

  // TEST-14
  it("TEST-14: cross-tenant Tebligat için hiçbir write oluşmaz", async () => {
    const fxA = await buildFixture("tenant-a");
    const fxB = await buildFixture("tenant-b");
    const { svc } = buildService();

    await expect(
      svc.recordPttResult(fxB.tenantId, fxA.tebligatId, { pttResult: TebligatPttResult.TESLIM_EDILDI } as any, "actor-1"),
    ).rejects.toThrow();

    const occurrences = await prisma.serviceOccurrence.findMany({ where: { sourceTebligatId: fxA.tebligatId } });
    expect(occurrences).toHaveLength(0);
    const tebligatAfter = await prisma.tebligat.findUniqueOrThrow({ where: { id: fxA.tebligatId } });
    expect(tebligatAfter.status).toBe("HAZIRLANDI");
  });

  // TEST-15
  it("TEST-15: occurrence parent scope değerleri (caseId/caseDebtorId/sourceTebligatId) Tebligat ile eşleşir", async () => {
    const fx = await buildFixture("scope-match");
    const { svc } = buildService();

    await svc.recordPttResult(fx.tenantId, fx.tebligatId, { pttResult: TebligatPttResult.TESLIM_EDILDI } as any, "actor-1");

    const occurrence = await prisma.serviceOccurrence.findFirstOrThrow({ where: { sourceTebligatId: fx.tebligatId } });
    expect(occurrence.tenantId).toBe(fx.tenantId);
    expect(occurrence.caseId).toBe(fx.caseId);
    expect(occurrence.caseDebtorId).toBe(fx.caseDebtorId);
    expect(occurrence.sourceTebligatId).toBe(fx.tebligatId);
  });

  // TEST-16
  it("TEST-16: outbox payload minimum ve PII-free sözleşmeye uyar (sourceNote/borçlu adı/TCKN/adres YOK)", async () => {
    const fx = await buildFixture("outbox-payload-shape");
    const { svc } = buildService();

    await svc.recordPttResult(
      fx.tenantId,
      fx.tebligatId,
      { pttResult: TebligatPttResult.TESLIM_EDILDI, pttResultNote: "Test Borçlu — gizli not, adres X" } as any,
      "actor-1",
    );

    const outboxRow = await (prisma as any).icrabotOutboxAction.findFirstOrThrow({ where: { caseId: fx.caseId } });
    const payload = outboxRow.payload as Record<string, unknown>;

    expect(payload).toHaveProperty("eventId");
    expect(payload).toHaveProperty("eventType", "SERVICE_OCCURRENCE_RECORDED");
    expect(payload).toHaveProperty("tenantId", fx.tenantId);
    expect(payload).toHaveProperty("caseId", fx.caseId);
    expect(JSON.stringify(payload)).not.toContain("gizli not");
    expect(JSON.stringify(payload)).not.toContain("adres X");
  });

  // TEST-17
  it("TEST-17: aynı manuel çağrı iki kez yapılırsa iki occurrence oluşabilir (heuristic dedup YOK)", async () => {
    const fx = await buildFixture("no-heuristic-dedup");
    const { svc } = buildService();
    const dto = { pttResult: TebligatPttResult.TESLIM_EDILDI, pttResultDate: "2026-07-20" } as any;

    await svc.recordPttResult(fx.tenantId, fx.tebligatId, dto, "actor-1");
    await svc.recordPttResult(fx.tenantId, fx.tebligatId, dto, "actor-1");

    const occurrences = await prisma.serviceOccurrence.findMany({ where: { sourceTebligatId: fx.tebligatId } });
    expect(occurrences).toHaveLength(2);
  });

  // TEST-18
  it("TEST-18: recordElectronicResult terminal mock status üretse bile ServiceOccurrence/outbox oluşturmaz", async () => {
    const fx = await buildFixture("electronic-no-occurrence");
    await prisma.tebligat.update({ where: { id: fx.tebligatId }, data: { channel: "UETS", barcodeNo: "UETS-100" } });
    const { svc } = buildService();

    const result = await svc.recordElectronicResult(fx.tenantId, fx.tebligatId);
    expect(result.synced).toBe(true); // terminal mock TESLIM_EDILDI + caseDebtorId var

    const occurrences = await prisma.serviceOccurrence.findMany({ where: { sourceTebligatId: fx.tebligatId } });
    expect(occurrences).toHaveLength(0);
    const outboxRows = await (prisma as any).icrabotOutboxAction.findMany({ where: { caseId: fx.caseId } });
    expect(outboxRows).toHaveLength(0);
  });
});
