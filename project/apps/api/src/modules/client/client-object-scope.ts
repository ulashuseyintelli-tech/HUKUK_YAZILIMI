import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

type ClientScopeDb = Pick<Prisma.TransactionClient, 'user' | 'client'>;

/** Existing K16 relationship, shared by actor-facing reads and 1b mutations.
 * This is an additional object boundary, never an action/approval permission.
 * Pass the transaction client when checking a write in an existing transaction.
 */
export async function clientObjectScope(
  db: ClientScopeDb,
  tenantId: string,
  actorUserId: string | null | undefined,
  caseId?: string,
): Promise<Prisma.ClientWhereInput> {
  if (typeof tenantId !== 'string' || !tenantId || typeof actorUserId !== 'string' || !actorUserId) {
    throw new ForbiddenException({ code: 'CLIENT_READ_DENIED' });
  }
  if (caseId !== undefined && (typeof caseId !== 'string' || !caseId)) {
    throw new NotFoundException('Dosya bulunamadı');
  }
  const actor = await db.user.findFirst({
    where: { id: actorUserId, tenantId, isActive: true, role: { in: ['USER', 'ADMIN'] } },
    select: { id: true },
  });
  if (!actor) throw new ForbiddenException({ code: 'CLIENT_READ_DENIED' });
  // No title/ADMIN, ReportingLine, legacy Case.clientId or creator exception.
  return {
    caseClients: { some: { case: {
      tenantId,
      ...(caseId !== undefined ? { id: caseId } : {}),
      OR: [
        { lawyers: { some: { lawyer: {
          tenantId, isActive: true, user: { id: actorUserId, tenantId, isActive: true, role: { in: ['USER', 'ADMIN'] } },
        } } } },
        { staff: { some: { canView: true, staffMember: {
          tenantId, isActive: true, user: { id: actorUserId, tenantId, isActive: true, role: { in: ['USER', 'ADMIN'] } },
        } } } },
      ],
    } } },
  };
}

export async function assertClientObjectScope(
  db: ClientScopeDb,
  tenantId: string,
  actorUserId: string | null | undefined,
  clientId: string,
  caseId?: string,
): Promise<void> {
  // Prisma omits undefined filters; an absent parent must never match any scoped Client.
  if (typeof clientId !== 'string' || !clientId) throw new NotFoundException('Müvekkil bulunamadı');
  const scope = await clientObjectScope(db, tenantId, actorUserId, caseId);
  const client = await db.client.findFirst({ where: { id: clientId, tenantId, AND: [scope] }, select: { id: true } });
  if (!client) throw new NotFoundException('Müvekkil bulunamadı');
}

/** Duplicate errors may reveal no profile/id unless the other client is in scope. */
export async function isClientObjectInScope(
  db: ClientScopeDb,
  tenantId: string,
  actorUserId: string | null | undefined,
  clientId: string,
): Promise<boolean> {
  try {
    await assertClientObjectScope(db, tenantId, actorUserId, clientId);
    return true;
  } catch (error) {
    if (error instanceof ForbiddenException || error instanceof NotFoundException) return false;
    throw error;
  }
}
