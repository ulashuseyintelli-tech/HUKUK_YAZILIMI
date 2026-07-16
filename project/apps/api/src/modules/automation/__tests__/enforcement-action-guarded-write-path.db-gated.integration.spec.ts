/**
 * PR-EA-4 — Guarded Write Path disposable-DB entegrasyon testi.
 *
 * Unit testler (enforcement-action-guarded-write-path.spec.ts) Prisma'yı mock'lar; bu dosya
 * gerçek composite where clause'ların (Case.id+tenantId, CaseDebtor.id+caseId) gerçek bir
 * Postgres üzerinde doğru satırları eşleştirdiğini/reddettiğini kanıtlar.
 *
 * Bkz. enforcement-action-tenant-case-debtor-fk.db-gated.integration.spec.ts (PR-EA-2) —
 * fixture-building convention buradan izlenir.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { WorkflowEngine } from '../workflow-engine.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('PR-EA-4 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('PR-EA-4 Guarded Write Path - disposable DB', () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let engine: WorkflowEngine;
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    engine = new WorkflowEngine(prisma as any, {} as any, {} as any);
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

  async function buildScopedFixture(label: string) {
    const tenantId = `test-ea4-${label}-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);

    await prisma.tenant.create({
      data: { id: tenantId, name: `PR-EA-4 Test Tenant ${label}`, slug: `test-ea4-${label}-${randomUUID().slice(0, 8)}` },
    });

    const client = await prisma.client.create({
      data: { tenantId, displayName: 'PR-EA-4 Test Muvekkil', type: 'INDIVIDUAL' },
    });

    const debtor = await prisma.debtor.create({
      data: { tenantId, name: 'PR-EA-4 Test Borclu', type: 'INDIVIDUAL' },
    });

    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-EA4-${randomUUID().slice(0, 6)}`,
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

  it('doğru tenant + doğru Case + doğru CaseDebtor → create succeeds, satır tam invariant ile yazılır', async () => {
    const { tenantId, caseId, caseDebtorId } = await buildScopedFixture('happy');

    await engine.createEnforcementAction({
      tenantId,
      caseId,
      caseDebtorId,
      type: 'BANK_INQUIRY',
    });

    const rows = await prisma.enforcementAction.findMany({ where: { caseId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(tenantId);
    expect(rows[0].caseDebtorId).toBe(caseDebtorId);
    expect(rows[0].status).toBe('PENDING');
  });

  it('cross-tenant Case → NotFoundException, hiçbir satır yazılmaz', async () => {
    const { caseId } = await buildScopedFixture('victim');
    const { tenantId: attackerTenantId } = await buildScopedFixture('attacker');

    await expect(
      engine.createEnforcementAction({ tenantId: attackerTenantId, caseId, type: 'BANK_INQUIRY' }),
    ).rejects.toThrow(NotFoundException);

    const rows = await prisma.enforcementAction.findMany({ where: { caseId } });
    expect(rows).toHaveLength(0);
  });

  it('cross-case CaseDebtor (doğru tenant, yanlış Case) → NotFoundException, hiçbir satır yazılmaz', async () => {
    const { tenantId, caseId } = await buildScopedFixture('case-a');
    const { caseDebtorId: debtorFromOtherCase } = await buildScopedFixture('case-b');

    await expect(
      engine.createEnforcementAction({ tenantId, caseId, caseDebtorId: debtorFromOtherCase, type: 'BANK_INQUIRY' }),
    ).rejects.toThrow(NotFoundException);

    const rows = await prisma.enforcementAction.findMany({ where: { caseId } });
    expect(rows).toHaveLength(0);
  });

  it('mevcut olmayan (rastgele) caseId → NotFoundException', async () => {
    const { tenantId } = await buildScopedFixture('nocase');
    await expect(
      engine.createEnforcementAction({ tenantId, caseId: 'non-existent-case-id', type: 'BANK_INQUIRY' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('caseDebtorId verilmeden create → null-compatible, satır tenantId ile birlikte ama caseDebtorId=null yazılır', async () => {
    const { tenantId, caseId } = await buildScopedFixture('null-debtor');
    await engine.createEnforcementAction({ tenantId, caseId, type: 'SALARY_SEIZURE' });

    const rows = await prisma.enforcementAction.findMany({ where: { caseId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(tenantId);
    expect(rows[0].caseDebtorId).toBeNull();
  });

  it('farklı tenantlarda aynı-benzer dosya yapısı → duplicate guard cross-tenant çakışma üretmez', async () => {
    const fixtureA = await buildScopedFixture('dup-a');
    const fixtureB = await buildScopedFixture('dup-b');

    await engine.createEnforcementAction({ tenantId: fixtureA.tenantId, caseId: fixtureA.caseId, type: 'BANK_INQUIRY' });
    await engine.createEnforcementAction({ tenantId: fixtureB.tenantId, caseId: fixtureB.caseId, type: 'BANK_INQUIRY' });

    const rowsA = await prisma.enforcementAction.findMany({ where: { caseId: fixtureA.caseId } });
    const rowsB = await prisma.enforcementAction.findMany({ where: { caseId: fixtureB.caseId } });
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
  });

  it('aynı tenant/case/type için açık action varsa ikinci çağrı no-op kalır (RFA-007 tenant-scoped hali)', async () => {
    const { tenantId, caseId } = await buildScopedFixture('dup-same-tenant');
    await engine.createEnforcementAction({ tenantId, caseId, type: 'BANK_INQUIRY' });
    await engine.createEnforcementAction({ tenantId, caseId, type: 'BANK_INQUIRY' });

    const rows = await prisma.enforcementAction.findMany({ where: { caseId } });
    expect(rows).toHaveLength(1);
  });

  it('backward compatibility: tenantId/caseDebtorId NULL olan tarihsel satırlar bu yeni yazma yolundan etkilenmez', async () => {
    const { caseId } = await buildScopedFixture('legacy-row');
    // Tarihsel (pre-PR-EA-4) satırı simüle et: doğrudan Prisma ile, guarded write-path'i bypass ederek.
    const legacyRow = await prisma.enforcementAction.create({
      data: { caseId, type: 'SALARY_SEIZURE', status: 'PENDING', requestDate: new Date() },
    });
    expect(legacyRow.tenantId).toBeNull();
    expect(legacyRow.caseDebtorId).toBeNull();

    const readBack = await prisma.enforcementAction.findUnique({ where: { id: legacyRow.id } });
    expect(readBack).not.toBeNull();
    expect(readBack!.tenantId).toBeNull();
  });
});

/**
 * LRV-03A / DBP-P2-SEC-P03A — CaseDebtor passivation guard, gerçek Postgres üzerinde.
 *
 * buildScopedFixture() varsayılan olarak ACTIVE bir CaseDebtor üretir (schema @default(ACTIVE));
 * burada fixture'ı gerçek bir UPDATE ile PASSIVE'e çevirip guard'ın gerçek composite where +
 * lifecycleStatus select üzerinde doğru çalıştığı kanıtlanır.
 */
describeWithDisposableDb('LRV-03A — CaseDebtor passivation guard - disposable DB', () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let engine: WorkflowEngine;
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    engine = new WorkflowEngine(prisma as any, {} as any, {} as any);
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

  async function buildScopedFixture(label: string) {
    const tenantId = `test-lrv03a-${label}-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);

    await prisma.tenant.create({
      data: { id: tenantId, name: `LRV-03A Test Tenant ${label}`, slug: `test-lrv03a-${label}-${randomUUID().slice(0, 8)}` },
    });

    const client = await prisma.client.create({
      data: { tenantId, displayName: 'LRV-03A Test Muvekkil', type: 'INDIVIDUAL' },
    });

    const debtor = await prisma.debtor.create({
      data: { tenantId, name: 'LRV-03A Test Borclu', type: 'INDIVIDUAL' },
    });

    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-LRV03A-${randomUUID().slice(0, 6)}`,
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

  it('PASSIVE CaseDebtor hedefli caseDebtorId → BadRequestException, hiçbir satır yazılmaz', async () => {
    const { tenantId, caseId, caseDebtorId } = await buildScopedFixture('passive');
    await prisma.caseDebtor.update({
      where: { id: caseDebtorId },
      data: { lifecycleStatus: 'PASSIVE' },
    });

    await expect(
      engine.createEnforcementAction({ tenantId, caseId, caseDebtorId, type: 'SALARY_SEIZURE' }),
    ).rejects.toThrow(BadRequestException);

    const rows = await prisma.enforcementAction.findMany({ where: { caseId } });
    expect(rows).toHaveLength(0);
  });

  it('ACTIVE CaseDebtor hedefli caseDebtorId → create succeeds (regresyon)', async () => {
    const { tenantId, caseId, caseDebtorId } = await buildScopedFixture('active');

    await engine.createEnforcementAction({ tenantId, caseId, caseDebtorId, type: 'SALARY_SEIZURE' });

    const rows = await prisma.enforcementAction.findMany({ where: { caseId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].caseDebtorId).toBe(caseDebtorId);
  });
});
