import type { PrismaClient } from '@prisma/client';
import { FIXTURE_DATE, FIXTURE_TENANT_ID, PERSISTED_FIXTURES, SENTINEL_TENANT_ID } from './manifest';

const PREFIX = 'pra42-';
const SENTINEL_CASE_ID = 'pra42-sentinel-case';
const SENTINEL_CLAIM_ID = 'pra42-sentinel-claim';

export interface FixtureResidue {
  tenants: number;
  cases: number;
  claimItems: number;
  dues: number;
}

export async function countFixtureResidue(prisma: PrismaClient): Promise<FixtureResidue> {
  const [tenants, cases, claimItems, dues] = await Promise.all([
    prisma.tenant.count({ where: { id: { startsWith: PREFIX } } }),
    prisma.case.count({ where: { id: { startsWith: PREFIX } } }),
    prisma.claimItem.count({ where: { id: { startsWith: PREFIX } } }),
    prisma.due.count({ where: { id: { startsWith: PREFIX } } }),
  ]);
  return { tenants, cases, claimItems, dues };
}

export async function seedDiagnosticFixture(prisma: PrismaClient): Promise<void> {
  const now = new Date(FIXTURE_DATE);
  await prisma.$transaction(async (tx) => {
    await tx.tenant.create({ data: { id: FIXTURE_TENANT_ID, name: 'PR-A4-2 Diagnostic Fixture', slug: 'pra42-fixture-tenant' } });
    await tx.tenant.create({ data: { id: SENTINEL_TENANT_ID, name: 'PR-A4-2 Unrelated Sentinel', slug: 'pra42-unrelated-tenant' } });

    for (const entry of PERSISTED_FIXTURES) {
      const caseId = `${entry.fixtureId}-case`;
      const dueId = `${entry.fixtureId}-due`;
      await tx.case.create({
        data: {
          id: caseId, tenantId: FIXTURE_TENANT_ID, fileNumber: `${entry.fixtureId}/2025`, type: 'GENERAL_EXECUTION',
          interestType: entry.caseInput.legacyInterestType as never,
          interestStartDate: entry.caseInput.interestStartDate ? new Date(entry.caseInput.interestStartDate) : null,
          caseDate: now, createdAt: now, updatedAt: now,
        },
      });
      await tx.due.create({
        data: {
          id: dueId, caseId, type: 'PRINCIPAL', amount: entry.claimItemInput.amount,
          dueDate: now, currency: entry.claimItemInput.currency,
          interestType: entry.dueProjection?.legacyInterestType ?? null,
          interestTypeCode: (entry.dueProjection?.richInterestTypeCode ?? null) as never,
          interestStartDate: entry.dueProjection?.interestStartDate ? new Date(entry.dueProjection.interestStartDate) : null,
          createdAt: now, updatedAt: now,
        },
      });
      const audit = entry.claimItemInput.noInterestAudit;
      await tx.claimItem.create({
        data: {
          id: `${entry.fixtureId}-claim`, tenantId: FIXTURE_TENANT_ID, caseId,
          itemType: entry.claimItemInput.itemType as never, status: entry.claimItemInput.status as never,
          originalAmount: entry.claimItemInput.amount, demandedAmount: entry.claimItemInput.amount,
          amount: entry.claimItemInput.amount, currency: entry.claimItemInput.currency,
          liableDebtorIds: [], interestTypeCode: entry.claimItemInput.richInterestTypeCode as never,
          interestType: entry.claimItemInput.legacyInterestType as never,
          interestRate: entry.claimItemInput.interestRate,
          interestStartDate: entry.claimItemInput.interestStartDate ? new Date(entry.claimItemInput.interestStartDate) : null,
          interestStartDateProvenance: entry.claimItemInput.interestStartDateProvenance as never,
          interestAccrualStatus: entry.claimItemInput.interestAccrualStatus as never,
          noInterestReason: audit?.reason ?? null, noInterestConfirmedById: audit?.confirmedById ?? null,
          noInterestConfirmedAt: audit?.confirmedAt ? new Date(audit.confirmedAt) : null,
          metadata: {
            dueSync: { sourceDueId: dueId },
            ...(entry.claimItemInput.depositTermProvenance
              ? { uyap: { depositTerm: entry.claimItemInput.depositTermProvenance } } : {}),
          },
          createdAt: now, updatedAt: now,
        },
      });
    }

    await tx.case.create({
      data: { id: SENTINEL_CASE_ID, tenantId: SENTINEL_TENANT_ID, fileNumber: 'sentinel/2025', type: 'GENERAL_EXECUTION', caseDate: now },
    });
    await tx.claimItem.create({
      data: {
        id: SENTINEL_CLAIM_ID, tenantId: SENTINEL_TENANT_ID, caseId: SENTINEL_CASE_ID,
        itemType: 'PRINCIPAL', originalAmount: '1.00', demandedAmount: '1.00', amount: '1.00',
        currency: 'TRY', liableDebtorIds: [], interestTypeCode: 'LEGAL_3095', interestType: 'YASAL',
        interestStartDate: now, interestAccrualStatus: 'ACCRUES',
      },
    });
  });
}

export async function cleanupTargetFixture(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.claimItem.deleteMany({ where: { tenantId: FIXTURE_TENANT_ID } });
    await tx.due.deleteMany({ where: { case: { tenantId: FIXTURE_TENANT_ID } } });
    await tx.case.deleteMany({ where: { tenantId: FIXTURE_TENANT_ID } });
    await tx.tenant.deleteMany({ where: { id: FIXTURE_TENANT_ID } });
  });
}

export async function cleanupSentinelFixture(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.claimItem.deleteMany({ where: { tenantId: SENTINEL_TENANT_ID } });
    await tx.due.deleteMany({ where: { case: { tenantId: SENTINEL_TENANT_ID } } });
    await tx.case.deleteMany({ where: { tenantId: SENTINEL_TENANT_ID } });
    await tx.tenant.deleteMany({ where: { id: SENTINEL_TENANT_ID } });
  });
}

export async function sentinelExists(prisma: PrismaClient): Promise<boolean> {
  return (await prisma.claimItem.count({ where: { id: SENTINEL_CLAIM_ID, tenantId: SENTINEL_TENANT_ID } })) === 1;
}
