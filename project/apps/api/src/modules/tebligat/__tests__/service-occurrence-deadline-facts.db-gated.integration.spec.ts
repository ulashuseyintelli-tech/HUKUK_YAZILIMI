/**
 * DEBTOR-OF01-HISTORY-P04-A1 — ServiceOccurrence deadline-facts + LegalDeadlineSnapshot
 * tenant-safe occurrence-binding disposable-DB entegrasyon testleri.
 *
 * Bu dosya SADECE schema/migration foundation'ı doğrular (yeni CHECK constraint'ler,
 * genişletilmiş immutability trigger'ı, composite tenant-safe binding FK'si). Deadline
 * hesaplama/consumer/read-path bu görevin KAPSAMI DIŞINDADIR (P04-B/C/D).
 */
import {
  PrismaClient,
  ServiceOccurrenceType,
  ServiceOccurrenceTimePrecision,
  ServiceOccurrenceServiceDateRole,
  ServiceOccurrenceRegimeCode,
  TebligatAddressType,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { ServiceOccurrenceService } from "../service-occurrence/service-occurrence.service";
import { IdempotencyMode } from "../service-occurrence/service-occurrence.types";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "ServiceOccurrence deadline-facts disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("ServiceOccurrence deadline-facts + LegalDeadlineSnapshot binding — disposable DB", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let service: ServiceOccurrenceService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    service = new ServiceOccurrenceService(prisma as any);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function buildFixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-p04a1-${label}-${suffix}`;

    await prisma.tenant.create({
      data: { id: tenantId, name: `P04-A1 Test ${label}`, slug: `test-p04a1-${label}-${suffix}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: "P04-A1 Test Müvekkil", type: "INDIVIDUAL" },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-P04A1-${randomUUID().slice(0, 6)}`,
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

  async function createSecondTebligat(fx: { tenantId: string; caseId: string; caseDebtorId: string }) {
    return prisma.tebligat.create({
      data: {
        tenantId: fx.tenantId,
        caseId: fx.caseId,
        caseDebtorId: fx.caseDebtorId,
        tebligatType: "ODEME_EMRI",
        addressType: "MERNIS",
        addressText: "Test Adres No:2",
        recipientName: "Test Borçlu",
        channel: "PTT",
      },
    });
  }

  function baseCommand(fx: { tenantId: string; tebligatId: string }, overrides: any = {}) {
    return {
      tenantId: fx.tenantId,
      sourceTebligatId: fx.tebligatId,
      occurrenceType: ServiceOccurrenceType.POSTAL_DELIVERY_RESULT,
      sourceSystemCode: "PTT",
      sourceCode: "TESLIM_EDILDI",
      occurredOn: new Date("2026-07-20T00:00:00Z"),
      timePrecision: ServiceOccurrenceTimePrecision.DATE_ONLY,
      addressTypeAtOccurrence: TebligatAddressType.BILINEN,
      actor: { systemCode: "TEST_HARNESS" },
      idempotencyMode: IdempotencyMode.NONE,
      ...overrides,
    };
  }

  function baseSnapshotData(fx: { tenantId: string; caseId: string; tebligatId: string }, overrides: any = {}) {
    return {
      tenantId: fx.tenantId,
      caseId: fx.caseId,
      sourceTebligatId: fx.tebligatId,
      deadlineType: "OBJECTION_PERIOD" as any,
      legalServiceDate: new Date("2026-07-20T00:00:00Z"),
      dueDate: new Date("2026-07-27T00:00:00Z"),
      calculationRule: "TEST_RULE",
      calculationVersion: "test-v1",
      deadlineReasonCode: "TEST_REASON",
      status: "ACTIVE" as any,
      ...overrides,
    };
  }

  // TEST-01
  it("TEST-01: legacy ServiceOccurrence nullable yeni alanlarla okunabilir", async () => {
    const fx = await buildFixture("t01");
    const created = await prisma.serviceOccurrence.create({
      data: {
        tenantId: fx.tenantId,
        caseId: fx.caseId,
        caseDebtorId: fx.caseDebtorId,
        sourceTebligatId: fx.tebligatId,
        occurrenceType: ServiceOccurrenceType.LEGACY_BASELINE,
        sourceSystemCode: "LEGACY_MIGRATION",
        sourceCode: "UNKNOWN",
        occurredOn: new Date("2020-01-01T00:00:00Z"),
        timePrecision: ServiceOccurrenceTimePrecision.DATE_ONLY,
        recordedBySystem: "LEGACY_MIGRATION",
        provenanceStatus: "LEGACY_CURRENT_STATE" as any,
        // addressTypeAtOccurrence / serviceDateRole KASITLI OLARAK verilmedi (null kalır).
      },
    });

    expect(created.addressTypeAtOccurrence).toBeNull();
    expect(created.serviceDateRole).toBeNull();

    const read = await prisma.serviceOccurrence.findUniqueOrThrow({ where: { id: created.id } });
    expect(read.addressTypeAtOccurrence).toBeNull();
    expect(read.serviceDateRole).toBeNull();
  });

  // TEST-02
  it("TEST-02: yeni non-legacy occurrence gerekli facts olmadan reddedilir", async () => {
    const fx = await buildFixture("t02");

    await expect(
      prisma.serviceOccurrence.create({
        data: {
          tenantId: fx.tenantId,
          caseId: fx.caseId,
          caseDebtorId: fx.caseDebtorId,
          sourceTebligatId: fx.tebligatId,
          occurrenceType: ServiceOccurrenceType.POSTAL_DELIVERY_RESULT,
          sourceSystemCode: "PTT",
          sourceCode: "TESLIM_EDILDI",
          occurredOn: new Date("2026-07-20T00:00:00Z"),
          timePrecision: ServiceOccurrenceTimePrecision.DATE_ONLY,
          recordedByUserId: "user-1",
          // addressTypeAtOccurrence KASITLI OLARAK verilmedi — occ_p04a1_address_type_required_for_nonlegacy_check ihlali beklenir.
        },
      }),
    ).rejects.toThrow();
  });

  // TEST-03
  it("TEST-03: IMMEDIATE_SERVICE occurrence oluşturulabilir (DEBTOR-OF01-HISTORY-P04-A1-R2: DIRECT_DELIVERY'den yeniden adlandırıldı)", async () => {
    const fx = await buildFixture("t03");
    const result = await service.createOccurrence(
      baseCommand(fx, { serviceDateRole: ServiceOccurrenceServiceDateRole.DIRECT_DELIVERY, serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE }) as any,
    );
    expect(result.occurrence.addressTypeAtOccurrence).toBe(TebligatAddressType.BILINEN);
    expect(result.occurrence.serviceDateRole).toBe(ServiceOccurrenceServiceDateRole.DIRECT_DELIVERY);
  });

  // TEST-04
  it("TEST-04: MUHTAR_DELIVERY occurrence oluşturulabilir", async () => {
    const fx = await buildFixture("t04");
    const result = await service.createOccurrence(
      baseCommand(fx, {
        sourceCode: "MUHTARLIGA_BIRAKILDI",
        serviceDateRole: ServiceOccurrenceServiceDateRole.MUHTAR_DELIVERY,
        serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_21_1,
      }) as any,
    );
    expect(result.occurrence.serviceDateRole).toBe(ServiceOccurrenceServiceDateRole.MUHTAR_DELIVERY);
  });

  // TEST-05
  it("TEST-05: PUBLICATION occurrence oluşturulabilir", async () => {
    const fx = await buildFixture("t05");
    const result = await service.createOccurrence(
      baseCommand(fx, {
        addressTypeAtOccurrence: TebligatAddressType.MERNIS,
        sourceCode: "ILANEN_TAMAMLANDI",
        serviceDateRole: ServiceOccurrenceServiceDateRole.PUBLICATION,
        serviceRegimeCode: ServiceOccurrenceRegimeCode.PUBLICATION,
      }) as any,
    );
    expect(result.occurrence.serviceDateRole).toBe(ServiceOccurrenceServiceDateRole.PUBLICATION);
  });

  // TEST-06
  it("TEST-06: immutable facts (addressTypeAtOccurrence/serviceDateRole) update edilemez", async () => {
    const fx = await buildFixture("t06");
    const result = await service.createOccurrence(
      baseCommand(fx, { serviceDateRole: ServiceOccurrenceServiceDateRole.DIRECT_DELIVERY, serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE }) as any,
    );

    await expect(
      prisma.serviceOccurrence.update({
        where: { id: result.occurrence.id },
        data: { addressTypeAtOccurrence: TebligatAddressType.MERNIS },
      }),
    ).rejects.toThrow(/immutable/i);

    await expect(
      prisma.serviceOccurrence.update({
        where: { id: result.occurrence.id },
        data: { serviceDateRole: ServiceOccurrenceServiceDateRole.MUHTAR_DELIVERY },
      }),
    ).rejects.toThrow(/immutable/i);
  });

  // TEST-07
  it("TEST-07: LegalDeadlineSnapshot legacy olarak sourceServiceOccurrenceId null oluşturulabilir", async () => {
    const fx = await buildFixture("t07");
    const snapshot = await prisma.legalDeadlineSnapshot.create({
      data: baseSnapshotData(fx),
    });
    expect(snapshot.sourceServiceOccurrenceId).toBeNull();
  });

  // TEST-08
  it("TEST-08: bir occurrence birden fazla snapshot'a bağlanabilir", async () => {
    const fx = await buildFixture("t08");
    const occ = await service.createOccurrence(
      baseCommand(fx, { serviceDateRole: ServiceOccurrenceServiceDateRole.DIRECT_DELIVERY, serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE }) as any,
    );

    // DEBTOR-SERVICE-OCCURRENCE-SNAPSHOT-INVARIANT-P1-I08: bu testin iddiası 1:MANY
    // FK binding kapasitesidir (bir occurrence, calculationVersion değiştikçe birden
    // fazla snapshot'a kaynaklık edebilir) — İKİ satırın da AYNI ANDA ACTIVE olması
    // DEĞİL. Gerçek supersede zincirinde v1 SUPERSEDED, v2 ACTIVE olur; bu fixture
    // artık LegalDeadlineSnapshot_one_active_per_tebligat invariant'ıyla tutarlı.
    const snap1 = await prisma.legalDeadlineSnapshot.create({
      data: baseSnapshotData(fx, { sourceServiceOccurrenceId: occ.occurrence.id, calculationVersion: "v1", status: "SUPERSEDED" }),
    });
    const snap2 = await prisma.legalDeadlineSnapshot.create({
      data: baseSnapshotData(fx, { sourceServiceOccurrenceId: occ.occurrence.id, calculationVersion: "v2" }),
    });

    expect(snap1.sourceServiceOccurrenceId).toBe(occ.occurrence.id);
    expect(snap2.sourceServiceOccurrenceId).toBe(occ.occurrence.id);
    expect(snap1.id).not.toBe(snap2.id);
  });

  // TEST-09
  it("TEST-09: cross-tenant occurrence/snapshot binding reddedilir", async () => {
    const fxA = await buildFixture("t09a");
    const fxB = await buildFixture("t09b");
    const occA = await service.createOccurrence(
      baseCommand(fxA, { serviceDateRole: ServiceOccurrenceServiceDateRole.DIRECT_DELIVERY, serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE }) as any,
    );

    await expect(
      prisma.legalDeadlineSnapshot.create({
        data: baseSnapshotData(fxB, { sourceServiceOccurrenceId: occA.occurrence.id }),
      }),
    ).rejects.toThrow();
  });

  // TEST-10
  it("TEST-10: snapshot occurrence ve Tebligat farklı parent'lara aitse reddedilir", async () => {
    const fx = await buildFixture("t10");
    const otherTebligat = await createSecondTebligat(fx);
    const occ = await service.createOccurrence(
      baseCommand(fx, { serviceDateRole: ServiceOccurrenceServiceDateRole.DIRECT_DELIVERY, serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE }) as any,
    );

    await expect(
      prisma.legalDeadlineSnapshot.create({
        data: baseSnapshotData(
          { tenantId: fx.tenantId, caseId: fx.caseId, tebligatId: otherTebligat.id },
          { sourceServiceOccurrenceId: occ.occurrence.id },
        ),
      }),
    ).rejects.toThrow();
  });

  // TEST-11
  it("TEST-11: Tebligat composite tenant FK ihlali reddedilir", async () => {
    const fxA = await buildFixture("t11a");
    const fxB = await buildFixture("t11b");

    await expect(
      prisma.legalDeadlineSnapshot.create({
        data: baseSnapshotData({ tenantId: fxA.tenantId, caseId: fxA.caseId, tebligatId: fxB.tebligatId }),
      }),
    ).rejects.toThrow();
  });
});
