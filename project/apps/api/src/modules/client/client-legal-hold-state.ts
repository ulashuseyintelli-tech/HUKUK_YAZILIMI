import type { Prisma } from '@prisma/client';

type HoldReader = Pick<Prisma.TransactionClient, 'clientLegalHold'>;

/** Portal deletion and all legal-hold status writers acquire this before their own identity locks. */
export async function lockClientLegalHoldState(tx: Prisma.TransactionClient, tenantId: string) {
  // A short tenant barrier also covers CASE/record-family holds that span multiple clients.
  const key = `client-legal-hold:${tenantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/** Shared by ClientLegalHoldService and the two portal-document deletion phases. */
export async function hasActiveClientLegalHold(
  source: HoldReader,
  tenantId: string,
  scope: { clientId?: string; caseId?: string; recordFamily?: string },
): Promise<boolean> {
  const or: Prisma.ClientLegalHoldWhereInput[] = [];
  if (scope.clientId) or.push({ scopeType: 'CLIENT', clientId: scope.clientId });
  if (scope.caseId) or.push({ scopeType: 'CASE', caseId: scope.caseId });
  if (scope.recordFamily) or.push({ scopeType: 'RECORD_FAMILY', recordFamily: scope.recordFamily });
  if (scope.clientId) or.push({ scopeType: 'CLIENT', clientId: scope.clientId });
  if (or.length === 0) return false;
  return !!await source.clientLegalHold.findFirst({
    where: { tenantId, status: { in: ['ACTIVE', 'RELEASE_REQUESTED'] }, OR: or },
  });
}
