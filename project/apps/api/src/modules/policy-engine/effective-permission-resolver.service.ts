import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActionCode } from './types/action-code.enum';
import {
  Capacity,
  EffectivePermissionDecision,
  EffectivePermissionInput,
  GuidedOpenDecision,
} from './types/effective-permission.types';
import {
  ACTION_TO_CASE_PERMISSION,
  classifyAction,
  decide,
  isOfficeAdminCapacity,
} from './effective-permission-mapping';

/**
 * EffectivePermissionResolver — Guided-Open per-user karar motoru (P2a CORE).
 *
 * KESİN KURAL (P2 / #503): Bu resolver hiçbir kullanıcı aksiyonunu ENGELLEMEZ.
 * Yalnız (user, case, action) için Guided-Open kararını HESAPLAR (observe-mode).
 *
 * P2a'da hiçbir controller/guard tarafından çağrılmaz → ÜRETİM DAVRANIŞI DEĞİŞMEZ.
 * Observe-mode hook'u (diagnostic/audit + endpoint pilotu) AYRI faz P2b'de eklenir.
 *
 * CasePolicyEngine'i (case-policy/fact gating) REPLACE ETMEZ; per-user katman olarak composes.
 */
@Injectable()
export class EffectivePermissionResolver {
  private readonly logger = new Logger(EffectivePermissionResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bir (user, case, action) için Guided-Open kararını HESAPLAR.
   * Engelleme YOK; `enforced` daima false, `mode` daima 'observe'.
   */
  async resolve(input: EffectivePermissionInput): Promise<EffectivePermissionDecision> {
    const cap = await this.readCapacity(input.actorUserId);
    const tenantOk = cap.tenantId !== null && cap.tenantId === input.tenantId;

    const grant = await this.readCaseGrant(
      input.caseId,
      cap.lawyerId,
      cap.staffMemberId,
      input.actionCode,
    );

    // fullAuthority: P2'de henüz bir alan YOK (migration yok) → placeholder false.
    // (User.fullAuthority / Office.unrestrictedMode ileride; D1/D2 KİLİTLİ kurallarına tabi.)
    const fullAuthority = false;

    const actionClass = classifyAction(input.actionCode);
    const { decision, decisionSource } = decide({
      actionCode: input.actionCode,
      actionClass,
      capacity: cap.capacity,
      tenantOk,
      hasCaseMembership: grant.hasCaseMembership,
      caseGrantPresent: grant.caseGrantPresent,
      isOfficeAdmin: isOfficeAdminCapacity(cap.capacity),
      fullAuthority,
    });

    return {
      mode: 'observe',
      enforced: false,
      decision,
      decisionSource,
      actionClass,
      capacity: cap.capacity,
      hasCaseMembership: grant.hasCaseMembership,
      caseGrantPresent: grant.caseGrantPresent,
      fullAuthority,
      wouldRequireConfirm: decision === GuidedOpenDecision.CONFIRM_REQUIRED,
      wouldRequireRoute: decision === GuidedOpenDecision.ROUTE_REQUIRED,
      wouldRequireApproval: decision === GuidedOpenDecision.APPROVAL_REQUIRED,
      wouldRequireHardware: decision === GuidedOpenDecision.HARDWARE_REQUIRED,
      wouldDenyTenantBoundary: decision === GuidedOpenDecision.DENY_TENANT_BOUNDARY,
      reason: `${decision} via ${decisionSource} (class=${actionClass}, capacity=${cap.capacity})`,
    };
  }

  /**
   * Capacity reader: User → Lawyer.lawyerRank XOR StaffMember.staffType (K1 köprü).
   * Tek 'role' kolonu yoktur; iki enum ayrı okunur.
   */
  private async readCapacity(actorUserId: string): Promise<{
    capacity: Capacity;
    tenantId: string | null;
    lawyerId?: string;
    staffMemberId?: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      include: { lawyer: true, staffMember: true },
    });
    if (!user) return { capacity: 'UNKNOWN', tenantId: null };
    if (user.lawyer) {
      return {
        capacity: (user.lawyer.lawyerRank as Capacity) ?? 'UNKNOWN',
        tenantId: user.tenantId,
        lawyerId: user.lawyer.id,
      };
    }
    if (user.staffMember) {
      return {
        capacity: (user.staffMember.staffType as Capacity) ?? 'UNKNOWN',
        tenantId: user.tenantId,
        staffMemberId: user.staffMember.id,
      };
    }
    return { capacity: 'UNKNOWN', tenantId: user.tenantId };
  }

  /**
   * Case-grant reader: CaseLawyer.casePermissions / CaseStaff.can*.
   * caseId yoksa (office-wide action) → üyelik/grant yok.
   */
  private async readCaseGrant(
    caseId: string | undefined,
    lawyerId: string | undefined,
    staffMemberId: string | undefined,
    actionCode: ActionCode,
  ): Promise<{ hasCaseMembership: boolean; caseGrantPresent: boolean }> {
    if (!caseId) return { hasCaseMembership: false, caseGrantPresent: false };

    if (lawyerId) {
      const cl = await this.prisma.caseLawyer.findFirst({
        where: { caseId, lawyerId },
        select: { casePermissions: true, hasSignatureAuthority: true },
      });
      if (!cl) return { hasCaseMembership: false, caseGrantPresent: false };
      return { hasCaseMembership: true, caseGrantPresent: this.lawyerGrantPresent(cl, actionCode) };
    }

    if (staffMemberId) {
      const cs = await this.prisma.caseStaff.findFirst({
        where: { caseId, staffMemberId },
        select: { canEdit: true, canApprove: true, canView: true },
      });
      if (!cs) return { hasCaseMembership: false, caseGrantPresent: false };
      const present = cs.canEdit === true || cs.canApprove === true || cs.canView === true;
      return { hasCaseMembership: true, caseGrantPresent: present };
    }

    return { hasCaseMembership: false, caseGrantPresent: false };
  }

  private lawyerGrantPresent(
    cl: { casePermissions: unknown; hasSignatureAuthority: boolean },
    actionCode: ActionCode,
  ): boolean {
    if (actionCode === ActionCode.SIGN) return cl.hasSignatureAuthority === true;
    const key = ACTION_TO_CASE_PERMISSION[actionCode];
    if (!key) return false;
    const perms = (cl.casePermissions ?? {}) as Record<string, unknown>;
    return perms[key] === true;
  }
}
