/**
 * G1 / E1 kabul testleri için doğrudan-Prisma fikstür yardımcıları (disposable PostgreSQL).
 *
 * Kayıtlar üretim servisleri yerine doğrudan yazılır: amaç, belirli para birimi kombinasyonlarındaki kaynak satırları
 * (TL / USD / boş / karma) birebir kurmak ve sonra GERÇEK HTTP uçlarını sınamaktır. Hiçbir canlı kayıt okunmaz / yazılmaz.
 * Her büro (tenant) kendi kimliğiyle kurulur ve `cleanupTenant` ile yalnız kendi kayıtları silinir.
 */
import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient;

export interface TenantFixture {
  tenantId: string;
  userId: string;
}

export async function createTenantWithUser(prisma: Db, suffix: string, label: string): Promise<TenantFixture> {
  const tenantId = `test-ci-ccy-${label}-${suffix}`;
  await prisma.tenant.create({ data: { id: tenantId, name: `CI CCY ${label}`, slug: tenantId } });
  const user = await prisma.user.create({
    data: { tenantId, email: `admin-${label}-${suffix}@example.test`, name: 'admin', surname: label, role: 'ADMIN' },
  });
  return { tenantId, userId: user.id };
}

export async function createClient(
  prisma: Db,
  tenantId: string,
  label: string,
  email?: string,
): Promise<string> {
  const client = await prisma.client.create({
    data: {
      tenantId,
      type: 'PERSON',
      displayName: `Müvekkil ${label}`,
      firstName: 'Müvekkil',
      lastName: label,
      ...(email ? { email } : {}),
    },
  });
  return client.id;
}

export async function createCase(
  prisma: Db,
  input: { tenantId: string; clientId: string; userId: string; fileNumber: string; currency: 'TRY' | 'USD' | 'EUR' },
): Promise<string> {
  const row = await prisma.case.create({
    data: {
      tenantId: input.tenantId,
      clientId: input.clientId,
      fileNumber: input.fileNumber,
      type: 'GENERAL_EXECUTION',
      currency: input.currency,
      caseStatus: 'DERDEST',
      status: 'ACTIVE',
      createdById: input.userId,
    },
  });
  return row.id;
}

export async function linkClient(
  prisma: Db,
  caseId: string,
  clientId: string,
  userId: string,
  role: 'ALACAKLI' | 'ORTAK_ALACAKLI' = 'ALACAKLI',
): Promise<string> {
  const cc = await prisma.caseClient.create({ data: { caseId, clientId, role, assignedById: userId } });
  return cc.id;
}

/** Dosyanın avans defterine bir satır (CaseBalance yoksa açılır). */
export async function addLedgerRow(
  prisma: Db,
  input: {
    tenantId: string;
    caseId: string;
    amount: number;
    currency: string;
    createdAt: Date;
    balanceCurrency?: string;
  },
): Promise<void> {
  const balance =
    (await prisma.caseBalance.findFirst({ where: { tenantId: input.tenantId, caseId: input.caseId } })) ??
    (await prisma.caseBalance.create({
      data: {
        tenantId: input.tenantId,
        caseId: input.caseId,
        balance: new Prisma.Decimal(0),
        currency: input.balanceCurrency ?? 'TRY',
      },
    }));
  await prisma.balanceLedger.create({
    data: {
      tenantId: input.tenantId,
      caseBalanceId: balance.id,
      type: input.amount >= 0 ? 'CREDIT' : 'DEBIT',
      amount: new Prisma.Decimal(input.amount),
      currency: input.currency,
      source: 'test:ccy-fixture',
      description: 'CI fikstürü',
      createdAt: input.createdAt,
    },
  });
  await prisma.caseBalance.update({
    where: { id: balance.id },
    data: { balance: { increment: new Prisma.Decimal(input.currency === balance.currency ? input.amount : 0) } },
  });
}

/** Onaylı tahsilat + POSTED dağıtım + müvekkile ayrılan (CLIENT_PAYABLE) satır. */
export async function addPostedPayable(
  prisma: Db,
  input: {
    tenantId: string;
    caseId: string;
    caseClientId: string;
    userId: string;
    amount: number;
    currency: string;
    postedAt: Date;
    key: string;
  },
): Promise<void> {
  const amount = new Prisma.Decimal(input.amount);
  await prisma.collection.create({
    data: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      idempotencyKey: `test:ccy:${input.key}`,
      amount,
      currency: input.currency,
      type: 'TAHSILAT',
      channel: 'BANKA',
      sourceType: 'MANUAL',
      date: input.postedAt,
      status: 'CONFIRMED',
      confirmedAt: input.postedAt,
      description: 'CI fikstürü',
      createdById: input.userId,
    },
  });
  const collection = await prisma.collection.findFirstOrThrow({
    where: { tenantId: input.tenantId, idempotencyKey: `test:ccy:${input.key}` },
  });
  const disposition = await prisma.collectionDisposition.create({
    data: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      collectionId: collection.id,
      beneficiaryScope: 'SINGLE_CASE_CLIENT',
      caseClientId: input.caseClientId,
      status: 'POSTED',
      totalAmount: amount,
      currency: input.currency,
      createdById: input.userId,
      postedAt: input.postedAt,
      postedById: input.userId,
    },
  });
  await prisma.collectionDispositionLine.create({
    data: {
      dispositionId: disposition.id,
      type: 'CLIENT_PAYABLE',
      amount,
      caseClientId: input.caseClientId,
      note: 'CI fikstürü',
      createdAt: input.postedAt,
    },
  });
}

export async function addPayout(
  prisma: Db,
  input: {
    tenantId: string;
    caseId: string;
    caseClientId: string;
    userId: string;
    amount: number;
    currency: string;
    paidAt: Date;
    key: string;
  },
): Promise<void> {
  await prisma.clientPayout.create({
    data: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      caseClientId: input.caseClientId,
      amount: new Prisma.Decimal(input.amount),
      currency: input.currency,
      status: 'RECORDED',
      idempotencyKey: `test:ccy:payout:${input.key}`,
      paidAt: input.paidAt,
      paidById: input.userId,
      note: 'CI fikstürü',
    },
  });
}

export async function addExpenseRequest(
  prisma: Db,
  input: {
    tenantId: string;
    caseId: string;
    clientId: string;
    userId: string;
    amount: number;
    currency: string;
    createdAt: Date;
  },
): Promise<string> {
  const row = await prisma.expenseRequest.create({
    data: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      clientId: input.clientId,
      totalSuggested: new Prisma.Decimal(input.amount),
      totalAmount: new Prisma.Decimal(input.amount),
      paidTotal: new Prisma.Decimal(0),
      currency: input.currency,
      status: 'SENT',
      sentAt: input.createdAt,
      createdAt: input.createdAt,
      createdById: input.userId,
      notes: 'CI fikstürü',
    },
  });
  return row.id;
}

/** Bir bürodaki ekstre ile ilgili kalıcı belge sayıları (ret sonrası "sıfır belge yazımı" kanıtı). */
export async function statementDocumentCounts(prisma: Db, tenantId: string) {
  const [statements, lines, audits, notifications] = await Promise.all([
    prisma.clientStatement.count({ where: { tenantId } }),
    prisma.clientStatementLine.count({ where: { statement: { tenantId } } }),
    prisma.auditLog.count({ where: { tenantId, entityType: 'ClientStatement' } }),
    prisma.clientNotification.count({ where: { tenantId } }),
  ]);
  return { statements, lines, audits, notifications };
}

/** Yalnız bu fikstürün oluşturduğu büro kayıtlarını siler. */
export async function cleanupTenant(prisma: Db, tenantId: string): Promise<void> {
  const swallow = (p: Promise<unknown>) => p.catch(() => undefined);
  await swallow(prisma.clientStatementLine.deleteMany({ where: { statement: { tenantId } } }));
  await swallow(prisma.clientStatementDeliveryLedger.deleteMany({ where: { tenantId } }));
  await swallow(prisma.clientStatement.deleteMany({ where: { tenantId } }));
  await swallow(prisma.clientNotification.deleteMany({ where: { tenantId } }));
  await swallow(prisma.task.deleteMany({ where: { tenantId } }));
  await swallow(prisma.auditLog.deleteMany({ where: { tenantId } }));
  await swallow(prisma.balanceLedger.deleteMany({ where: { tenantId } }));
  await swallow(prisma.caseBalance.deleteMany({ where: { tenantId } }));
  await swallow(prisma.clientPayout.deleteMany({ where: { tenantId } }));
  await swallow(prisma.clientOffset.deleteMany({ where: { tenantId } }));
  await swallow(prisma.expensePayment.deleteMany({ where: { expenseRequest: { tenantId } } }));
  await swallow(prisma.expenseRequest.deleteMany({ where: { tenantId } }));
  await swallow(prisma.collectionDispositionLine.deleteMany({ where: { disposition: { tenantId } } }));
  await swallow(prisma.collectionDisposition.deleteMany({ where: { tenantId } }));
  await swallow(prisma.collection.deleteMany({ where: { tenantId } }));
  await swallow(prisma.caseClient.deleteMany({ where: { case: { tenantId } } }));
  await swallow(prisma.case.deleteMany({ where: { tenantId } }));
  await swallow(prisma.user.deleteMany({ where: { tenantId } }));
  await swallow(prisma.client.deleteMany({ where: { tenantId } }));
  await swallow(prisma.tenant.deleteMany({ where: { id: tenantId } }));
}
