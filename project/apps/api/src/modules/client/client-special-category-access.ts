import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OfficeApprovalService } from '../office-approval/office-approval.service';
import { assertClientObjectScope } from './client-object-scope';

export const K73_OPERATIONS = ['LIST', 'READ', 'CREATE'] as const;
export type K73Operation = typeof K73_OPERATIONS[number];
export const K73_KEYS: Record<K73Operation, string> = {
  LIST: 'client.special-category.list',
  READ: 'client.special-category.read',
  CREATE: 'client.special-category.create',
};
export const K73_PERMISSION_KEYS = Object.values(K73_KEYS);
export type K73Db = Prisma.TransactionClient;

export async function k73ObjectInScope(db: K73Db, tenantId: string, userId: string, clientId: string, caseId?: string) {
  try { await assertClientObjectScope(db, tenantId, userId, clientId, caseId); return true; }
  catch (error) {
    if (error instanceof ForbiddenException || error instanceof NotFoundException) return false;
    throw error;
  }
}

export function k73Scopes(db: K73Db): any {
  const delegate = (db as any).clientSpecialCategoryGrantScope;
  if (!delegate) throw new ServiceUnavailableException({ code: 'K73_SCHEMA_REQUIRED', message: 'Özel veri yetki şeması hazır değil.' });
  return delegate;
}

export async function currentK73Actor(db: K73Db, tenantId: string, userId: string | undefined | null) {
  if (!tenantId || !userId) throw new ForbiddenException({ code: 'K73_ACCESS_DENIED' });
  const user = await db.user.findFirst({
    where: { id: userId, tenantId, isActive: true, role: { in: ['ADMIN', 'USER'] } },
    include: { staffMember: { select: { id: true } } },
  });
  if (!user) throw new ForbiddenException({ code: 'K73_ACCESS_DENIED' });
  return user;
}

// Callers: grant/revoke/duty-change and staff/lawyer/case transaction hooks.
// The subject lock prevents a grant from being inserted behind an offboarding revoke.
export async function lockK73Subject(db: K73Db, tenantId: string, subjectUserId: string) {
  if (!tenantId || !subjectUserId) throw new ForbiddenException({ code: 'K73_ACCESS_DENIED' });
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User" WHERE "tenantId" = ${tenantId} AND "id" = ${subjectUserId} FOR UPDATE
  `;
  if (rows.length !== 1) throw new NotFoundException('Hesap bulunamadı.');
}

export async function assertK73Manager(db: K73Db, tenantId: string, actorUserId: string) {
  const actor = await currentK73Actor(db, tenantId, actorUserId);
  if (actor.role !== 'ADMIN' || actor.staffMember) {
    throw new ForbiddenException({ code: 'K73_MANAGEMENT_DENIED', message: 'Bu işlem personel bağlantısı olmayan güncel ADMIN yetkisi ister.' });
  }
  return actor;
}

export async function assertK73ExistingAuthority(
  db: K73Db, office: Pick<OfficeApprovalService, 'isApproverEligible'>,
  tenantId: string, userId: string, clientId: string, caseId?: string,
) {
  const actor = await currentK73Actor(db, tenantId, userId);
  if (actor.role !== 'ADMIN' && !await office.isApproverEligible(userId, tenantId, db)) {
    throw new ForbiddenException({ code: 'SPECIAL_DATA_ELEVATED_REQUIRED' });
  }
  await assertClientObjectScope(db, tenantId, userId, clientId, caseId);
  return actor;
}

// Callers: the existing LIST/READ/CREATE service entries and safe capabilities.
// No actor-less/background bypass, no role-only or unbound GLOBAL grant shortcut.
export async function assertK73AccessInTx(
  db: K73Db, office: Pick<OfficeApprovalService, 'isApproverEligible'>,
  tenantId: string, userId: string | undefined | null, operation: K73Operation,
  clientId: string, caseId?: string,
): Promise<{ id: string; validUntil: Date }> {
  if (!userId || !K73_OPERATIONS.includes(operation)) throw new ForbiddenException({ code: 'K73_ACCESS_DENIED' });
  k73Scopes(db);
  // Lock before the decision. A committed revocation cannot be passed using an old snapshot.
  await db.$queryRaw`
    SELECT s."id" FROM "ClientSpecialCategoryGrantScope" s
    JOIN "PermissionGrant" p ON p."id" = s."permissionGrantId" AND p."tenantId" = s."tenantId"
    WHERE s."tenantId" = ${tenantId} AND s."clientId" = ${clientId}
      AND p."subjectUserId" = ${userId} AND p."permissionKey" = ${K73_KEYS[operation]}
    ORDER BY s."id" FOR SHARE OF s, p
  `;
  await assertK73ExistingAuthority(db, office, tenantId, userId, clientId, caseId);
  const now = new Date(); // after lock waits, never request-start time
  const deny = await db.permissionGrant.findFirst({ where: {
    tenantId, subjectUserId: userId, permissionKey: K73_KEYS[operation], effect: 'DENY', scope: 'GLOBAL',
    validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }],
  }, select: { id: true } });
  if (deny) throw new ForbiddenException({ code: 'K73_EXPLICIT_DENY' });
  const rows = await k73Scopes(db).findMany({ where: {
    tenantId, clientId, revokedAt: null,
    ...(caseId ? { OR: [{ caseId: null }, { caseId }] } : { caseId: null }),
    permissionGrant: {
      tenantId, subjectUserId: userId, permissionKey: K73_KEYS[operation], effect: 'ALLOW', scope: 'GLOBAL',
      validFrom: { lte: now }, validUntil: { gt: now },
    },
  }, include: { permissionGrant: true } });
  const winner = rows.sort((a: any, b: any) => b.permissionGrant.validUntil.getTime() - a.permissionGrant.validUntil.getTime())[0];
  if (!winner) throw new ForbiddenException({ code: 'K73_TIMED_GRANT_REQUIRED', message: 'Bu işlem ve kapsam için geçerli süreli özel veri yetkisi yok.' });
  return { id: winner.id, validUntil: winner.permissionGrant.validUntil };
}

async function revokeRows(
  db: K73Db, rows: any[], tenantId: string, actorUserId: string,
  reason: string, now: Date,
) {
  if (!rows.length) return 0;
  const ids = rows.map(row => row.id);
  const changed = await k73Scopes(db).updateMany({
    where: { id: { in: ids }, tenantId, revokedAt: null },
    data: { revokedAt: now, revokedByUserId: actorUserId, revokeReason: reason },
  });
  if (changed.count) await db.auditLog.create({ data: {
    tenantId, action: 'CLIENT_SPECIAL_DATA_GRANTS_REVOKE', entityType: 'CLIENT_SPECIAL_DATA_ACCESS',
    userId: actorUserId, metadata: { scopeIds: ids, reason, count: changed.count },
  } });
  return changed.count;
}

// Transaction hooks only. Preserve dates/history, close future grants as well.
export async function revokeK73ForSubjectInTx(
  db: K73Db, tenantId: string, subjectUserId: string | null | undefined,
  actorUserId: string, reason: string,
) {
  if (!subjectUserId) return 0;
  await lockK73Subject(db, tenantId, subjectUserId);
  const rows = await k73Scopes(db).findMany({ where: {
    tenantId, revokedAt: null,
    permissionGrant: { tenantId, subjectUserId, permissionKey: { in: K73_PERMISSION_KEYS } },
  }, select: { id: true } });
  return revokeRows(db, rows, tenantId, actorUserId, reason, new Date());
}

// Call after a relation removal/canView change, in that same transaction, under the subject lock.
// Client-wide grants survive loss of one case only if another canonical relation still exists.
export async function revokeLostK73ScopesInTx(
  db: K73Db, tenantId: string, subjectUserId: string | null | undefined, actorUserId: string,
) {
  if (!subjectUserId) return 0;
  await lockK73Subject(db, tenantId, subjectUserId);
  const rows = await k73Scopes(db).findMany({ where: {
    tenantId, revokedAt: null,
    permissionGrant: { tenantId, subjectUserId, permissionKey: { in: K73_PERMISSION_KEYS } },
  }, select: { id: true, clientId: true, caseId: true } });
  const lost: any[] = [];
  for (const row of rows) {
    if (!await k73ObjectInScope(db, tenantId, subjectUserId, row.clientId, row.caseId ?? undefined)) lost.push(row);
  }
  return revokeRows(db, lost, tenantId, actorUserId, 'CANONICAL_RELATION_REMOVED', new Date());
}

export async function lockK73CaseSubjectsInTx(db: K73Db, tenantId: string, caseId: string) {
  const scopes = await k73Scopes(db).findMany({ where: {
    tenantId, revokedAt: null, client: { caseClients: { some: { caseId } } },
    permissionGrant: { tenantId, permissionKey: { in: K73_PERMISSION_KEYS } },
  }, select: { permissionGrant: { select: { subjectUserId: true } } } });
  // Include canonical principals without an existing grant: a concurrent first grant
  // must not slip behind deletion of its last case and revive after reassignment.
  const lawyers = await db.caseLawyer.findMany({ where: { caseId, case: { tenantId } },
    select: { lawyer: { select: { userId: true } } } });
  const staff = await db.caseStaff.findMany({ where: { caseId, case: { tenantId } },
    select: { staffMember: { select: { userId: true } } } });
  const ids = [...new Set<string>([
    ...scopes.map((s: any) => s.permissionGrant.subjectUserId as string),
    ...lawyers.map(row => row.lawyer.userId), ...staff.map(row => row.staffMember.userId),
  ].filter((id): id is string => !!id))].sort();
  for (const id of ids) await lockK73Subject(db, tenantId, id);
  return ids;
}
