/**
 * DBP-P2-BP-01 (LRV-03B, owner OPTION A) — all-passive automation stop disposable-DB testi.
 *
 * Unit test (all-passive-case-automation-stop.spec.ts) Prisma'yı mock'lar; bu dosya gerçek bir
 * Postgres üzerinde `processCase`'in genişletilmiş `debtors: { select: { lifecycleStatus }}`
 * sorgusunu gerçek satırlardan okuduğunu ve tüm-PASSIVE dosyada otomasyonu fail-closed
 * durdurduğunu (0 EnforcementAction, autoActionsCount değişmez) A/B ile kanıtlar: aynı fixture'da
 * BANK_INQUIRY üretecek durumda önce tüm-PASSIVE'de engellenir, sonra bir borçlu ACTIVE yapılınca
 * aksiyon oluşur — yani guard TEK engelleyici faktördür.
 *
 * Fixture-building convention: enforcement-action-guarded-write-path.db-gated.integration.spec.ts.
 */
import { PrismaClient, CaseDebtorLifecycleStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { WorkflowEngine } from '../workflow-engine.service';
import { RuleEngine } from '../rule-engine.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('DBP-P2-BP-01 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('DBP-P2-BP-01 all-passive automation stop - disposable DB', () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let engine: WorkflowEngine;
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    // Gerçek RuleEngine: BANK_INQUIRY kuralının (ENFORCEMENT + daysSinceLastAction>=1) gerçekten
    // tetiklenip EnforcementAction üretebildiği bir yol; casePolicyEngine/legalPeriod optional (undefined).
    engine = new WorkflowEngine(prisma as any, new RuleEngine(prisma as any), {} as any);
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(tenantId);
    }
    await prisma.$disconnect();
  });

  async function cleanupTenant(tenantId: string) {
    await prisma.enforcementAction.deleteMany({ where: { case: { tenantId } } });
    await prisma.decisionLog.deleteMany({ where: { case: { tenantId } } });
    await prisma.caseLifecycle.deleteMany({ where: { case: { tenantId } } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    createdTenantIds.delete(tenantId);
  }

  /**
   * ENFORCEMENT aşamasında, 3 gün önce bir lifecycle event'i olan (daysSinceLastAction>=1),
   * isAutoMode=true bir dosya kurar; `lifecycles` sırasına göre CaseDebtor'lar yaratır.
   * Bu durumda BANK_INQUIRY kuralı tetiklenmeye HAZIRDIR — otomasyonu engelleyen tek şey guard olur.
   */
  async function buildEnforcementReadyFixture(label: string, lifecycles: CaseDebtorLifecycleStatus[]) {
    const tenantId = `test-bp01-${label}-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);

    await prisma.tenant.create({
      data: { id: tenantId, name: `BP-01 Test Tenant ${label}`, slug: `test-bp01-${label}-${randomUUID().slice(0, 8)}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: 'BP-01 Test Muvekkil', type: 'INDIVIDUAL' },
    });

    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-BP01-${randomUUID().slice(0, 6)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        isAutoMode: true,
        workflowStage: 'ENFORCEMENT',
      },
    });

    // 3 gün önce bir lifecycle event → daysSinceLastAction ~3 (>=1), BANK_INQUIRY tetiklenir.
    await prisma.caseLifecycle.create({
      data: {
        caseId: caseRow.id,
        stage: 'ENFORCEMENT',
        action: 'BP-01 test seed event',
        triggeredBy: 'AUTO',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });

    const caseDebtorIds: string[] = [];
    for (const lifecycleStatus of lifecycles) {
      const debtor = await prisma.debtor.create({
        data: { tenantId, name: `BP-01 Borclu ${randomUUID().slice(0, 4)}`, type: 'INDIVIDUAL' },
      });
      const cd = await prisma.caseDebtor.create({
        data: { caseId: caseRow.id, debtorId: debtor.id, role: 'ASIL_BORCLU', lifecycleStatus },
      });
      caseDebtorIds.push(cd.id);
    }

    return { tenantId, caseId: caseRow.id, caseDebtorIds };
  }

  async function countEnforcementActions(caseId: string): Promise<number> {
    return prisma.enforcementAction.count({ where: { caseId } });
  }

  it('tüm CaseDebtor PASSIVE → BANK_INQUIRY tetiklenmez, 0 EnforcementAction, autoActionsCount değişmez', async () => {
    const { caseId, tenantId } = await buildEnforcementReadyFixture('all-passive', [
      CaseDebtorLifecycleStatus.PASSIVE,
      CaseDebtorLifecycleStatus.PASSIVE,
    ]);

    await engine.processCase(caseId, tenantId);

    expect(await countEnforcementActions(caseId)).toBe(0);
    const after = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { autoActionsCount: true, workflowStage: true } });
    expect(after.autoActionsCount).toBe(0);
    expect(after.workflowStage).toBe('ENFORCEMENT'); // stage değişmez
  });

  it('A/B: aynı all-passive dosyada bir borçlu ACTIVE yapılınca otomasyon çalışır → BANK_INQUIRY EnforcementAction oluşur (guard TEK engelleyici faktör)', async () => {
    const { caseId, tenantId, caseDebtorIds } = await buildEnforcementReadyFixture('ab-flip', [
      CaseDebtorLifecycleStatus.PASSIVE,
      CaseDebtorLifecycleStatus.PASSIVE,
    ]);

    // A) all-passive → engellenir
    await engine.processCase(caseId, tenantId);
    expect(await countEnforcementActions(caseId)).toBe(0);

    // B) bir borçluyu ACTIVE yap → guard artık engellemez → BANK_INQUIRY oluşur
    await prisma.caseDebtor.update({
      where: { id: caseDebtorIds[0] },
      data: { lifecycleStatus: CaseDebtorLifecycleStatus.ACTIVE },
    });
    await engine.processCase(caseId, tenantId);

    expect(await countEnforcementActions(caseId)).toBe(1);
    const action = await prisma.enforcementAction.findFirstOrThrow({ where: { caseId } });
    expect(action.type).toBe('BANK_INQUIRY');
  });

  it('debtorless case (0 CaseDebtor) → all-passive DEĞİL, otomasyon AS-IS çalışır → BANK_INQUIRY oluşur', async () => {
    const { caseId, tenantId } = await buildEnforcementReadyFixture('debtorless', []);

    await engine.processCase(caseId, tenantId);

    expect(await countEnforcementActions(caseId)).toBe(1);
  });
});
