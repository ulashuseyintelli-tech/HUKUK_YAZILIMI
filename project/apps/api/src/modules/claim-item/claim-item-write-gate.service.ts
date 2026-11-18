import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { type CanonicalWriteActorType } from '../../common/canonical-write-envelope';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import {
  CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
  CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS,
  CLAIM_ITEM_LOW_IMPACT_USER_FIELDS,
} from './claim-item-approval.constants';
import {
  type ClaimItemWriteCommand,
  type ClaimItemWriteOperation,
} from './claim-item-write-command';
import {
  CLAIM_ITEM_SYSTEM_WRITER_ROUTES,
  claimItemSystemRouteUpdateFields,
  isClaimItemSystemWriterRoute,
  type ClaimItemSystemWriterRoute,
} from './claim-item-writer-routes';

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
      outcome: 'DIRECT_ALLOWED';
      actorType: 'SYSTEM';
      permission: 'SYSTEM_ROUTE';
      permissionSource: ClaimItemSystemWriterRoute;
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

/**
 * Dosya düzeyi mali yazma yetkisinin (EDIT_FINANCE) sonucu — ClaimItem insan yazma kapısıyla AYNI yüklem; kalem
 * hedefi ve yük sınıflaması YOKTUR. Kalem dışındaki dosya mali yazımlarında (Due oluşturma / güncelleme / silme)
 * kullanılır; yeni bir yetki tanımlamaz.
 */
export type ClaimItemCaseFinanceWriteResult =
  | Readonly<{
      allowed: true;
      permission: ActionCode.EDIT_FINANCE;
      permissionSource: ClaimItemWritePermissionSource;
    }>
  | Readonly<{
      allowed: false;
      reasonCode: Extract<
        ClaimItemWriteGateDenialCode,
        | 'HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT'
        | 'HUMAN_ACTOR_PROFILE_INVALID'
        | 'TENANT_CASE_SCOPE_MISMATCH'
        | 'OBJECT_PERMISSION_DENIED'
      >;
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
 * P03 permits only the exact allowlisted SYSTEM route/source/policy/operation
 * combinations. Unknown or mismatched SYSTEM routes and every EXTERNAL actor
 * remain denied. A database/read failure is not converted into an allow decision:
 * the exception aborts evaluation fail-closed.
 */
@Injectable()
export class ClaimItemWriteGateService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    command: ClaimItemWriteCommand<Record<string, unknown>>,
    database: PrismaService | object = this.prisma,
  ): Promise<ClaimItemWriteGateResult> {
    const scope = this.buildScope(command);
    const actor = command.envelope.actor;
    const db = database as any;

    if (actor.type === 'SYSTEM') {
      if (!isClaimItemSystemWriterRoute(actor.system)) {
        return this.deny(scope, actor.type, 'SYSTEM_ACTOR_AUTHORITY_NOT_ROUTED');
      }
      const route = CLAIM_ITEM_SYSTEM_WRITER_ROUTES[actor.system];
      if (
        command.envelope.source.sourceType !== route.sourceType ||
        command.envelope.authority.policyRef !== route.policyRef ||
        !(route.operations as readonly ClaimItemWriteOperation[]).includes(command.operation)
      ) {
        return this.deny(scope, actor.type, 'SYSTEM_ACTOR_AUTHORITY_NOT_ROUTED');
      }
      // Rota UPDATE alan süzgeci tanımlıysa (DUE_BRIDGE: yalnız düşük etkili alanlar) listede olmayan alan reddedilir.
      const updateFields = claimItemSystemRouteUpdateFields(actor.system);
      if (
        command.operation === 'UPDATE' &&
        updateFields &&
        Object.keys(command.payload).some((field) => !updateFields.includes(field))
      ) {
        return this.deny(scope, actor.type, 'UNSUPPORTED_UPDATE_FIELD');
      }

      const scopeFailure = await this.validateResourceScope(command, scope, actor.type, db);
      if (scopeFailure) return scopeFailure;
      return this.systemDirectAllowed(scope, actor.system);
    }
    if (actor.type === 'EXTERNAL') {
      return this.deny(scope, actor.type, 'EXTERNAL_ACTOR_AUTHORITY_NOT_ROUTED');
    }

    const profile = await this.resolveHumanProfile(
      actor.userId,
      command.envelope.tenantId,
      db,
    );
    if (!profile) {
      return this.deny(scope, actor.type, 'HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT');
    }
    if (profile === 'INVALID') {
      return this.deny(scope, actor.type, 'HUMAN_ACTOR_PROFILE_INVALID');
    }

    const scopeFailure = await this.validateResourceScope(command, scope, actor.type, db);
    if (scopeFailure) return scopeFailure;

    const permissionSource = await this.resolveObjectPermission(
      profile,
      command.envelope.caseId,
      db,
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

  /**
   * Dosya düzeyi mali yazma yetkisi (EDIT_FINANCE) — `evaluate`'in insan dalındaki AYNI aktör ve nesne yüklemi:
   * aktif, aynı büroda, tek kartlı hesap + dosya aynı büroda + avukatta `casePermissions.canEditFinance`, personelde
   * `canSeeFinance` ve `CaseStaff.canEdit`. Rütbe, rol, delegasyon ya da yalnız aynı büroda bulunmak yetki ÜRETMEZ.
   * Okuma hatası izne çevrilmez (istisna yukarı çıkar, fail-closed). `database` verilirse yüklem o istemciyle
   * (çağıranın yazma transaction'ı, aktör satırları kilitliyken) değerlendirilir.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - ClaimItemWriterRouterService.evaluateHumanCaseFinanceWrite() → CaseService.createDue / updateDue / deleteDue
   * ///    (POST / PATCH / DELETE /cases/:id/dues[/:dueId])
   * /// </remarks>
   */
  async evaluateHumanCaseFinanceWrite(
    input: { readonly tenantId: string; readonly caseId: string; readonly actorUserId: string },
    database: PrismaService | object = this.prisma,
  ): Promise<ClaimItemCaseFinanceWriteResult> {
    const db = database as any;
    const profile = await this.resolveHumanProfile(input.actorUserId, input.tenantId, db);
    if (!profile) return Object.freeze({ allowed: false, reasonCode: 'HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT' });
    if (profile === 'INVALID') return Object.freeze({ allowed: false, reasonCode: 'HUMAN_ACTOR_PROFILE_INVALID' });

    const caseInScope = await db.case.findFirst({
      where: { id: input.caseId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!caseInScope) return Object.freeze({ allowed: false, reasonCode: 'TENANT_CASE_SCOPE_MISMATCH' });

    const permissionSource = await this.resolveObjectPermission(profile, input.caseId, db);
    if (!permissionSource) return Object.freeze({ allowed: false, reasonCode: 'OBJECT_PERMISSION_DENIED' });
    return Object.freeze({ allowed: true, permission: ActionCode.EDIT_FINANCE, permissionSource });
  }

  private async resolveHumanProfile(
    userId: string,
    tenantId: string,
    database: any,
  ): Promise<HumanProfile | 'INVALID' | null> {
    const user = await database.user.findUnique({
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
    database: any,
  ): Promise<ClaimItemWritePermissionSource | null> {
    if (profile.kind === 'LAWYER') {
      const assignment = await database.caseLawyer.findFirst({
        where: { caseId, lawyerId: profile.profileId },
        select: { casePermissions: true },
      });
      const permissions = this.asPermissionRecord(assignment?.casePermissions);
      return permissions.canEditFinance === true ? 'CASE_LAWYER' : null;
    }

    if (!profile.canSeeFinance) return null;
    const assignment = await database.caseStaff.findFirst({
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

  private async validateResourceScope(
    command: ClaimItemWriteCommand<Record<string, unknown>>,
    scope: Readonly<ClaimItemWriteGateScope>,
    actorType: CanonicalWriteActorType,
    database: any,
  ): Promise<ClaimItemWriteGateResult | null> {
    const caseInScope = await database.case.findFirst({
      where: {
        id: command.envelope.caseId,
        tenantId: command.envelope.tenantId,
      },
      select: { id: true },
    });
    if (!caseInScope) {
      return this.deny(scope, actorType, 'TENANT_CASE_SCOPE_MISMATCH');
    }

    if (
      command.operation === 'CREATE' &&
      ((command.payload.caseId !== undefined &&
        command.payload.caseId !== command.envelope.caseId) ||
        (command.payload.tenantId !== undefined &&
          command.payload.tenantId !== command.envelope.tenantId))
    ) {
      return this.deny(scope, actorType, 'PAYLOAD_SCOPE_MISMATCH');
    }

    if (command.operation !== 'CREATE') {
      const claimItemInScope = await database.claimItem.findFirst({
        where: {
          id: command.envelope.target.aggregateId,
          tenantId: command.envelope.tenantId,
          caseId: command.envelope.caseId,
        },
        select: { id: true },
      });
      if (!claimItemInScope) {
        return this.deny(scope, actorType, 'CLAIM_ITEM_SCOPE_MISMATCH');
      }
    }

    return null;
  }

  private systemDirectAllowed(
    scope: Readonly<ClaimItemWriteGateScope>,
    route: ClaimItemSystemWriterRoute,
  ): ClaimItemWriteGateResult {
    return Object.freeze({
      outcome: 'DIRECT_ALLOWED',
      actorType: 'SYSTEM',
      permission: 'SYSTEM_ROUTE',
      permissionSource: route,
      approvalRequired: false,
      scope,
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
