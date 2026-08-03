import { ForbiddenException, Injectable } from '@nestjs/common';
import { PermissionGrantEffect, PermissionGrantScope, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/** CR-1 için mevcut PermissionGrant altyapısındaki ayrı review capability anahtarı. */
export const CLIENT_INTAKE_REVIEW_PERMISSION_KEY = 'client.intake.review' as const;

export interface ClientIntakeReviewAuthorizationInput {
  readonly tenantId: string;
  readonly actorUserId: string;
}

/**
 * X3-B04 — intake review için tenant/actor-bound PermissionGrant tüketicisi.
 *
 * Rol veya promotion eligibility bu serviste yetki üretmez. Yalnız active tenant actor +
 * exact GLOBAL `client.intake.review` ALLOW geçer; geçerli bir DENY her zaman önceliklidir.
 * Yeni authority motoru kurulmaz, mevcut canonical PermissionGrant substrate'i tüketilir.
 */
@Injectable()
export class ClientIntakeReviewAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Frozen C2 `isIntakeReviewAuthorized` callback'i.
   *
   * @remarks Çağrıldığı yer: ClientIntakeReviewController.runReviewCommand().
   */
  async isAuthorized(actorUserId: string, tenantId: string): Promise<boolean> {
    try {
      await this.assertAuthorized({ actorUserId, tenantId });
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  async assertAuthorized(
    input: ClientIntakeReviewAuthorizationInput,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const tenantId = input.tenantId?.trim();
    const actorUserId = input.actorUserId?.trim();
    if (!tenantId || !actorUserId) {
      throw new ForbiddenException({ code: 'CLIENT_INTAKE_REVIEW_IDENTITY_REQUIRED' });
    }

    await this.assertActiveTenantActor(tenantId, actorUserId, client);

    const now = new Date();
    const grants = await client.permissionGrant.findMany({
      where: {
        tenantId,
        subjectUserId: actorUserId,
        permissionKey: CLIENT_INTAKE_REVIEW_PERMISSION_KEY,
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

    // Query koşulu yanlışlıkla gevşerse false-green üretmemek için ikinci exact doğrulama.
    const effectiveGrants = grants.filter(
      (grant) =>
        grant.tenantId === tenantId &&
        grant.subjectUserId === actorUserId &&
        grant.permissionKey === CLIENT_INTAKE_REVIEW_PERMISSION_KEY &&
        grant.scope === PermissionGrantScope.GLOBAL &&
        grant.validFrom <= now &&
        (grant.validUntil === null || grant.validUntil > now),
    );

    if (effectiveGrants.some((grant) => grant.effect === PermissionGrantEffect.DENY)) {
      throw new ForbiddenException({ code: 'CLIENT_INTAKE_REVIEW_EXPLICIT_DENY' });
    }
    if (!effectiveGrants.some((grant) => grant.effect === PermissionGrantEffect.ALLOW)) {
      throw new ForbiddenException({ code: 'CLIENT_INTAKE_REVIEW_PERMISSION_REQUIRED' });
    }
  }

  private async assertActiveTenantActor(
    tenantId: string,
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

    if (!user || !user.isActive || user.tenantId !== tenantId) {
      throw new ForbiddenException({ code: 'CLIENT_INTAKE_REVIEW_ACTOR_NOT_ACTIVE_IN_TENANT' });
    }
    if (Boolean(user.lawyer) === Boolean(user.staffMember)) {
      throw new ForbiddenException({ code: 'CLIENT_INTAKE_REVIEW_ACTOR_PROFILE_INVALID' });
    }

    const profile = user.lawyer ?? user.staffMember;
    if (!profile?.isActive || profile.tenantId !== tenantId) {
      throw new ForbiddenException({ code: 'CLIENT_INTAKE_REVIEW_ACTOR_NOT_ACTIVE_IN_TENANT' });
    }
  }
}
