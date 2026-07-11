/**
 * PR-EA-2: EnforcementAction.tenantId + caseDebtorId additive schema migration —
 * disposable-DB schema/FK validation only. No producer/consumer/runtime behavior is exercised.
 *
 * Bkz. docs/design/enforcement-action-tenant-case-debtor-migration.md Bölüm 6/8/12.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('PR-EA-2 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('PR-EA-2 EnforcementAction tenantId/caseDebtorId FK - disposable DB', () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(tenantId);
    }
    await prisma.$disconnect();
  });

  async function cleanupTenant(tenantId: string) {
    await prisma.enforcementAction.deleteMany({ where: { case: { tenantId } } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    createdTenantIds.delete(tenantId);
  }

  async function buildScopedFixture() {
    const tenantId = `test-ea-fk-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);

    await prisma.tenant.create({
      data: { id: tenantId, name: 'PR-EA-2 Test Tenant', slug: `test-ea-fk-${randomUUID().slice(0, 8)}` },
    });

    const client = await prisma.client.create({
      data: { tenantId, displayName: 'PR-EA-2 Test Muvekkil', type: 'INDIVIDUAL' },
    });

    const debtor = await prisma.debtor.create({
      data: { tenantId, name: 'PR-EA-2 Test Borclu', type: 'INDIVIDUAL' },
    });

    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-EA-${randomUUID().slice(0, 6)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
      },
    });

    const caseDebtor = await prisma.caseDebtor.create({
      data: { caseId: caseRow.id, debtorId: debtor.id, role: 'ASIL_BORCLU' },
    });

    return { tenantId, caseId: caseRow.id, caseDebtorId: caseDebtor.id };
  }

  it('allows caseDebtorId=null and tenantId=null (backward compatibility with pre-migration rows)', async () => {
    const { caseId } = await buildScopedFixture();

    const action = await prisma.enforcementAction.create({
      data: { caseId, type: 'BANK_INQUIRY' },
    });

    expect(action.tenantId).toBeNull();
    expect(action.caseDebtorId).toBeNull();
  });

  it('persists tenantId and caseDebtorId when provided (same tenant/case)', async () => {
    const { tenantId, caseId, caseDebtorId } = await buildScopedFixture();

    const action = await prisma.enforcementAction.create({
      data: { caseId, tenantId, caseDebtorId, type: 'BANK_SEIZURE' },
    });

    expect(action.tenantId).toBe(tenantId);
    expect(action.caseDebtorId).toBe(caseDebtorId);

    const reread = await prisma.enforcementAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(reread.tenantId).toBe(tenantId);
    expect(reread.caseDebtorId).toBe(caseDebtorId);
  });

  it('rejects CaseDebtor delete while referenced by EnforcementAction.caseDebtorId (onDelete: Restrict, D10)', async () => {
    const { tenantId, caseId, caseDebtorId } = await buildScopedFixture();

    await prisma.enforcementAction.create({
      data: { caseId, tenantId, caseDebtorId, type: 'VEHICLE_SEIZURE' },
    });

    await expect(prisma.caseDebtor.delete({ where: { id: caseDebtorId } })).rejects.toThrow();

    const stillThere = await prisma.caseDebtor.findUnique({ where: { id: caseDebtorId } });
    expect(stillThere).not.toBeNull();
  });

  it('cascades EnforcementAction delete when the referenced Tenant is deleted (onDelete: Cascade, Collection.tenant precedent)', async () => {
    const { tenantId, caseId, caseDebtorId } = await buildScopedFixture();

    const action = await prisma.enforcementAction.create({
      data: { caseId, tenantId, caseDebtorId, type: 'PROPERTY_INQUIRY' },
    });

    // This fixture has no rows outside the Tenant/Client/Debtor/Case/CaseDebtor/EnforcementAction
    // chain, and every relation in that chain is onDelete: Cascade — so a direct Tenant delete
    // exercises EnforcementAction.tenantId's own Cascade path (in parallel with the pre-existing
    // caseId->Case Cascade path) without needing manual child cleanup first.
    await prisma.tenant.delete({ where: { id: tenantId } });
    createdTenantIds.delete(tenantId);

    const gone = await prisma.enforcementAction.findUnique({ where: { id: action.id } });
    expect(gone).toBeNull();
  });

  it('creates the three new indexes required by the migration (tenantId, caseDebtorId, tenantId+caseId)', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'EnforcementAction'`,
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('EnforcementAction_tenantId_idx');
    expect(names).toContain('EnforcementAction_caseDebtorId_idx');
    expect(names).toContain('EnforcementAction_tenantId_caseId_idx');
  });
});
