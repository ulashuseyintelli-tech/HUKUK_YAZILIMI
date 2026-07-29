import { ForbiddenException, Injectable } from '@nestjs/common';
import { PermissionGrantEffect, PermissionGrantScope, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const SETTLEMENT_VERIFY_PERMISSION_KEY = 'bank.settlement.verify' as const;

export interface SettlementVerifierAuthorizationInput {
  readonly trustedTenantId: string;
  readonly actorUserId: string;
}

/**
 * W2.2C-3 dedicated settlement-verifier permission boundary.
 *
 * This service is intentionally read-only. It does not append settlement
 * evidence, transition a bank candidate, or create a Collection. Canonical
 * lifecycle writers invoke it with their existing transaction client.
 */
@Injectable()
export class SettlementVerifierAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Called by BankSettlementEvidenceWriterService.appendHumanEvidence() and
  /// BankCandidateSettlementTransitionService.transition(). Mutation callers
  /// pass their existing transaction client so authorization and writes share
  /// one database transaction.
  /// </remarks>
  async assertAuthorized(
    input: SettlementVerifierAuthorizationInput,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const trustedTenantId = input.trustedTenantId?.trim();
    const actorUserId = input.actorUserId?.trim();
    if (!trustedTenantId || !actorUserId) {
      throw new ForbiddenException({ code: 'SETTLEMENT_VERIFIER_IDENTITY_REQUIRED' });
    }

    await this.assertActiveTenantActor(trustedTenantId, actorUserId, client);

    const now = new Date();
    const grants = await client.permissionGrant.findMany({
      where: {
        tenantId: trustedTenantId,
        subjectUserId: actorUserId,
        permissionKey: SETTLEMENT_VERIFY_PERMISSION_KEY,
        scope: PermissionGrantScope.GLOBAL,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      select: {
        tenantId: true,
        subjectUserId: true,
        permissionKey: true,
        effect: true,
        scope: true,
        validFrom: true,
        validUntil: true,
      },
    });

    const effectiveGrants = grants.filter(
      (grant) =>
        grant.tenantId === trustedTenantId &&
        grant.subjectUserId === actorUserId &&
        grant.permissionKey === SETTLEMENT_VERIFY_PERMISSION_KEY &&
        grant.scope === PermissionGrantScope.GLOBAL &&
        grant.validFrom <= now &&
        (grant.validUntil === null || grant.validUntil > now),
    );

    if (effectiveGrants.some((grant) => grant.effect === PermissionGrantEffect.DENY)) {
      throw new ForbiddenException({ code: 'SETTLEMENT_VERIFIER_EXPLICIT_DENY' });
    }
    if (!effectiveGrants.some((grant) => grant.effect === PermissionGrantEffect.ALLOW)) {
      throw new ForbiddenException({ code: 'SETTLEMENT_VERIFIER_PERMISSION_REQUIRED' });
    }
  }

  private async assertActiveTenantActor(
    trustedTenantId: string,
    actorUserId: string,
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<void> {
    const user = await client.user.findUnique({
      where: { id: actorUserId },
      select: {
        tenantId: true,
        isActive: true,
        lawyer: { select: { tenantId: true, isActive: true } },
        staffMember: { select: { tenantId: true, isActive: true } },
      },
    });

    if (!user || !user.isActive || user.tenantId !== trustedTenantId) {
      throw new ForbiddenException({
        code: 'SETTLEMENT_VERIFIER_ACTOR_NOT_ACTIVE_IN_TENANT',
      });
    }
    if (Boolean(user.lawyer) === Boolean(user.staffMember)) {
      throw new ForbiddenException({ code: 'SETTLEMENT_VERIFIER_ACTOR_PROFILE_INVALID' });
    }

    const profile = user.lawyer ?? user.staffMember;
    if (!profile?.isActive || profile.tenantId !== trustedTenantId) {
      throw new ForbiddenException({
        code: 'SETTLEMENT_VERIFIER_ACTOR_NOT_ACTIVE_IN_TENANT',
      });
    }
  }
}
