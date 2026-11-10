import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { validateClientLegalAuditMetadata } from './client-legal-audit.contract';
import {
  assertK73AccessInTx, assertK73ExistingAuthority, assertK73Manager, currentK73Actor,
  K73_KEYS, K73_OPERATIONS, K73Operation, k73ObjectInScope, k73Scopes,
  lockK73Subject, revokeK73ForSubjectInTx,
} from './client-special-category-access';

export interface K73Scope { clientId: string; caseId?: string }
export interface K73GrantInput extends K73Scope {
  subjectUserId: string; operation: K73Operation; validFrom: string; validUntil: string; reason: string;
}

@Injectable()
export class ClientSpecialCategoryAccessService {
  constructor(private prisma: PrismaService, private audit: AuditService, private office: OfficeApprovalService) {}

  private transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000, maxWait: 10_000 });
  }

  private requireReason(reason: string) {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new BadRequestException('Gerekçe zorunludur.');
    if (!validateClientLegalAuditMetadata('CLIENT_SPECIAL_DATA_GRANT', { reason }).safe) {
      throw new BadRequestException('Gerekçe ham kimlik numarası deseni içeremez.');
    }
    return reason.trim();
  }

  private async requireClient(tx: Prisma.TransactionClient, tenantId: string, scope: K73Scope) {
    if (typeof scope?.clientId !== 'string' || !scope.clientId ||
      (scope.caseId !== undefined && (typeof scope.caseId !== 'string' || !scope.caseId))) {
      throw new NotFoundException('Müvekkil veya dosya bağı bulunamadı.');
    }
    const client = await tx.client.findFirst({ where: {
      id: scope.clientId, tenantId,
      ...(scope.caseId ? { caseClients: { some: { caseId: scope.caseId, case: { tenantId } } } } : {}),
    }, select: { id: true } });
    if (!client) throw new NotFoundException('Müvekkil veya dosya bağı bulunamadı.');
  }

  // Only the dedicated controller calls these entries; management never returns protected content.
  async capabilities(tenantId: string, actorUserId: string, scope: K73Scope) {
    return this.transaction(async tx => {
      const actor = await currentK73Actor(tx, tenantId, actorUserId);
      const canManage = actor.role === 'ADMIN' && !actor.staffMember;
      await this.requireClient(tx, tenantId, scope);
      if (!canManage && !await k73ObjectInScope(tx, tenantId, actorUserId, scope.clientId, scope.caseId)) {
        throw new ForbiddenException({ code: 'K73_ACCESS_DENIED' });
      }
      const operations = {} as Record<K73Operation, { allowed: boolean; validUntil: string | null }>;
      for (const operation of K73_OPERATIONS) {
        try {
          const grant = await assertK73AccessInTx(tx, this.office, tenantId, actorUserId, operation, scope.clientId, scope.caseId);
          operations[operation] = { allowed: true, validUntil: grant.validUntil.toISOString() };
        } catch (error) {
          if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error;
          operations[operation] = { allowed: false, validUntil: null };
        }
      }
      // Scope choices expose only this principal's own bindings; no other person's grants.
      const bindings = await k73Scopes(tx).findMany({ where: {
        tenantId, clientId: scope.clientId, revokedAt: null,
        permissionGrant: { tenantId, subjectUserId: actorUserId, permissionKey: { in: Object.values(K73_KEYS) } },
      }, select: { caseId: true } });
      const choices: Array<string | null> = [...new Set<string | null>(bindings.map((b: any) => b.caseId))];
      const cases = await tx.case.findMany({ where: { tenantId, id: { in: choices.filter((id): id is string => id !== null) },
        caseClients: { some: { clientId: scope.clientId } } }, select: { id: true, fileNumber: true } });
      const caseScopes = [
        ...(choices.includes(null) ? [{ caseId: null, label: 'Müvekkil kapsamı' }] : []),
        ...cases.map(c => ({ caseId: c.id as string | null, label: c.fileNumber })),
      ];
      return { canManage, operations, caseScopes, scope: { clientId: scope.clientId, caseId: scope.caseId ?? null } };
    });
  }

  async candidates(tenantId: string, actorUserId: string, scope: K73Scope, query = '') {
    return this.transaction(async tx => {
      await assertK73Manager(tx, tenantId, actorUserId);
      await this.requireClient(tx, tenantId, scope);
      const q = query.trim().slice(0, 100);
      const users = await tx.user.findMany({ where: {
        tenantId, isActive: true, role: { in: ['ADMIN', 'USER'] }, id: { not: actorUserId },
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { surname: { contains: q, mode: 'insensitive' } }] } : {}),
      }, select: { id: true, name: true, surname: true }, orderBy: { id: 'asc' }, take: 101 });
      const eligible: Array<{ id: string; label: string }> = [];
      for (const user of users.slice(0, 100)) {
        try {
          await assertK73ExistingAuthority(tx, this.office, tenantId, user.id, scope.clientId, scope.caseId);
          eligible.push({ id: user.id, label: [user.name, user.surname].filter(Boolean).join(' ') });
        } catch (error) {
          if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error;
        }
      }
      const cases = await tx.case.findMany({ where: { tenantId, caseClients: { some: { clientId: scope.clientId } } },
        select: { id: true, fileNumber: true }, orderBy: { id: 'asc' } });
      return { users: eligible, cases: cases.map(c => ({ id: c.id, label: c.fileNumber })), truncated: users.length > 100 };
    });
  }

  async listGrants(tenantId: string, actorUserId: string, scope: K73Scope) {
    return this.transaction(async tx => {
      await assertK73Manager(tx, tenantId, actorUserId);
      await this.requireClient(tx, tenantId, scope);
      const rows = await k73Scopes(tx).findMany({ where: {
        tenantId, clientId: scope.clientId, ...(scope.caseId ? { caseId: scope.caseId } : {}),
      }, include: { permissionGrant: true }, orderBy: { createdAt: 'desc' } });
      return rows.map((r: any) => ({
        id: r.id, subjectUserId: r.permissionGrant.subjectUserId, caseId: r.caseId,
        operation: K73_OPERATIONS.find(op => K73_KEYS[op] === r.permissionGrant.permissionKey),
        validFrom: r.permissionGrant.validFrom, validUntil: r.permissionGrant.validUntil,
        revokedAt: r.revokedAt, reason: r.permissionGrant.reason, revokeReason: r.revokeReason,
      }));
    });
  }

  async grant(tenantId: string, actorUserId: string, input: K73GrantInput) {
    if (!K73_OPERATIONS.includes(input.operation)) throw new BadRequestException('İşlem geçersiz.');
    const reason = this.requireReason(input.reason);
    const validFrom = new Date(input.validFrom), validUntil = new Date(input.validUntil);
    if (!Number.isFinite(validFrom.getTime()) || !Number.isFinite(validUntil.getTime()) ||
        validUntil <= validFrom) throw new BadRequestException('Başlangıç, sonlu bitiş ve gerekçe zorunludur.');
    return this.transaction(async tx => {
      await lockK73Subject(tx, tenantId, input.subjectUserId);
      await assertK73Manager(tx, tenantId, actorUserId);
      if (input.subjectUserId === actorUserId) throw new ForbiddenException({ code: 'K73_SELF_GRANT_DENIED' });
      await this.requireClient(tx, tenantId, input);
      await assertK73ExistingAuthority(tx, this.office, tenantId, input.subjectUserId, input.clientId, input.caseId);
      if (validUntil <= new Date()) throw new BadRequestException('Yetki bitişi geçmişte olamaz.');
      const permission = await tx.permissionGrant.create({ data: {
        tenantId, subjectUserId: input.subjectUserId, permissionKey: K73_KEYS[input.operation],
        effect: 'ALLOW', scope: 'GLOBAL', validFrom, validUntil, grantedByUserId: actorUserId, reason,
      } });
      const binding = await k73Scopes(tx).create({ data: {
        tenantId, permissionGrantId: permission.id, clientId: input.clientId, caseId: input.caseId ?? null,
      } });
      await this.audit.logInTransaction(tx, {
        tenantId, action: 'CLIENT_SPECIAL_DATA_GRANT', entityType: 'CLIENT_SPECIAL_DATA_ACCESS', entityId: binding.id,
        userId: actorUserId, metadata: { subjectUserId: input.subjectUserId, clientId: input.clientId, caseId: input.caseId ?? null,
          operation: input.operation, validFrom: validFrom.toISOString(), validUntil: validUntil.toISOString(), reason },
      });
      return { id: binding.id, subjectUserId: input.subjectUserId, operation: input.operation, validFrom, validUntil };
    });
  }

  async revoke(tenantId: string, actorUserId: string, scopeId: string, reason: string) {
    if (typeof scopeId !== 'string' || !scopeId) throw new NotFoundException('Yetki bulunamadı.');
    reason = this.requireReason(reason);
    return this.transaction(async tx => {
      const row = await k73Scopes(tx).findFirst({ where: { id: scopeId, tenantId,
        permissionGrant: { permissionKey: { in: Object.values(K73_KEYS) } } }, include: { permissionGrant: true } });
      if (!row) throw new NotFoundException('Yetki bulunamadı.');
      await lockK73Subject(tx, tenantId, row.permissionGrant.subjectUserId);
      await assertK73Manager(tx, tenantId, actorUserId);
      const now = new Date();
      const changed = await k73Scopes(tx).updateMany({ where: { id: scopeId, tenantId, revokedAt: null },
        data: { revokedAt: now, revokedByUserId: actorUserId, revokeReason: reason.trim() } });
      if (changed.count) await this.audit.logInTransaction(tx, {
        tenantId, action: 'CLIENT_SPECIAL_DATA_GRANTS_REVOKE', entityType: 'CLIENT_SPECIAL_DATA_ACCESS', entityId: scopeId,
        userId: actorUserId, metadata: { reason: reason.trim(), scopeIds: [scopeId], count: changed.count },
      });
      return { revoked: true };
    });
  }

  async dutyChange(tenantId: string, actorUserId: string, subjectUserId: string, reason: string) {
    reason = this.requireReason(reason);
    return this.transaction(async tx => {
      await lockK73Subject(tx, tenantId, subjectUserId);
      await assertK73Manager(tx, tenantId, actorUserId);
      const count = await revokeK73ForSubjectInTx(tx, tenantId, subjectUserId, actorUserId, reason.trim(), this.audit);
      await this.audit.logInTransaction(tx, {
        tenantId, action: 'CLIENT_SPECIAL_DATA_DUTY_CHANGE', entityType: 'USER', entityId: subjectUserId,
        userId: actorUserId, metadata: { reason: reason.trim(), revokedGrantCount: count },
      });
      return { revokedGrantCount: count };
    });
  }
}
