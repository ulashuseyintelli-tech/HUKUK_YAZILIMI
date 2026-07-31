import { ForbiddenException, Injectable } from "@nestjs/common";
import { PermissionGrantEffect, PermissionGrantScope, Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * I15-D1 (owner-ratified architecture: OPTION 3 — existing `PermissionGrant` substrate).
 * `bank/settlement-verifier-authorization.service.ts` (W2.2C-3) desenini birebir izler —
 * ikinci bir capability motoru KURULMAZ, aynı desen ikinci bir permissionKey için tekrarlanır.
 */
export const TRIGGER_HACIZ_PERMISSION_KEY = "debtor.enforcement.trigger_haciz" as const;

export interface TriggerHacizCapabilityAuthorizationInput {
  readonly tenantId: string;
  readonly actorUserId: string;
}

/**
 * TRIGGER_HACIZ için açık, aktöre-özel, organizasyon-içi capability kontrolü.
 *
 * Bu, `UyapSendAuthorityResolverService`'in (temsil/POA) veya CPE'nin (hukuki uygunluk)
 * YERİNE GEÇMEZ — üçü de bağımsız, ayrı predicate'lerdir. Rol/rank (ADMIN, PARTNER,
 * MANAGER, canApproveOfficeActions) capability yerine KULLANILMAZ; yalnız bu tenant+actor
 * için açıkça verilmiş bir `PermissionGrant` ALLOW kaydı yeterlidir, DENY her zaman önceliklidir.
 */
@Injectable()
export class TriggerHacizCapabilityAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAuthorized(
    input: TriggerHacizCapabilityAuthorizationInput,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const tenantId = input.tenantId?.trim();
    const actorUserId = input.actorUserId?.trim();
    if (!tenantId || !actorUserId) {
      throw new ForbiddenException({ code: "TRIGGER_HACIZ_CAPABILITY_IDENTITY_REQUIRED" });
    }

    await this.assertActiveTenantActor(tenantId, actorUserId, client);

    const now = new Date();
    const grants = await client.permissionGrant.findMany({
      where: {
        tenantId,
        subjectUserId: actorUserId,
        permissionKey: TRIGGER_HACIZ_PERMISSION_KEY,
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

    // Sorgunun `where` koşulu düşerse test yeşil KALMASIN diye ikinci, gerçek doğrulama.
    const effectiveGrants = grants.filter(
      (grant) =>
        grant.tenantId === tenantId &&
        grant.subjectUserId === actorUserId &&
        grant.permissionKey === TRIGGER_HACIZ_PERMISSION_KEY &&
        grant.scope === PermissionGrantScope.GLOBAL &&
        grant.validFrom <= now &&
        (grant.validUntil === null || grant.validUntil > now),
    );

    // DENY her zaman ALLOW'dan ÖNCELİKLİDİR.
    if (effectiveGrants.some((grant) => grant.effect === PermissionGrantEffect.DENY)) {
      throw new ForbiddenException({ code: "TRIGGER_HACIZ_CAPABILITY_EXPLICIT_DENY" });
    }
    if (!effectiveGrants.some((grant) => grant.effect === PermissionGrantEffect.ALLOW)) {
      throw new ForbiddenException({ code: "TRIGGER_HACIZ_CAPABILITY_REQUIRED" });
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
      throw new ForbiddenException({ code: "TRIGGER_HACIZ_CAPABILITY_ACTOR_NOT_ACTIVE_IN_TENANT" });
    }
    if (Boolean(user.lawyer) === Boolean(user.staffMember)) {
      throw new ForbiddenException({ code: "TRIGGER_HACIZ_CAPABILITY_ACTOR_PROFILE_INVALID" });
    }

    const profile = user.lawyer ?? user.staffMember;
    if (!profile?.isActive || profile.tenantId !== tenantId) {
      throw new ForbiddenException({ code: "TRIGGER_HACIZ_CAPABILITY_ACTOR_NOT_ACTIVE_IN_TENANT" });
    }
  }
}
