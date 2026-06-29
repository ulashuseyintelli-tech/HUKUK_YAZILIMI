import { Prisma, PrismaClient } from '@prisma/client';

const DEFAULT_SEED_KEY = 'tm47d-happy-path-v1';
const CURRENCY = 'TRY';

const PAYABLE_AMOUNT = new Prisma.Decimal('1000');
const EXPENSE_AMOUNT = new Prisma.Decimal('600');
const OFFSET_AMOUNT = new Prisma.Decimal('400');

type SeedDb = PrismaClient | Prisma.TransactionClient;

export interface Tm47dHappyPathFixtureIds {
  tenantId: string;
  actorUserId: string;
  plainUserId: string;
  clientId: string;
  payableCaseId: string;
  payableCaseClientId: string;
  expenseCaseId: string;
  expenseCaseClientId: string;
  collectionId: string;
  collectionDispositionId: string;
  collectionDispositionLineId: string;
  expenseRequestId: string;
}

export interface Tm47dHappyPathSeedResult extends Tm47dHappyPathFixtureIds {
  currency: string;
  payableAmount: string;
  expenseAmount: string;
  offsetAmount: string;
  applyIdempotencyKey: string;
  reverseIdempotencyKey: string;
  periodStart: string;
  periodEnd: string;
}

interface Tm47dHappyPathSeedOptions {
  seedKey?: string;
}

function safeSeedKey(seedKey: string): string {
  const safe = seedKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return safe || DEFAULT_SEED_KEY;
}

function fixtureIds(seedKey = DEFAULT_SEED_KEY): Tm47dHappyPathFixtureIds {
  const key = safeSeedKey(seedKey);
  return {
    tenantId: `${key}-tenant`,
    actorUserId: `${key}-actor-admin`,
    plainUserId: `${key}-actor-plain`,
    clientId: `${key}-client`,
    payableCaseId: `${key}-case-payable`,
    payableCaseClientId: `${key}-case-client-payable`,
    expenseCaseId: `${key}-case-expense`,
    expenseCaseClientId: `${key}-case-client-expense`,
    collectionId: `${key}-collection`,
    collectionDispositionId: `${key}-disposition`,
    collectionDispositionLineId: `${key}-disposition-line-payable`,
    expenseRequestId: `${key}-expense-request`,
  };
}

function seedResult(ids: Tm47dHappyPathFixtureIds, seedKey = DEFAULT_SEED_KEY): Tm47dHappyPathSeedResult {
  const key = safeSeedKey(seedKey);
  return {
    ...ids,
    currency: CURRENCY,
    payableAmount: PAYABLE_AMOUNT.toString(),
    expenseAmount: EXPENSE_AMOUNT.toString(),
    offsetAmount: OFFSET_AMOUNT.toString(),
    applyIdempotencyKey: `${key}-offset-apply`,
    reverseIdempotencyKey: `${key}-offset-reverse`,
    periodStart: '2020-01-01T00:00:00.000Z',
    periodEnd: '2100-12-31T23:59:59.999Z',
  };
}

export function assertTm47dHappyPathSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('TM47D happy-path seed production ortaminda calistirilamaz.');
  }
  if (env.ALLOW_TM47D_HAPPY_PATH_SEED !== '1') {
    throw new Error('TM47D happy-path seed icin ALLOW_TM47D_HAPPY_PATH_SEED=1 zorunludur.');
  }
}

export async function cleanupTm47dHappyPathFixture(
  db: SeedDb,
  options: Tm47dHappyPathSeedOptions = {},
): Promise<void> {
  const ids = fixtureIds(options.seedKey);
  const anyDb = db as any;

  await anyDb.clientStatementLine.deleteMany({ where: { statement: { tenantId: ids.tenantId } } });
  await anyDb.clientStatement.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.auditLog.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.clientPayoutManualReversal.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.clientPayoutAllocation.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.clientPayout.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.clientOffset.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.expenseRequest.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.collectionDispositionLine.deleteMany({
    where: { disposition: { tenantId: ids.tenantId } },
  });
  await anyDb.collectionDisposition.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.collection.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.caseClient.deleteMany({ where: { case: { tenantId: ids.tenantId } } });
  await anyDb.case.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.lawyer.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.user.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.client.deleteMany({ where: { tenantId: ids.tenantId } });
  await anyDb.tenant.deleteMany({ where: { id: ids.tenantId } });
}

export async function seedTm47dHappyPathFixture(
  db: SeedDb,
  options: Tm47dHappyPathSeedOptions = {},
): Promise<Tm47dHappyPathSeedResult> {
  const key = safeSeedKey(options.seedKey ?? DEFAULT_SEED_KEY);
  const ids = fixtureIds(key);
  const anyDb = db as any;
  const collectionDate = new Date('2026-02-01T10:00:00.000Z');
  const postedAt = new Date('2026-02-02T10:00:00.000Z');
  const expenseCreatedAt = new Date('2026-02-03T10:00:00.000Z');

  await cleanupTm47dHappyPathFixture(anyDb, { seedKey: key });

  await anyDb.tenant.create({
    data: {
      id: ids.tenantId,
      name: 'TM47D Happy Path QA Tenant',
      slug: key,
      plan: 'PRO',
    },
  });

  await anyDb.user.createMany({
    data: [
      {
        id: ids.actorUserId,
        tenantId: ids.tenantId,
        email: `${key}+admin@example.test`,
        passwordHash: null,
        name: 'TM47D',
        surname: 'Admin',
        role: 'ADMIN',
      },
      {
        id: ids.plainUserId,
        tenantId: ids.tenantId,
        email: `${key}+plain@example.test`,
        passwordHash: null,
        name: 'TM47D',
        surname: 'Plain',
        role: 'USER',
      },
    ],
  });

  await anyDb.lawyer.createMany({
    data: [
      {
        id: `${key}-lawyer-admin`,
        tenantId: ids.tenantId,
        userId: ids.actorUserId,
        name: 'TM47D',
        surname: 'Admin',
        email: `${key}+admin@example.test`,
        lawyerRank: 'PARTNER',
        role: 'PARTNER',
      },
      {
        id: `${key}-lawyer-plain`,
        tenantId: ids.tenantId,
        userId: ids.plainUserId,
        name: 'TM47D',
        surname: 'Plain',
        email: `${key}+plain@example.test`,
        lawyerRank: 'LAWYER',
        role: 'EMPLOYEE',
      },
    ],
  });

  await anyDb.client.create({
    data: {
      id: ids.clientId,
      tenantId: ids.tenantId,
      type: 'PERSON',
      displayName: 'TM47D Happy Path Client',
      firstName: 'TM47D',
      lastName: 'Client',
    },
  });

  await anyDb.case.createMany({
    data: [
      {
        id: ids.payableCaseId,
        tenantId: ids.tenantId,
        clientId: ids.clientId,
        fileNumber: `${key}-PAYABLE`,
        type: 'GENERAL_EXECUTION',
        currency: CURRENCY,
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        createdById: ids.actorUserId,
      },
      {
        id: ids.expenseCaseId,
        tenantId: ids.tenantId,
        clientId: ids.clientId,
        fileNumber: `${key}-EXPENSE`,
        type: 'GENERAL_EXECUTION',
        currency: CURRENCY,
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        createdById: ids.actorUserId,
      },
    ],
  });

  await anyDb.caseClient.createMany({
    data: [
      {
        id: ids.payableCaseClientId,
        caseId: ids.payableCaseId,
        clientId: ids.clientId,
        role: 'ALACAKLI',
        assignedById: ids.actorUserId,
      },
      {
        id: ids.expenseCaseClientId,
        caseId: ids.expenseCaseId,
        clientId: ids.clientId,
        role: 'ALACAKLI',
        assignedById: ids.actorUserId,
      },
    ],
  });

  await anyDb.collection.create({
    data: {
      id: ids.collectionId,
      tenantId: ids.tenantId,
      caseId: ids.payableCaseId,
      amount: PAYABLE_AMOUNT,
      currency: CURRENCY,
      type: 'TAHSILAT',
      channel: 'BANKA',
      sourceType: 'MANUAL',
      date: collectionDate,
      status: 'CONFIRMED',
      description: 'TM47D happy path payable seed',
      createdById: ids.actorUserId,
    },
  });

  await anyDb.collectionDisposition.create({
    data: {
      id: ids.collectionDispositionId,
      tenantId: ids.tenantId,
      caseId: ids.payableCaseId,
      collectionId: ids.collectionId,
      beneficiaryScope: 'SINGLE_CASE_CLIENT',
      caseClientId: ids.payableCaseClientId,
      status: 'POSTED',
      totalAmount: PAYABLE_AMOUNT,
      currency: CURRENCY,
      createdById: ids.actorUserId,
      postedAt,
      postedById: ids.actorUserId,
    },
  });

  await anyDb.collectionDispositionLine.create({
    data: {
      id: ids.collectionDispositionLineId,
      dispositionId: ids.collectionDispositionId,
      type: 'CLIENT_PAYABLE',
      amount: PAYABLE_AMOUNT,
      caseClientId: ids.payableCaseClientId,
      note: 'TM47D happy path client payable',
      createdAt: postedAt,
    },
  });

  await anyDb.expenseRequest.create({
    data: {
      id: ids.expenseRequestId,
      tenantId: ids.tenantId,
      caseId: ids.expenseCaseId,
      clientId: ids.clientId,
      totalSuggested: EXPENSE_AMOUNT,
      totalAmount: EXPENSE_AMOUNT,
      paidTotal: new Prisma.Decimal(0),
      currency: CURRENCY,
      status: 'SENT',
      sentAt: expenseCreatedAt,
      createdAt: expenseCreatedAt,
      createdById: ids.actorUserId,
      notes: 'TM47D happy path unpaid expense seed',
      items: [
        {
          type: 'TM47D_QA_EXPENSE',
          description: 'TM47D happy path expense fixture',
          amount: EXPENSE_AMOUNT.toNumber(),
          currency: CURRENCY,
        },
      ],
    },
  });

  return seedResult(ids, key);
}

async function main(): Promise<void> {
  assertTm47dHappyPathSeedAllowed();

  const prisma = new PrismaClient();
  try {
    const result = await seedTm47dHappyPathFixture(prisma);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}