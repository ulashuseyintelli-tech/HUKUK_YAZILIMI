import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { type CanonicalWriteActorType } from '../../common/canonical-write-envelope';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import {
  CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
  CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS,
  CLAIM_ITEM_LOW_IMPACT_USER_FIELDS,
} from './claim-item-approval.constants';
import { type ClaimItemWriteCommand } from './claim-item-write-command';

export const CLAIM_ITEM_WRITE_GATE_DENIAL_CODES = [
  'HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT',
  'HUMAN_ACTOR_PROFILE_INVALID',
  'SYSTEM_ACTOR_AUTHORITY_NOT_ROUTED',
  'EXTERNAL_ACTOR_AUTHORITY_NOT_ROUTED',
  'TENANT_CASE_SCOPE_MISMATCH',
  'CLAIM_ITEM_SCOPE_MISMATCH',
  'PAYLOAD_SCOPE_MISMATCH',
  'OBJECT_PERMISSION_DENIED',
  'EMPTY_UPDATE_PAYLOAD',
  'UNSUPPORTED_UPDATE_FIELD',
] as const;

export type ClaimItemWriteGateDenialCode =
  (typeof CLAIM_ITEM_WRITE_GATE_DENIAL_CODES)[number];

export type ClaimItemWritePermissionSource = 'CASE_LAWYER' | 'CASE_STAFF';

export interface ClaimItemWriteGateScope {
  readonly tenantId: string;
  readonly caseId: string;
  readonly claimItemId?: string;
}

export type ClaimItemWriteGateResult =
  | Readonly<{
      outcome: 'DIRECT_ALLOWED';
      actorType: 'HUMAN';
      permission: ActionCode.EDIT_FINANCE;
      permissionSource: ClaimItemWritePermissionSource;
      approvalRequired: false;
      scope: Readonly<ClaimItemWriteGateScope>;
    }>
  | Readonly<{
      outcome: 'OFFICE_APPROVAL_REQUIRED';
      actorType: 'HUMAN';
      permission: ActionCode.EDIT_FINANCE;
      permissionSource: ClaimItemWritePermissionSource;
      approvalRequired: true;
      approvalActionCode: typeof CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE;
      scope: Readonly<ClaimItemWriteGateScope>;
    }>
  | Readonly<{
      outcome: 'DENIED';
      actorType: CanonicalWriteActorType;
      reasonCode: ClaimItemWriteGateDenialCode;
      approvalRequired: false;
      scope: Readonly<ClaimItemWriteGateScope>;
    }>;

type HumanProfile =
  | Readonly<{ kind: 'LAWYER'; profileId: string }>
  | Readonly<{ kind: 'STAFF'; profileId: string; canSeeFinance: boolean }>;

/**
 * WS01-P02 canonical command gate.
 *
 * This service enforces actor lifecycle, tenant/case ownership and explicit
 * object-scoped finance permission before it classifies the command as direct
 * or OfficeApproval-required. It deliberately does not persist, create an
 * approval request or route any existing writer; writer routing belongs to the
 * separately authorized WS01-P03 package.
 *
 * SYSTEM and EXTERNAL actors are classified but denied until an explicit,
 * canonical identity/permission route is wired. A database/read failure is not
 * converted into an allow decision: the exception aborts evaluation fail-closed.
 */
@Injectable()
export class ClaimItemWriteGateService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    command: ClaimItemWriteCommand<Record<string, unknown>>,
  ): Promise<ClaimItemWriteGateResult> {
    const scope = this.buildScope(command);
    const actor = command.envelope.actor;

    if (actor.type === 'SYSTEM') {
      return this.deny(scope, actor.type, 'SYSTEM_ACTOR_AUTHORITY_NOT_ROUTED');
    }
    if (actor.type === 'EXTERNAL') {
      return this.deny(scope, actor.type, 'EXTERNAL_ACTOR_AUTHORITY_NOT_ROUTED');
    }

    const profile = await this.resolveHumanProfile(
      actor.userId,
      command.envelope.tenantId,
    );
    if (!profile) {
      return this.deny(scope, actor.type, 'HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT');
    }
    if (profile === 'INVALID') {
      return this.deny(scope, actor.type, 'HUMAN_ACTOR_PROFILE_INVALID');
    }

    const caseInScope = await this.prisma.case.findFirst({
      where: {
        id: command.envelope.caseId,
        tenantId: command.envelope.tenantId,
      },
      select: { id: true },
    });
    if (!caseInScope) {
      return this.deny(scope, actor.type, 'TENANT_CASE_SCOPE_MISMATCH');
    }

    if (
      command.operation === 'CREATE' &&
      command.payload.caseId !== undefined &&
      command.payload.caseId !== command.envelope.caseId
    ) {
      return this.deny(scope, actor.type, 'PAYLOAD_SCOPE_MISMATCH');
    }

    if (command.operation !== 'CREATE') {
      const claimItemInScope = await this.prisma.claimItem.findFirst({
        where: {
          id: command.envelope.target.aggregateId,
          tenantId: command.envelope.tenantId,
          caseId: command.envelope.caseId,
        },
        select: { id: true },
      });
      if (!claimItemInScope) {
        return this.deny(scope, actor.type, 'CLAIM_ITEM_SCOPE_MISMATCH');
      }
    }

    const permissionSource = await this.resolveObjectPermission(
      profile,
      command.envelope.caseId,
    );
    if (!permissionSource) {
      return this.deny(scope, actor.type, 'OBJECT_PERMISSION_DENIED');
    }

    if (command.operation === 'UPDATE') {
      const fields = Object.keys(command.payload);
      if (fields.length === 0) {
        return this.deny(scope, actor.type, 'EMPTY_UPDATE_PAYLOAD');
      }

      const unsupported = fields.filter(
        (field) =>
          !this.isLowImpactField(field) && !this.isHighImpactField(field),
      );
      if (unsupported.length > 0) {
        return this.deny(scope, actor.type, 'UNSUPPORTED_UPDATE_FIELD');
      }

      if (!fields.some((field) => this.isHighImpactField(field))) {
        return this.directAllowed(scope, permissionSource);
      }
    }

    return this.approvalRequired(scope, permissionSource);
  }

  private async resolveHumanProfile(
    userId: string,
    tenantId: string,
  ): Promise<HumanProfile | 'INVALID' | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        tenantId: true,
        isActive: true,
        lawyer: {
          select: { id: true, tenantId: true, isActive: true },
        },
        staffMember: {
          select: {
            id: true,
            tenantId: true,
            isActive: true,
            canSeeFinance: true,
          },
        },
      },
    });

    if (!user || !user.isActive || user.tenantId !== tenantId) return null;
    if (user.lawyer && user.staffMember) return 'INVALID';

    if (user.lawyer) {
      if (!user.lawyer.isActive || user.lawyer.tenantId !== tenantId) return null;
      return Object.freeze({ kind: 'LAWYER', profileId: user.lawyer.id });
    }
    if (user.staffMember) {
      if (!user.staffMember.isActive || user.staffMember.tenantId !== tenantId) return null;
      return Object.freeze({
        kind: 'STAFF',
        profileId: user.staffMember.id,
        canSeeFinance: user.staffMember.canSeeFinance,
      });
    }
    return 'INVALID';
  }

  private async resolveObjectPermission(
    profile: HumanProfile,
    caseId: string,
  ): Promise<ClaimItemWritePermissionSource | null> {
    if (profile.kind === 'LAWYER') {
      const assignment = await this.prisma.caseLawyer.findFirst({
        where: { caseId, lawyerId: profile.profileId },
        select: { casePermissions: true },
      });
      const permissions = this.asPermissionRecord(assignment?.casePermissions);
      return permissions.canEditFinance === true ? 'CASE_LAWYER' : null;
    }

    if (!profile.canSeeFinance) return null;
    const assignment = await this.prisma.caseStaff.findFirst({
      where: { caseId, staffMemberId: profile.profileId },
      select: { canEdit: true },
    });
    return assignment?.canEdit === true ? 'CASE_STAFF' : null;
  }

  private asPermissionRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private isLowImpactField(field: string): boolean {
    return (CLAIM_ITEM_LOW_IMPACT_USER_FIELDS as readonly string[]).includes(field);
  }

  private isHighImpactField(field: string): boolean {
    return (CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS as readonly string[]).includes(field);
  }

  private buildScope(
    command: ClaimItemWriteCommand<Record<string, unknown>>,
  ): Readonly<ClaimItemWriteGateScope> {
    return Object.freeze({
      tenantId: command.envelope.tenantId,
      caseId: command.envelope.caseId,
      ...(command.envelope.target.aggregateId === undefined
        ? {}
        : { claimItemId: command.envelope.target.aggregateId }),
    });
  }

  private directAllowed(
    scope: Readonly<ClaimItemWriteGateScope>,
    permissionSource: ClaimItemWritePermissionSource,
  ): ClaimItemWriteGateResult {
    return Object.freeze({
      outcome: 'DIRECT_ALLOWED',
      actorType: 'HUMAN',
      permission: ActionCode.EDIT_FINANCE,
      permissionSource,
      approvalRequired: false,
      scope,
    });
  }

  private approvalRequired(
    scope: Readonly<ClaimItemWriteGateScope>,
    permissionSource: ClaimItemWritePermissionSource,
  ): ClaimItemWriteGateResult {
    return Object.freeze({
      outcome: 'OFFICE_APPROVAL_REQUIRED',
      actorType: 'HUMAN',
      permission: ActionCode.EDIT_FINANCE,
      permissionSource,
      approvalRequired: true,
      approvalActionCode: CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
      scope,
    });
  }

  private deny(
    scope: Readonly<ClaimItemWriteGateScope>,
    actorType: CanonicalWriteActorType,
    reasonCode: ClaimItemWriteGateDenialCode,
  ): ClaimItemWriteGateResult {
    return Object.freeze({
      outcome: 'DENIED',
      actorType,
      reasonCode,
      approvalRequired: false,
      scope,
    });
  }
}
