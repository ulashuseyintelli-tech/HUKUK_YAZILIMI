import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import {
  ActionClass,
  DecisionSource,
  GuidedOpenDecision,
} from '../policy-engine/types/effective-permission.types';
import { classifyAction } from '../policy-engine/effective-permission-mapping';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import { ConfirmationTokenService } from '../permission-diagnostics/guided-edge/confirmation-token.service';
import {
  buildGuardedEdgeOutcome,
  type GuardedEdgeOutcomeEnvelope,
} from '../permission-diagnostics/guided-edge/guarded-edge-outcome.envelope';

export const RECEIPT_AUTHORIZATION_SURFACES = {
  COLLECTIONS: 'POST /collections',
  CASE_COLLECTIONS: 'POST /cases/:id/collections',
  BANK_MATCH: 'POST /bank/transactions/:id/match',
  EXTERNAL_CASE_COLLECTION: 'POST /external-cases/:id/collection',
} as const;

export type ReceiptAuthorizationSurface =
  (typeof RECEIPT_AUTHORIZATION_SURFACES)[keyof typeof RECEIPT_AUTHORIZATION_SURFACES];

export interface ReceiptAuthorizationInput {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly caseId: string;
  readonly surface: ReceiptAuthorizationSurface;
  readonly payload: unknown;
  readonly confirmationToken?: string;
}

export type ReceiptAuthorizationResult =
  | Readonly<{ kind: 'ALLOW' }>
  | Readonly<{ kind: 'ENVELOPE'; envelope: GuardedEdgeOutcomeEnvelope }>;

type HumanReceiptProfile =
  | Readonly<{ kind: 'LAWYER'; profileId: string }>
  | Readonly<{ kind: 'STAFF'; profileId: string }>;

/**
 * RCV-P2-WS03-P03 bounded enforcement boundary.
 *
 * This service intentionally does not call EffectivePermissionResolver: that
 * resolver is observe-only and cannot become enforcement authority. It consumes
 * the existing RECORD_COLLECTION/L2 vocabulary directly, requires an active
 * tenant-bound HUMAN profile and applies the current L2 case-membership rule.
 * Partner/manager capacity does not create a global shortcut here.
 */
@Injectable()
export class ReceiptObjectScopeAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly confirmationTokens: ConfirmationTokenService,
  ) {}

  async resolveBankCaseId(input: {
    tenantId: string;
    transactionId: string;
    requestedCaseId: string;
  }): Promise<string> {
    const requestedCaseId = input.requestedCaseId?.trim();
    if (!requestedCaseId) {
      throw new BadRequestException({ code: 'RECEIPT_CASE_REQUIRED' });
    }

    const transaction = await (this.prisma as any).bankTransaction.findFirst({
      where: { id: input.transactionId, tenantId: input.tenantId },
      select: { matchedCaseId: true },
    });
    if (!transaction) {
      throw new NotFoundException({ code: 'RECEIPT_BANK_TRANSACTION_NOT_FOUND' });
    }
    if (transaction.matchedCaseId && transaction.matchedCaseId !== requestedCaseId) {
      throw new ConflictException({ code: 'RECEIPT_BANK_CASE_CONFLICT' });
    }

    await this.assertTenantCase(input.tenantId, requestedCaseId);
    return requestedCaseId;
  }

  async resolveExternalCaseId(input: {
    tenantId: string;
    externalCaseId: string;
  }): Promise<string> {
    const externalCase = await (this.prisma as any).externalCase.findFirst({
      where: { id: input.externalCaseId, tenantId: input.tenantId },
      select: {
        caseDebtor: {
          select: {
            case: { select: { id: true, tenantId: true } },
          },
        },
      },
    });
    if (!externalCase) {
      throw new NotFoundException({ code: 'RECEIPT_EXTERNAL_CASE_NOT_FOUND' });
    }

    const legalCase = externalCase.caseDebtor?.case;
    if (!legalCase?.id || legalCase.tenantId !== input.tenantId) {
      throw new ForbiddenException({ code: 'RECEIPT_EXTERNAL_CASE_SCOPE_MISMATCH' });
    }

    await this.assertTenantCase(input.tenantId, legalCase.id);
    return legalCase.id;
  }

  async authorize(input: ReceiptAuthorizationInput): Promise<ReceiptAuthorizationResult> {
    this.assertRecordCollectionL2Mapping();
    this.assertRequiredIdentity(input);
    await this.assertTenantCase(input.tenantId, input.caseId);

    const profile = await this.resolveHumanProfile(input.actorUserId, input.tenantId);
    const hasCaseMembership = await this.hasCaseMembership(profile, input.caseId);
    const binding = {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      actionCode: ActionCode.RECORD_COLLECTION,
      surface: input.surface,
      targetRef: input.caseId,
      payloadHash: stableJsonHash(input.payload),
    };

    if (input.confirmationToken) {
      this.assertConfirmationTokenAvailable();
      const consumed = await this.confirmationTokens.consume(
        input.confirmationToken,
        binding,
      );
      if (!consumed.ok) {
        throw new BadRequestException({
          code: `RECEIPT_CONFIRMATION_${consumed.result}`,
        });
      }
      return Object.freeze({ kind: 'ALLOW' });
    }

    if (hasCaseMembership) {
      return Object.freeze({ kind: 'ALLOW' });
    }

    this.assertConfirmationTokenAvailable();
    const issued = await this.confirmationTokens.issue(binding, {
      decisionSource: DecisionSource.CONFIRM_REQUIRED,
      outcome: GuidedOpenDecision.CONFIRM_REQUIRED,
    });
    return Object.freeze({
      kind: 'ENVELOPE',
      envelope: buildGuardedEdgeOutcome({
        outcome: GuidedOpenDecision.CONFIRM_REQUIRED,
        actionCode: ActionCode.RECORD_COLLECTION,
        target: { resourceType: 'CASE', caseId: input.caseId },
        decisionSource: DecisionSource.CONFIRM_REQUIRED,
        reasonCode: 'L2_SENSITIVE_NON_MEMBER',
        message: 'Bu dosya kapsamındaki tahsilat kaydı için kullanıcı doğrulaması gereklidir.',
        auditRef: issued.auditRef,
        confirmation: {
          token: issued.token,
          expiresAt: issued.expiresAt,
          bindingHash: issued.bindingHash,
        },
      }),
    });
  }

  private assertRecordCollectionL2Mapping(): void {
    if (classifyAction(ActionCode.RECORD_COLLECTION) !== ActionClass.L2) {
      throw new ServiceUnavailableException({
        code: 'RECEIPT_AUTHORIZATION_MAPPING_INVALID',
      });
    }
  }

  private assertRequiredIdentity(input: ReceiptAuthorizationInput): void {
    if (!input.tenantId?.trim() || !input.actorUserId?.trim() || !input.caseId?.trim()) {
      throw new ForbiddenException({ code: 'RECEIPT_AUTHORIZATION_IDENTITY_REQUIRED' });
    }
  }

  private async assertTenantCase(tenantId: string, caseId: string): Promise<void> {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });
    if (!legalCase) {
      throw new NotFoundException({ code: 'RECEIPT_CASE_NOT_FOUND' });
    }
  }

  private async resolveHumanProfile(
    actorUserId: string,
    tenantId: string,
  ): Promise<HumanReceiptProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: {
        tenantId: true,
        isActive: true,
        lawyer: { select: { id: true, tenantId: true, isActive: true } },
        staffMember: { select: { id: true, tenantId: true, isActive: true } },
      },
    });

    if (!user || !user.isActive || user.tenantId !== tenantId) {
      throw new ForbiddenException({ code: 'RECEIPT_HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT' });
    }
    if (Boolean(user.lawyer) === Boolean(user.staffMember)) {
      throw new ForbiddenException({ code: 'RECEIPT_HUMAN_ACTOR_PROFILE_INVALID' });
    }
    if (user.lawyer) {
      if (!user.lawyer.isActive || user.lawyer.tenantId !== tenantId) {
        throw new ForbiddenException({ code: 'RECEIPT_HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT' });
      }
      return Object.freeze({ kind: 'LAWYER', profileId: user.lawyer.id });
    }
    if (!user.staffMember?.isActive || user.staffMember.tenantId !== tenantId) {
      throw new ForbiddenException({ code: 'RECEIPT_HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT' });
    }
    return Object.freeze({ kind: 'STAFF', profileId: user.staffMember.id });
  }

  private async hasCaseMembership(
    profile: HumanReceiptProfile,
    caseId: string,
  ): Promise<boolean> {
    if (profile.kind === 'LAWYER') {
      const assignment = await this.prisma.caseLawyer.findFirst({
        where: { caseId, lawyerId: profile.profileId },
        select: { id: true },
      });
      return Boolean(assignment);
    }

    const assignment = await this.prisma.caseStaff.findFirst({
      where: { caseId, staffMemberId: profile.profileId },
      select: { id: true },
    });
    return Boolean(assignment);
  }

  private assertConfirmationTokenAvailable(): void {
    if (!this.confirmationTokens.isSecretConfigured()) {
      throw new ServiceUnavailableException({
        code: 'RECEIPT_CONFIRMATION_UNAVAILABLE',
      });
    }
  }
}
