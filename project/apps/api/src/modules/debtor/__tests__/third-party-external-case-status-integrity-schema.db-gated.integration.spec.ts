import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';

// DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I01 (OWNER D2 POLICY DECISION —
// RATIFIED, CONTRACT+SCHEMA): additive statusSource/statusChangedAt/statusChangedBy/
// statusOccurredAt/externalReference/closureReason alanları + ExternalCaseStatusSource/
// ExternalCaseClosureReason enum'larının gerçek Postgres üzerinde doğrulanması. Bu spec
// yalnız SCHEMA seviyesindedir — transition policy/CAS/audit/authority D2-I02'nin konusu.

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('D2-I01 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('D2-I01 — ExternalCase status-integrity schema (gerçek Postgres)', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createFixture(label: string) {
    const suffix = randomUUID();
    const tenantId = `d2i01-${label}-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `D2-I01 ${label}`, slug: tenantId } });
    const client = await prisma.client.create({
      data: { tenantId, displayName: 'D2-I01 Client', type: 'INDIVIDUAL' },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `D2I01-${suffix.slice(0, 8)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
      },
    });
    const debtor = await prisma.debtor.create({
      data: { tenantId, type: 'INDIVIDUAL', firstName: 'Test', lastName: 'Borclu', name: 'Test Borclu' },
    });
    const caseDebtor = await prisma.caseDebtor.create({
      data: { caseId: caseRow.id, debtorId: debtor.id, lifecycleStatus: 'ACTIVE' },
    });
    return { tenantId, caseId: caseRow.id, caseDebtorId: caseDebtor.id };
  }

  function baseData(fx: { tenantId: string; caseDebtorId: string }, overrides: Record<string, unknown> = {}) {
    return {
      tenantId: fx.tenantId,
      caseDebtorId: fx.caseDebtorId,
      externalOffice: 'Ankara 5. İcra Dairesi',
      externalCaseNo: `2026/${randomUUID().slice(0, 8)}`,
      counterpartyName: 'Karşı Taraf A.Ş.',
      claimAmount: 10000,
      claimCurrency: 'TRY',
      ...overrides,
    };
  }

  it('TEST-1: yeni 6 alan hiç verilmeden create → hepsi null (additive/nullable/backward-compatible)', async () => {
    const fx = await createFixture('t1');
    const row = await prisma.externalCase.create({ data: baseData(fx) });
    expect(row.statusSource).toBeNull();
    expect(row.statusChangedAt).toBeNull();
    expect(row.statusChangedBy).toBeNull();
    expect(row.statusOccurredAt).toBeNull();
    expect(row.externalReference).toBeNull();
    expect(row.closureReason).toBeNull();
    // LEGACY_UNCLASSIFIED semantiği: null üçlü (statusSource/statusChangedBy/statusChangedAt)
    // owner tarafından "sahte backfill değeri üretme" kuralıyla ratifiye edildi.
  });

  it("TEST-2: attachmentStatus default'ı (HACIZ_TALEP) migration sonrası hâlâ korunuyor", async () => {
    const fx = await createFixture('t2');
    const row = await prisma.externalCase.create({ data: baseData(fx) });
    expect(row.attachmentStatus).toBe('HACIZ_TALEP');
  });

  it.each(['MANUAL', 'SYSTEM_DERIVED', 'UYAP_RESULT'])(
    "TEST-3.%s: ExternalCaseStatusSource enum değeri gerçek Postgres'a yazılır/okunur",
    async (source) => {
      const fx = await createFixture(`t3-${source}`);
      const row = await prisma.externalCase.create({
        data: baseData(fx, { statusSource: source as any, statusChangedAt: new Date(), statusChangedBy: 'user-1' }),
      });
      expect(row.statusSource).toBe(source);
    },
  );

  it.each(['FULLY_COLLECTED', 'NEGATIVE_RESPONSE', 'DUPLICATE_RECORD', 'SUPERSEDED', 'OTHER'])(
    "TEST-4.%s: ExternalCaseClosureReason enum değeri gerçek Postgres'a yazılır/okunur",
    async (reason) => {
      const fx = await createFixture(`t4-${reason}`);
      const row = await prisma.externalCase.create({
        data: baseData(fx, { attachmentStatus: 'KAPANDI' as any, closureReason: reason as any }),
      });
      expect(row.closureReason).toBe(reason);
    },
  );

  it('TEST-5: geçersiz statusSource değeri Postgres tarafından reddedilir (enum tip güvenliği)', async () => {
    const fx = await createFixture('t5');
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "ExternalCase" (id, "tenantId", "caseDebtorId", "externalOffice", "externalCaseNo", "counterpartyName", "claimAmount", "statusSource", "createdAt", "updatedAt") VALUES ($1, $2, $3, 'X', 'X', 'X', 100, 'UYDURMA_KAYNAK', now(), now())`,
        randomUUID(),
        fx.tenantId,
        fx.caseDebtorId,
      ),
    ).rejects.toThrow();
  });

  it('TEST-6: mevcut logical-identity composite unique constraint (Phase A) migration sonrası hâlâ aktif', async () => {
    const fx = await createFixture('t6');
    const shared = baseData(fx);
    await prisma.externalCase.create({ data: shared });
    await expect(prisma.externalCase.create({ data: shared })).rejects.toThrow();
  });

  it('TEST-7: externalReference ve statusOccurredAt bağımsız olarak set edilip okunabilir (evidence alanları)', async () => {
    const fx = await createFixture('t7');
    const occurredAt = new Date('2026-01-15T00:00:00.000Z');
    const row = await prisma.externalCase.create({
      data: baseData(fx, {
        attachmentStatus: 'HACIZ_KONDU' as any,
        statusSource: 'MANUAL' as any,
        statusOccurredAt: occurredAt,
        externalReference: 'Haciz Tutanağı No: 2026/ICRA/4521',
      }),
    });
    expect(row.statusOccurredAt?.toISOString()).toBe(occurredAt.toISOString());
    expect(row.externalReference).toBe('Haciz Tutanağı No: 2026/ICRA/4521');
  });
});
