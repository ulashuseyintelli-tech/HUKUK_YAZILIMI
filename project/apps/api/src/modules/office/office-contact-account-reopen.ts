import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OFFICE_CONTACT_KEYS } from './office-contact.constants';

type Reader = Pick<Prisma.TransactionClient, 'permissionGrant'>;
/** Contact permission management and O-5 use the existing staff-person lock before mutation. */
export async function readContactReopenGrants(db: Reader, tenantId: string, userId: string | null, now: Date) {
  if (!userId) return [];
  const rows = await db.permissionGrant.findMany({
    where: { tenantId, subjectUserId: userId, permissionKey: { in: [...OFFICE_CONTACT_KEYS] }, scope: 'GLOBAL',
      OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
    orderBy: { id: 'asc' },
    select: { id: true, permissionKey: true, effect: true, validFrom: true, validUntil: true, updatedAt: true, grantedByUserId: true },
  });
  return rows.filter(g => (OFFICE_CONTACT_KEYS as readonly string[]).includes(g.permissionKey));
}

/** Called only inside the existing O-5 reopen transaction; unrelated permissions and DENY are untouched. */
export async function expireContactGrantsInTx(
  tx: Prisma.TransactionClient, audit: AuditService,
  input: { tenantId: string; subjectUserId: string; actorUserId: string; staffId: string; ids: string[]; now: Date; requestId: string },
) {
  if (!input.ids.length) return 0;
  const where: Prisma.PermissionGrantWhereInput = {
    id: { in: input.ids }, tenantId: input.tenantId, subjectUserId: input.subjectUserId,
    permissionKey: { in: [...OFFICE_CONTACT_KEYS] }, scope: 'GLOBAL', effect: 'ALLOW',
    OR: [{ validUntil: null }, { validUntil: { gt: input.now } }],
  };
  const before = await tx.permissionGrant.findMany({ where, select: { id: true, permissionKey: true, validUntil: true }, orderBy: { id: 'asc' } });
  if (before.length !== input.ids.length) throw new ConflictException('İletişim izinleri değişti; incelemeyi yenileyin.');
  const result = await tx.permissionGrant.updateMany({ where, data: { validUntil: input.now } });
  if (result.count !== input.ids.length) throw new ConflictException('İletişim izinleri değişti; işlem geri alındı.');
  await audit.logInTransaction(tx, {
    tenantId: input.tenantId, userId: input.actorUserId, action: 'UPDATE', entityType: 'PERMISSION_GRANT', entityId: input.subjectUserId,
    oldValues: { grants: before.map(g => ({ ...g, validUntil: g.validUntil?.toISOString() ?? null })) },
    newValues: { expiredGrantIds: input.ids, validUntil: input.now.toISOString() },
    metadata: { source: 'STAFF_ACCOUNT_REOPEN_CONTACT', staffId: input.staffId, requestId: input.requestId, effectFilter: 'ALLOW' },
  });
  return result.count;
}
