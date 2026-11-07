import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import { buildClientFieldDiff, PORTAL_ACCESS_FIELDS } from './client-audit.util';

/** Parent-first ordering shared by Client deactivation and portal account writes. */
export async function lockClientPortalState(tx: Prisma.TransactionClient, tenantId: string, clientId: string) {
  const rows = await tx.$queryRaw<Array<{
    id: string; isActive: boolean; hasPortalAccess: boolean; portalUserId: string | null;
  }>>`SELECT "id", "isActive", "hasPortalAccess", "portalUserId"
      FROM "Client" WHERE "id" = ${clientId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  if (!rows[0]) throw new NotFoundException('Müvekkil bulunamadı');
  return rows[0];
}

/**
 * The caller retains its own action authority; no nested transaction or role inference.
 * Callers: ClientService.remove/update (actual deactivation), PortalService.disablePortalUser.
 */
export async function disableClientPortalAccessInTx(
  tx: Prisma.TransactionClient,
  audit: Pick<AuditService, 'logInTransaction'>,
  tenantId: string,
  clientId: string,
  userId: string | undefined,
  source: 'CLIENT_DEACTIVATION' | 'PORTAL_DISABLE',
) {
  const before = await lockClientPortalState(tx, tenantId, clientId);
  const revoked = await tx.clientPortalUser.updateMany({
    where: { clientId, client: { tenantId } },
    data: { isActive: false, tokenVersion: { increment: 1 }, resetToken: null, resetTokenExp: null },
  });
  if (before.hasPortalAccess || source === 'PORTAL_DISABLE') {
    await tx.client.updateMany({ where: { id: clientId, tenantId }, data: { hasPortalAccess: false } });
  }
  // No account is invented for a Client without portal access. Manual disable keeps its existing audit.
  if (revoked.count > 0 || before.hasPortalAccess || source === 'PORTAL_DISABLE') {
    await audit.logInTransaction(tx, {
      tenantId,
      action: 'CLIENT_PORTAL_ACCESS_DISABLE',
      entityType: 'CLIENT',
      entityId: clientId,
      userId,
      metadata: {
        portalAction: 'DISABLE',
        source,
        accountRevoked: revoked.count > 0,
        fieldDiff: buildClientFieldDiff(before, { ...before, hasPortalAccess: false }, PORTAL_ACCESS_FIELDS),
      },
    });
  }
}
