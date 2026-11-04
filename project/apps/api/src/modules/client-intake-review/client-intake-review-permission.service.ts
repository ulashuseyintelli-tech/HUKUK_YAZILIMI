import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionGrantEffect, PermissionGrantScope, Prisma } from '@prisma/client';
import { isISO8601 } from 'class-validator';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { isOfficeWriteDeniedForRole } from '../office-approval/office-write-role.policy';
import { CLIENT_INTAKE_REVIEW_PERMISSION_KEY as KEY, ClientIntakeReviewAuthorizationService } from './client-intake-review-authorization.service';

const SUBJECT_SELECT = {
  id: true, tenantId: true, name: true, surname: true, role: true, isActive: true,
  lawyer: { select: { tenantId: true, isActive: true } },
  staffMember: { select: { tenantId: true, isActive: true } },
} as const;
type Subject = Prisma.UserGetPayload<{ select: typeof SUBJECT_SELECT }>;

/** Bounded administration of one existing capability; grants never authorize promotion. */
@Injectable()
export class ClientIntakeReviewPermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reviewAuthorization: ClientIntakeReviewAuthorizationService,
  ) {}

  async listSubjects(tenantId: string, actorUserId: string, cursor?: string, limit = '25') {
    if (typeof limit !== 'string' || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 50 ||
      (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor !== cursor.trim() || cursor.length > 256))) {
      throw new BadRequestException('Kişi sayfalama girdisi geçersiz');
    }
    return this.prisma.$transaction(async tx => {
      await this.assertAdmin(tx, tenantId, actorUserId);
      const rows = await tx.user.findMany({
        where: { tenantId, ...(cursor ? { id: { gt: cursor } } : {}) },
        select: SUBJECT_SELECT, orderBy: { id: 'asc' }, take: Number(limit) + 1,
      });
      const items = rows.slice(0, Number(limit));
      return { items: items.map(row => this.presentSubject(row)), nextCursor: rows.length > Number(limit) ? items[items.length - 1].id : null };
    });
  }

  async getState(tenantId: string, actorUserId: string, subjectUserId: string) {
    return this.prisma.$transaction(async tx => {
      await this.assertAdmin(tx, tenantId, actorUserId);
      const subject = await this.findSubject(tx, tenantId, subjectUserId);
      const now = new Date();
      const grants = await tx.permissionGrant.findMany({ where: {
        tenantId, subjectUserId, permissionKey: KEY, scope: PermissionGrantScope.GLOBAL,
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      }, select: { effect: true, validFrom: true, validUntil: true } });
      const active = grants.filter(grant => grant.validFrom <= now);
      const effectiveEffect = active.some(grant => grant.effect === 'DENY') ? 'DENY'
        : active.some(grant => grant.effect === 'ALLOW') ? 'ALLOW' : 'NONE';
      let canReview = false;
      if (!isOfficeWriteDeniedForRole(subject.role)) {
        try {
          await this.reviewAuthorization.assertAuthorized({ tenantId, actorUserId: subjectUserId }, tx);
          canReview = true;
        } catch (error) {
          if (!(error instanceof ForbiddenException)) throw error;
        }
      }
      return {
        subject: this.presentSubject(subject), permissionKey: KEY, scope: 'GLOBAL' as const,
        effectiveEffect, canReview,
        revocableAllowCount: grants.filter(grant => grant.effect === 'ALLOW').length,
        scheduledAllowCount: grants.filter(grant => grant.effect === 'ALLOW' && grant.validFrom > now).length,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async grant(tenantId: string, actorUserId: string, subjectUserId: string, body: unknown) {
    const input = this.input(body, ['validFrom', 'validUntil', 'reason']);
    const reason = this.reason(input.reason);
    return this.prisma.$transaction(async tx => {
      const subject = await this.authorizeAndLock(tx, tenantId, actorUserId, subjectUserId);
      if (!this.presentSubject(subject).canReceiveGrant) throw new BadRequestException('Kişi aktif bir inceleme aktörü değil');
      const now = new Date();
      const validFrom = input.validFrom === undefined ? now : this.date(input.validFrom, 'validFrom');
      const validUntil = input.validUntil === undefined || input.validUntil === null ? null : this.date(input.validUntil, 'validUntil');
      if (validUntil && (validUntil <= validFrom || validUntil <= now)) throw new BadRequestException('İzin bitişi başlangıçtan ve mevcut zamandan sonra olmalıdır');
      const grant = await tx.permissionGrant.create({ data: {
        tenantId, subjectUserId, permissionKey: KEY, effect: PermissionGrantEffect.ALLOW, scope: PermissionGrantScope.GLOBAL,
        validFrom, validUntil, grantedByUserId: actorUserId, reason,
      } });
      await this.audit.logInTransaction(tx, {
        tenantId, userId: actorUserId, action: 'CREATE', entityType: 'PERMISSION_GRANT', entityId: grant.id,
        newValues: { subjectUserId, permissionKey: KEY, effect: 'ALLOW', scope: 'GLOBAL', validFrom: validFrom.toISOString(), validUntil: validUntil?.toISOString() ?? null },
        metadata: { actorRole: 'ADMIN', ...this.reasonMetadata(reason) }, description: 'Intake review permission granted',
      });
      return { id: grant.id, subjectUserId, permissionKey: KEY, scope: grant.scope, effect: grant.effect, validFrom, validUntil };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async revoke(tenantId: string, actorUserId: string, subjectUserId: string, body: unknown) {
    const input = this.input(body, ['reason']);
    const reason = this.reason(input.reason);
    return this.prisma.$transaction(async tx => {
      // A passive/VIEWER target's old grants must remain revocable.
      await this.authorizeAndLock(tx, tenantId, actorUserId, subjectUserId);
      const now = new Date();
      const where: Prisma.PermissionGrantWhereInput = {
        tenantId, subjectUserId, permissionKey: KEY, effect: 'ALLOW', scope: 'GLOBAL',
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      };
      const before = await tx.permissionGrant.findMany({ where, select: { id: true, validUntil: true }, orderBy: { id: 'asc' } });
      const result = await tx.permissionGrant.updateMany({ where, data: { validUntil: now } });
      await this.audit.logInTransaction(tx, {
        tenantId, userId: actorUserId, action: 'UPDATE', entityType: 'PERMISSION_GRANT', entityId: subjectUserId,
        oldValues: { grants: before.map(grant => ({ id: grant.id, validUntil: grant.validUntil?.toISOString() ?? null })) },
        newValues: { subjectUserId, permissionKey: KEY, scope: 'GLOBAL', effect: 'ALLOW', validUntil: now.toISOString(), expiredCount: result.count },
        metadata: { actorRole: 'ADMIN', ...this.reasonMetadata(reason) }, description: 'Intake review permission revoked',
      });
      return { subjectUserId, permissionKey: KEY, scope: 'GLOBAL' as const, revoked: result.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  private async assertAdmin(tx: Prisma.TransactionClient, tenantId: string, actorUserId: string) {
    if ([tenantId, actorUserId].some(value => typeof value !== 'string' || !value || value !== value.trim())) throw new ForbiddenException('INTAKE_REVIEW_ADMIN_REQUIRED');
    const actor = await tx.user.findFirst({ where: { id: actorUserId, tenantId, role: 'ADMIN', isActive: true }, select: { id: true } });
    if (!actor) throw new ForbiddenException('INTAKE_REVIEW_ADMIN_REQUIRED');
  }

  private async findSubject(tx: Prisma.TransactionClient, tenantId: string, subjectUserId: string) {
    if (typeof subjectUserId !== 'string' || !subjectUserId || subjectUserId !== subjectUserId.trim()) throw new NotFoundException('İzin kullanıcısı bulunamadı');
    const subject = await tx.user.findFirst({ where: { id: subjectUserId, tenantId }, select: SUBJECT_SELECT });
    if (!subject) throw new NotFoundException('İzin kullanıcısı bulunamadı');
    return subject;
  }

  private async authorizeAndLock(tx: Prisma.TransactionClient, tenantId: string, actorUserId: string, subjectUserId: string) {
    if ([tenantId, actorUserId, subjectUserId].some(value => typeof value !== 'string' || !value || value !== value.trim())) throw new ForbiddenException('INTAKE_REVIEW_ADMIN_REQUIRED');
    const key = `intake-review-permission:${tenantId}:${subjectUserId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const ids = [...new Set([actorUserId, subjectUserId])].sort();
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
    await this.assertAdmin(tx, tenantId, actorUserId);
    return this.findSubject(tx, tenantId, subjectUserId);
  }

  private presentSubject(subject: Subject) {
    const profile = subject.lawyer ?? subject.staffMember;
    const profileActive = Boolean(subject.lawyer) !== Boolean(subject.staffMember) && !!profile?.isActive && profile.tenantId === subject.tenantId;
    return {
      id: subject.id, displayName: `${subject.name} ${subject.surname}`.trim(), isActive: subject.isActive,
      profileActive, canReceiveGrant: subject.isActive && profileActive && !isOfficeWriteDeniedForRole(subject.role),
    };
  }

  private input(body: unknown, allowed: string[]): Record<string, unknown> {
    if (body === undefined) return {};
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) throw new BadRequestException('İzin girdisi geçersiz');
    return body as Record<string, unknown>;
  }

  private reason(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new BadRequestException('İzin gerekçesi metin olmalıdır');
    return value;
  }

  private reasonMetadata(reason: string | null) {
    return { reasonPresent: reason !== null, reasonLength: reason?.length ?? 0, reasonHash: reason === null ? null : createHash('sha256').update(reason).digest('hex') };
  }

  private date(value: unknown, field: string): Date {
    if (typeof value !== 'string' || !isISO8601(value, { strict: true, strictSeparator: true }) || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException(`${field} saat dilimli ISO tarih olmalıdır`);
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${field} geçersiz`);
    return date;
  }
}
