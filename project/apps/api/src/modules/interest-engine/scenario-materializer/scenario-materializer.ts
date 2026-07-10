/**
 * ADR-014 Wave 0.2 - PAYMENT-only scenario materializer.
 *
 * This test-support adapter consumes the canonical ScenarioDefinition and creates
 * deterministic persistence state in one transaction. It does not calculate,
 * allocate, cancel, journal, emit events, or become production authority.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import type { ScenarioDefinition } from '../scenario-support/scenario-definition';

export interface MaterializedScenarioRefs {
  scenarioId: string;
  tenantId: string;
  secondaryTenantId?: string;
  clientId: string;
  debtorId: string;
  caseId: string;
  caseDebtorId: string;
  claimItemIds: string[];
  collectionIds: string[];
  paymentLedgerEntryIds: string[];
}

const DOMAIN_TO_PRISMA_INTEREST: Record<string, 'YASAL' | 'TICARI'> = {
  LEGAL_3095: 'YASAL',
  COMMERCIAL_AVANS_3095_2_2: 'TICARI',
};

function toPrismaInterestType(code: string): 'YASAL' | 'TICARI' {
  const mapped = DOMAIN_TO_PRISMA_INTEREST[code];
  if (!mapped) {
    throw new Error(
      `materializeScenario: interestType '${code}' icin Prisma ters-koprusu tanimli degil; girdi desteklenmiyor.`,
    );
  }
  return mapped;
}

function entityId(def: ScenarioDefinition, kind: string, suffix?: string | number): string {
  return ['w02', def.id, kind, suffix].filter((part) => part !== undefined).join('-');
}

class DuplicateScenarioMaterializationError extends Error {
  readonly code = 'W02_DUPLICATE_MATERIALIZATION';

  constructor(scenarioId: string, cause: unknown) {
    super(
      `materializeScenario: scenario '${scenarioId}' daha once materialize edilmis veya canonical persistence kimlikleri baska bir scenario tarafindan kullaniliyor.`,
    );
    this.name = 'DuplicateScenarioMaterializationError';
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

async function materializeInTransaction(
  tx: Prisma.TransactionClient,
  def: ScenarioDefinition,
): Promise<MaterializedScenarioRefs> {
  const tenant = await tx.tenant.create({
    data: {
      id: entityId(def, 'tenant'),
      name: `W0.2 Scenario Tenant (${def.id})`,
      slug: entityId(def, 'scenario'),
    },
  });

  let secondaryTenantId: string | undefined;
  if (def.persistenceIntent.tenantSetup === 'TWO_TENANT_ISOLATION') {
    const second = await tx.tenant.create({
      data: {
        id: entityId(def, 'tenant-b'),
        name: `W0.2 Isolation Tenant (${def.id})`,
        slug: entityId(def, 'scenario-b'),
      },
    });
    secondaryTenantId = second.id;
  }

  const client = await tx.client.create({
    data: {
      id: entityId(def, 'client'),
      tenantId: tenant.id,
      type: 'INDIVIDUAL',
      displayName: `W0.2 Muvekkil ${def.id}`,
    },
  });

  const debtor = await tx.debtor.create({
    data: {
      id: entityId(def, 'debtor'),
      tenantId: tenant.id,
      type: 'INDIVIDUAL',
      name: `W0.2 Borclu ${def.id}`,
    },
  });

  const caseRow = await tx.case.create({
    data: {
      id: entityId(def, 'case'),
      tenantId: tenant.id,
      clientId: client.id,
      fileNumber: entityId(def, 'file'),
      type: 'GENERAL_EXECUTION',
      caseStatus: 'DERDEST',
      status: 'ACTIVE',
      currency: def.persistenceIntent.currency,
    },
  });

  const caseDebtor = await tx.caseDebtor.create({
    data: {
      id: entityId(def, 'case-debtor'),
      caseId: caseRow.id,
      debtorId: debtor.id,
      role: 'ASIL_BORCLU',
    },
  });

  const claimItemIds: string[] = [];
  for (const [index, bucket] of def.domainInput.claimBuckets.entries()) {
    const item = await tx.claimItem.create({
      data: {
        id: entityId(def, 'claim', index),
        tenantId: tenant.id,
        caseId: caseRow.id,
        itemType: 'PRINCIPAL',
        originalAmount: bucket.amount,
        demandedAmount: bucket.amount,
        amount: bucket.amount,
        currency: bucket.currency,
        interestType: toPrismaInterestType(bucket.interestType),
        interestStartDate: new Date(bucket.startDate),
        interestAccrualStatus: 'ACCRUES',
      },
    });
    claimItemIds.push(item.id);
  }

  const collectionIds: string[] = [];
  const paymentLedgerEntryIds: string[] = [];
  for (const [index, payment] of def.domainInput.payments.entries()) {
    const collection = await tx.collection.create({
      data: {
        id: entityId(def, 'collection', index),
        tenantId: tenant.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
        amount: payment.amount,
        currency: payment.currency,
        type: 'BANK_TRANSFER',
        date: new Date(payment.date),
        idempotencyKey: entityId(def, 'payment', index),
      },
    });
    collectionIds.push(collection.id);

    const ledger = await tx.ledgerEntry.create({
      data: {
        id: payment.id,
        tenantId: tenant.id,
        caseId: caseRow.id,
        collectionId: collection.id,
        entryType: 'PAYMENT',
        amount: payment.amount,
        currency: payment.currency,
        entryDate: new Date(payment.date),
      },
    });
    paymentLedgerEntryIds.push(ledger.id);
  }

  return {
    scenarioId: def.id,
    tenantId: tenant.id,
    ...(secondaryTenantId ? { secondaryTenantId } : {}),
    clientId: client.id,
    debtorId: debtor.id,
    caseId: caseRow.id,
    caseDebtorId: caseDebtor.id,
    claimItemIds,
    collectionIds,
    paymentLedgerEntryIds,
  };
}

/**
 * Canonical scenario -> disposable DB state.
 *
 * All writes commit together. Unsupported input and duplicate execution leave
 * no partial records. A duplicate is reported with a stable technical code;
 * the original Prisma error remains available as Error.cause.
 */
export async function materializeScenario(
  prisma: PrismaClient,
  def: ScenarioDefinition,
): Promise<MaterializedScenarioRefs> {
  try {
    return await prisma.$transaction((tx) => materializeInTransaction(tx, def));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateScenarioMaterializationError(def.id, error);
    }
    throw error;
  }
}

/** Test/disposable DB cleanup scoped to the materializer-created tenants. */
export async function cleanupMaterializedScenario(
  prisma: PrismaClient,
  refs: MaterializedScenarioRefs,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.collection.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.claimItem.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.caseDebtor.deleteMany({ where: { case: { tenantId: refs.tenantId } } });
    await tx.case.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.debtor.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.client.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.rateSchedule.deleteMany({ where: { tenantId: refs.tenantId } });
    const tenantIds = [refs.tenantId, ...(refs.secondaryTenantId ? [refs.secondaryTenantId] : [])];
    await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });
}
