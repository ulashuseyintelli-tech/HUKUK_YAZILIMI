/**
 * ADR-014 Wave 0.2 - scenario materializer (PAYMENT + Conditional Option B REVERSAL).
 *
 * This test-support adapter consumes the canonical ScenarioDefinition and creates
 * deterministic persistence state in one transaction. It does not calculate,
 * allocate, cancel, journal, emit events, or become production authority.
 *
 * Governance reconciliation (2026-07-10, owner decision — bağlayıcı): Conditional
 * Option B GEÇERLİDİR. REVERSAL direct-write, YALNIZ test/disposable DB kapsamında,
 * `reversesLedgerEntryId` zorunlu ilişkiyle, opt-in olarak desteklenir.
 * GUARDRAIL: Materializer PASS, production tahsilat-iptal write-path'inin
 * doğrulandığı anlamına GELMEZ — o ayrı bir DB-gated integration testidir (PR-1B).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import type { ScenarioDefinition } from '../scenario-support/scenario-definition';

/** Conditional Option B — REVERSAL kurulum niyeti (contract DEĞİL; DB-setup detayı). */
export interface MaterializeReversalIntent {
  /** ScenarioDefinition.domainInput.payments[].id — orijinal PAYMENT ledger satırı. */
  ofPaymentId: string;
  /** Verilmezse orijinal tutarın negatifi yazılır (production cancel deseniyle aynı işaret). */
  amount?: number;
}

export interface MaterializeOptions {
  /** Conditional Option B direct-write REVERSAL kurulumları (opt-in). */
  reversals?: MaterializeReversalIntent[];
}

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
  reversalLedgerEntryIds: string[];
  /**
   * Conditional Option B kanıt işareti (serbest-metin metadata — yeni enum DEĞİL):
   * timeline/outbox/journal/audit yazılmadı; production cancel write-path'i
   * BU KURULUMLA doğrulanmış SAYILMAZ.
   */
  writePathNote: string;
}

const WRITE_PATH_NOTE =
  'WRITE_PATH_NOT_EXERCISED: materializer direct-write kurulumudur; ' +
  'timeline/outbox/journal/audit uretilmedi ve gercek tahsilat-iptal ' +
  'production write-path bu kurulumla dogrulanmis sayilmaz (PR-1B ayri gate).';

const DOMAIN_TO_PRISMA_INTEREST: Record<string, 'YASAL' | 'TICARI' | 'SABIT'> = {
  LEGAL_3095: 'YASAL',
  COMMERCIAL_AVANS_3095_2_2: 'TICARI',
  CONTRACTUAL: 'SABIT',
  COMMERCIAL_FIXED: 'SABIT',
};

function toPrismaInterestType(code: string): 'YASAL' | 'TICARI' | 'SABIT' {
  const mapped = DOMAIN_TO_PRISMA_INTEREST[code];
  if (!mapped) {
    throw new Error(
      `materializeScenario: interestType '${code}' icin Prisma ters-koprusu tanimli degil; girdi desteklenmiyor.`,
    );
  }
  return mapped;
}

function projectionItemType(
  code: string,
  category: 'COST' | 'ANCILLARY',
): 'FEE' | 'EXPENSE' | 'ATTORNEY_FEE' | 'CHECK_PENALTY' | 'OTHER' {
  if (category === 'COST' && code === 'HARC') return 'FEE';
  if (category === 'COST' && code === 'TEBLIGAT_MASRAFI') return 'EXPENSE';
  if (code === 'VEKALET_UCRETI') return 'ATTORNEY_FEE';
  if (code === 'CEK_TAZMINATI') return 'CHECK_PENALTY';
  if (category === 'ANCILLARY' && code === 'DIGER') return 'OTHER';
  throw new Error(
    `materializeScenario: ${category} projection code '${code}' icin canonical ClaimItem ters-koprusu yok.`,
  );
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
  opts: MaterializeOptions,
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
      caseDate: def.domainInput.enforcementDate
        ? new Date(`${def.domainInput.enforcementDate}T00:00:00.000Z`)
        : undefined,
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
        interestRate: bucket.fixedRate == null ? undefined : bucket.fixedRate * 100,
        interestStartDate: new Date(bucket.startDate),
        interestAccrualStatus: 'ACCRUES',
      },
    });
    claimItemIds.push(item.id);

    for (const [code, amount] of Object.entries(bucket.costs ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (amount == null) continue;
      const projection = await tx.claimItem.create({
        data: {
          id: entityId(def, 'claim-cost', `${index}-${code}`),
          tenantId: tenant.id,
          caseId: caseRow.id,
          itemType: projectionItemType(code, 'COST'),
          originalAmount: amount,
          demandedAmount: amount,
          amount,
          currency: bucket.currency,
          interestAccrualStatus: 'NO_INTEREST',
        },
      });
      claimItemIds.push(projection.id);
    }
    for (const [code, amount] of Object.entries(bucket.ancillaries ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (amount == null) continue;
      const projection = await tx.claimItem.create({
        data: {
          id: entityId(def, 'claim-ancillary', `${index}-${code}`),
          tenantId: tenant.id,
          caseId: caseRow.id,
          itemType: projectionItemType(code, 'ANCILLARY'),
          originalAmount: amount,
          demandedAmount: amount,
          amount,
          currency: bucket.currency,
          interestAccrualStatus: 'NO_INTEREST',
        },
      });
      claimItemIds.push(projection.id);
    }
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

  // ── REVERSAL (Conditional Option B — direct-write, G1 zorunlu ilişki) ───────
  const reversalLedgerEntryIds: string[] = [];
  for (const [index, rev] of (opts.reversals ?? []).entries()) {
    const original = await tx.ledgerEntry.findFirst({
      where: { id: rev.ofPaymentId, tenantId: tenant.id, caseId: caseRow.id, entryType: 'PAYMENT' },
    });
    if (!original) {
      throw new Error(
        `materializeScenario: REVERSAL icin orijinal PAYMENT bulunamadi (ofPaymentId=${rev.ofPaymentId}) - G1 iliski zorunlu.`,
      );
    }
    const reversal = await tx.ledgerEntry.create({
      data: {
        id: entityId(def, 'reversal', index),
        tenantId: tenant.id,
        caseId: caseRow.id,
        collectionId: original.collectionId,
        entryType: 'REVERSAL',
        amount: rev.amount ?? -Number(original.amount),
        currency: original.currency,
        entryDate: original.entryDate,
        reversesLedgerEntryId: original.id,
      },
    });
    reversalLedgerEntryIds.push(reversal.id);
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
    reversalLedgerEntryIds,
    writePathNote: WRITE_PATH_NOTE,
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
  opts: MaterializeOptions = {},
): Promise<MaterializedScenarioRefs> {
  try {
    return await prisma.$transaction((tx) => materializeInTransaction(tx, def, opts));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateScenarioMaterializationError(def.id, error);
    }
    throw error;
  }
}

/**
 * Test/disposable DB cleanup scoped to the materializer-created tenants.
 * REVERSAL satırları önce silinir — `reversesLedgerEntryId` self-FK'sı
 * `onDelete: Restrict` olduğundan orijinal PAYMENT satırı REVERSAL hâlâ ona
 * işaret ederken silinemez.
 */
export async function cleanupMaterializedScenario(
  prisma: PrismaClient,
  refs: MaterializedScenarioRefs,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({ where: { tenantId: refs.tenantId, entryType: 'REVERSAL' } });
    await tx.ledgerEntry.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.collection.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.claimItem.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.caseDebtor.deleteMany({ where: { case: { tenantId: refs.tenantId } } });
    await tx.case.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.debtor.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.client.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.rateSchedule.deleteMany({ where: { tenantId: refs.tenantId } });
    await tx.office.deleteMany({ where: { id: refs.tenantId } });
    const tenantIds = [refs.tenantId, ...(refs.secondaryTenantId ? [refs.secondaryTenantId] : [])];
    await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });
}
