import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionGrantEffect, PermissionGrantScope, Prisma } from '@prisma/client';
import { isISO8601 } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export const NOTIFICATION_HISTORY_AUDIT_PERMISSION = 'client.notification-history.audit' as const;

/** Owner-authorized G1 surface only; this does not itself authorize reading notification history. */
@Injectable()
export class NotificationHistoryPermissionService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Caller: NotificationHistoryPermissionController.grant; JWT identity supplies tenant and actor. */
  async grant(tenantId: string, actorUserId: string, subjectUserId: string, body: unknown) {
    const input = this.input(body, ['validFrom', 'validUntil', 'reason']);
    const reason = this.reason(input.reason);
    return this.prisma.$transaction(async tx => {
      await this.authorizeAndLock(tx, tenantId, actorUserId, subjectUserId, true);
      const now = new Date();
      const validFrom = input.validFrom === undefined ? now : this.date(input.validFrom, 'validFrom');
      const validUntil = input.validUntil === undefined || input.validUntil === null ? null : this.date(input.validUntil, 'validUntil');
      if (validUntil && (validUntil <= validFrom || validUntil <= now)) throw new BadRequestException('İzin bitişi başlangıçtan ve mevcut zamandan sonra olmalıdır');
      const grant = await tx.permissionGrant.create({ data: {
        tenantId, subjectUserId, permissionKey: NOTIFICATION_HISTORY_AUDIT_PERMISSION,
        effect: PermissionGrantEffect.ALLOW, scope: PermissionGrantScope.GLOBAL,
        validFrom, validUntil, grantedByUserId: actorUserId, reason,
      } });
      await this.audit.logInTransaction(tx, {
        tenantId, userId: actorUserId, action: 'CREATE', entityType: 'PERMISSION_GRANT', entityId: grant.id,
        newValues: { subjectUserId, permissionKey: NOTIFICATION_HISTORY_AUDIT_PERMISSION, effect: 'ALLOW', scope: 'GLOBAL', validFrom: validFrom.toISOString(), validUntil: validUntil?.toISOString() ?? null },
        description: 'Notification history audit permission granted',
      });
      return { id: grant.id, subjectUserId, permissionKey: grant.permissionKey, scope: grant.scope, effect: grant.effect, validFrom: grant.validFrom, validUntil: grant.validUntil };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  /** Caller: NotificationHistoryPermissionController.revoke. Expire ALLOW; never delete grants or alter DENY. */
  async revoke(tenantId: string, actorUserId: string, subjectUserId: string, body: unknown) {
    const input = this.input(body, ['reason']); const reason = this.reason(input.reason);
    return this.prisma.$transaction(async tx => {
      // Revocation remains possible for an inactive target account in the same tenant.
      await this.authorizeAndLock(tx, tenantId, actorUserId, subjectUserId, false);
      const now = new Date();
      const where: Prisma.PermissionGrantWhereInput = {
        tenantId, subjectUserId, permissionKey: NOTIFICATION_HISTORY_AUDIT_PERMISSION,
        effect: PermissionGrantEffect.ALLOW, scope: PermissionGrantScope.GLOBAL,
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      };
      const before = await tx.permissionGrant.findMany({ where, orderBy: { id: 'asc' }, select: { id: true, validUntil: true } });
      const result = await tx.permissionGrant.updateMany({ where, data: { validUntil: now } });
      await this.audit.logInTransaction(tx, {
        tenantId, userId: actorUserId, action: 'UPDATE', entityType: 'PERMISSION_GRANT', entityId: subjectUserId,
        oldValues: { grants: before.map(row => ({ id: row.id, validUntil: row.validUntil?.toISOString() ?? null })) },
        newValues: { subjectUserId, permissionKey: NOTIFICATION_HISTORY_AUDIT_PERMISSION, scope: 'GLOBAL', effect: 'ALLOW', validUntil: now.toISOString(), expiredCount: result.count },
        description: 'Notification history audit permission revoked', metadata: { reason },
      });
      return { subjectUserId, permissionKey: NOTIFICATION_HISTORY_AUDIT_PERMISSION, scope: PermissionGrantScope.GLOBAL, revoked: result.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  /** Callers: grant/revoke. Ordered user locks bind the DB role and tenant check to the same mutation. */
  private async authorizeAndLock(tx: Prisma.TransactionClient, tenantId: string, actorUserId: string, subjectUserId: string, granting: boolean) {
    if ([tenantId, actorUserId, subjectUserId].some(value => typeof value !== 'string' || value.length === 0 || value !== value.trim())) throw new ForbiddenException('NOTIFICATION_HISTORY_ADMIN_REQUIRED');
    const lockKey = `notification-history-permission:${tenantId}:${subjectUserId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const users = [...new Set([actorUserId, subjectUserId])].sort();
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(users)}) ORDER BY "id" FOR UPDATE`;
    const actor = await tx.user.findFirst({ where: { id: actorUserId, tenantId, isActive: true, role: 'ADMIN' }, select: { id: true } });
    if (!actor) throw new ForbiddenException('NOTIFICATION_HISTORY_ADMIN_REQUIRED');
    const subject = await tx.user.findFirst({ where: { id: subjectUserId, tenantId, ...(granting ? { isActive: true } : {}) }, select: { id: true } });
    if (!subject) throw new NotFoundException('İzin kullanıcısı bulunamadı');
  }

  /** Caller: grant/revoke. The key, effect, scope and identity are never body-selectable. */
  private input(body: unknown, allowed: string[]): Record<string, unknown> {
    if (body === undefined) return {};
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) throw new BadRequestException('İzin girdisi geçersiz');
    return body as Record<string, unknown>;
  }

  /** Caller: grant/revoke. */
  private reason(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new BadRequestException('İzin gerekçesi metin olmalıdır');
    return value;
  }

  /** Caller: grant. Explicit timezone is required for the existing validity interval. */
  private date(value: unknown, field: string): Date {
    if (typeof value !== 'string' || !isISO8601(value, { strict: true, strictSeparator: true }) || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException(`${field} saat dilimli ISO tarih olmalıdır`);
    const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${field} geçersiz`);
    return date;
  }
}
