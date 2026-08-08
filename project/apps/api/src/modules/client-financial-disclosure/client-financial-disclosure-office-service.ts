import { createHash } from 'node:crypto';
import {
  ClientFinancialDisclosureStatus,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import { canonicalMoney } from './client-financial-disclosure-canonical';
import {
  isDisclosurePublicationEnabled,
  isDisclosureWriteEnabled,
} from './client-financial-disclosure-activation';
import {
  DISCLOSURE_APPROVER_CANDIDATE_SELECT,
  isDisclosureApproverEligible,
} from './client-financial-disclosure-approval-eligibility';
import { CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE } from './client-financial-disclosure-approval.contract';
import {
  CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS,
  CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ENTITY,
} from './client-financial-disclosure-publication.contract';
import {
  OFFICE_DISCLOSURE_STATUSES,
  OfficeDisclosureProjectionForbiddenError,
  OfficeDisclosureProjectionNotFoundError,
  assertOfficeDisclosureProjectionSafe,
  type OfficeDisclosureActionCapabilities,
  type OfficeDisclosureDeliveryEvidence,
  type OfficeDisclosureDetail,
  type OfficeDisclosureHistorySurface,
  type OfficeDisclosureListSurface,
  type OfficeDisclosurePreparationSurface,
  type OfficeDisclosureReadScope,
  type OfficeDisclosureStatus,
  type OfficeDisclosureSummary,
  type OfficeDisclosureTimelineEvent,
  type OfficeDisclosureTimelineEventType,
  type OfficeDisclosureTimelineSurface,
} from './client-financial-disclosure-office-contract';

const CLIENT_NAME_SELECT = {
  displayName: true,
  firstName: true,
  lastName: true,
  companyName: true,
  name: true,
} as const;

const OFFICE_SUMMARY_SELECT = {
  id: true,
  disclosureId: true,
  version: true,
  status: true,
  currency: true,
  totalCollected: true,
  clientNetAmount: true,
  officeApprovalRequestId: true,
  officeApprovedAt: true,
  officeApprovedById: true,
  publishedAt: true,
  updatedAt: true,
  disclosure: {
    select: {
      currentVersionId: true,
      case: {
        select: { fileNumber: true },
      },
      caseClient: {
        select: { client: { select: CLIENT_NAME_SELECT } },
      },
    },
  },
} as const;

const OFFICE_VERSION_SELECT = {
  ...OFFICE_SUMMARY_SELECT,
  contentApprovedAt: true,
  sendRequestedAt: true,
  providerMessageId: true,
  providerAcceptedAt: true,
  supersedesVersionId: true,
  reversedAt: true,
  correctionReason: true,
  cancelledAt: true,
  createdAt: true,
  lines: {
    select: { type: true, amount: true, sortOrder: true },
  },
  supersededByVersion: { select: { id: true } },
} as const;

type OfficeSummaryVersion = Prisma.ClientFinancialDisclosureVersionGetPayload<{
  select: typeof OFFICE_SUMMARY_SELECT;
}>;

type ApprovalRequestProjection = {
  readonly id: string;
  readonly targetRef: string;
  readonly requesterUserId: string;
  readonly createdAt: Date;
};

type ResolvedOfficeScope = {
  readonly approverEligible: boolean;
  readonly caseClientIds: readonly string[];
};

/**
 * PRE01 office projection. Tüm sorgular JWT tenant'ından başlar ve disclosure/version
 * selector'larını Client -> CaseClient -> Case zinciriyle yeniden doğrular.
 */
export class ClientFinancialDisclosureOfficeService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.getOfficeList() -> ofis liste yuzeyi
   */
  async getList(scope: OfficeDisclosureReadScope): Promise<OfficeDisclosureListSurface> {
    const resolved = await this.resolveScope(scope);
    const versions = await this.loadVersions(scope, resolved.caseClientIds);
    const requests = await this.loadApprovalRequests(scope.tenantId, versions);
    const seenRoots = new Set<string>();
    const items: OfficeDisclosureSummary[] = [];

    for (const version of versions) {
      if (seenRoots.has(version.disclosureId)) continue;
      seenRoots.add(version.disclosureId);
      items.push(
        this.summary(
          version,
          requests.get(version.officeApprovalRequestId ?? ''),
          resolved,
          scope.actorUserId,
        ),
      );
    }

    return this.safe({ surface: 'OFFICE_LIST', items });
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.getOfficePreparationSources() -> POSTED-only hazirlik listesi
   */
  async getPreparationSources(
    scope: OfficeDisclosureReadScope,
  ): Promise<OfficeDisclosurePreparationSurface> {
    const resolved = await this.resolveScope(scope);
    if (resolved.caseClientIds.length === 0) {
      return { surface: 'OFFICE_PREPARATION_SOURCES', items: [] };
    }

    const sources = await this.prisma.collectionDisposition.findMany({
      where: {
        tenantId: scope.tenantId,
        status: 'POSTED',
        beneficiaryScope: 'SINGLE_CASE_CLIENT',
        caseClientId: { in: [...resolved.caseClientIds] },
        ...(scope.caseId ? { caseId: scope.caseId } : {}),
      },
      select: {
        id: true,
        postedAt: true,
        currency: true,
        totalAmount: true,
        caseId: true,
        clientFinancialDisclosures: {
          select: {
            id: true,
            currentVersionId: true,
            currentVersion: { select: { status: true } },
          },
          take: 1,
        },
      },
      orderBy: [{ postedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const officeFileNumbers = await this.loadOfficeFileNumbers(
      scope.tenantId,
      sources.map((source) => source.caseId),
    );
    const items = sources.map((source) => {
      if (source.postedAt === null) throw new OfficeDisclosureProjectionForbiddenError();
      const officeFileNumber = officeFileNumbers.get(source.caseId);
      if (!officeFileNumber) throw new OfficeDisclosureProjectionForbiddenError();
      const existing = source.clientFinancialDisclosures[0] ?? null;
      return {
        preparationReference: this.preparationReference(scope.tenantId, source.id),
        officeFileNumber,
        postedAt: this.isoRequired(source.postedAt),
        currency: source.currency,
        totalAmount: canonicalMoney(source.totalAmount),
        existingDisclosure: existing
          ? {
              disclosureId: existing.id,
              currentVersionId: existing.currentVersionId,
              status: existing.currentVersion
                ? this.status(existing.currentVersion.status)
                : null,
            }
          : null,
      };
    });

    return this.safe({ surface: 'OFFICE_PREPARATION_SOURCES', items });
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.getOfficeDetail() -> curated versiyon detayi
   */
  async getDetail(
    scope: OfficeDisclosureReadScope,
    disclosureVersionId: string,
  ): Promise<OfficeDisclosureDetail> {
    const resolved = await this.resolveScope(scope);
    const version = await this.loadVersion(scope, resolved.caseClientIds, disclosureVersionId);
    const request = await this.loadApprovalRequest(
      scope.tenantId,
      version.officeApprovalRequestId,
      version.id,
    );
    const detail: OfficeDisclosureDetail = {
      ...this.summary(version, request, resolved, scope.actorUserId),
      lines: [...version.lines]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((line) => ({ type: line.type, amount: canonicalMoney(line.amount) })),
      approval: {
        officeRequestedAt: this.iso(request?.createdAt ?? null),
        officeApprovedAt: this.iso(version.officeApprovedAt),
        contentApprovedAt: this.iso(version.contentApprovedAt),
      },
      delivery: this.delivery(version),
      supersedesVersionId: version.supersedesVersionId,
      supersededByVersionId: version.supersededByVersion?.id ?? null,
      correctionReason: version.correctionReason,
      reversedAt: this.iso(version.reversedAt),
      cancelledAt: this.iso(version.cancelledAt),
    };
    return this.safe(detail);
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.getOfficeHistory() -> ayri versiyon gecmisi
   */
  async getHistory(
    scope: OfficeDisclosureReadScope,
    disclosureId: string,
  ): Promise<OfficeDisclosureHistorySurface> {
    const resolved = await this.resolveScope(scope);
    const versions = await this.loadVersions(scope, resolved.caseClientIds, disclosureId);
    if (versions.length === 0) throw new OfficeDisclosureProjectionNotFoundError();
    const requests = await this.loadApprovalRequests(scope.tenantId, versions);
    const current = versions.find((version) => this.isCurrentEffective(version));
    return this.safe({
      surface: 'OFFICE_HISTORY',
      disclosureId,
      currentEffectiveVersionId: current?.id ?? null,
      items: versions.map((version) =>
        this.summary(
          version,
          requests.get(version.officeApprovalRequestId ?? ''),
          resolved,
          scope.actorUserId,
        ),
      ),
    });
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.getOfficeTimeline() -> curated audit zaman cizgisi
   */
  async getTimeline(
    scope: OfficeDisclosureReadScope,
    disclosureVersionId: string,
  ): Promise<OfficeDisclosureTimelineSurface> {
    const resolved = await this.resolveScope(scope);
    const version = await this.loadVersion(scope, resolved.caseClientIds, disclosureVersionId);
    const request = await this.loadApprovalRequest(
      scope.tenantId,
      version.officeApprovalRequestId,
      version.id,
    );
    const audits = await this.prisma.auditLog.findMany({
      where: {
        tenantId: scope.tenantId,
        entityType: CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ENTITY,
        entityId: version.id,
        action: { in: Object.values(CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS) },
      },
      select: { action: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const events: OfficeDisclosureTimelineEvent[] = [
      { type: 'VERSION_CREATED', occurredAt: this.isoRequired(version.createdAt), actor: 'SYSTEM' },
    ];
    if (request) {
      events.push({
        type: 'OFFICE_APPROVAL_REQUESTED',
        occurredAt: this.isoRequired(request.createdAt),
        actor: 'OFFICE_USER',
      });
    }
    this.pushTimestamp(events, 'OFFICE_APPROVED', version.officeApprovedAt, 'OFFICE_USER');
    this.pushTimestamp(events, 'CONTENT_APPROVED', version.contentApprovedAt, 'OFFICE_USER');
    this.pushTimestamp(events, 'SEND_REQUESTED', version.sendRequestedAt, 'SYSTEM');
    this.pushTimestamp(events, 'CANCELLED', version.cancelledAt, 'OFFICE_USER');

    for (const audit of audits) {
      const type = this.auditEventType(audit.action);
      if (type) {
        events.push({ type, occurredAt: this.isoRequired(audit.createdAt), actor: 'SYSTEM' });
      }
    }
    events.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    return this.safe({ surface: 'OFFICE_TIMELINE', versionId: version.id, events });
  }

  private async resolveScope(scope: OfficeDisclosureReadScope): Promise<ResolvedOfficeScope> {
    const actor = await this.prisma.user.findFirst({
      where: { id: scope.actorUserId, tenantId: scope.tenantId, isActive: true },
      select: DISCLOSURE_APPROVER_CANDIDATE_SELECT,
    });
    if (!actor) throw new OfficeDisclosureProjectionForbiddenError();

    const client = await this.prisma.client.findFirst({
      where: { id: scope.clientId, tenantId: scope.tenantId },
      select: { id: true },
    });
    if (!client) throw new OfficeDisclosureProjectionNotFoundError();

    const caseClients = await this.prisma.caseClient.findMany({
      where: {
        clientId: client.id,
        case: {
          tenantId: scope.tenantId,
          ...(scope.caseId ? { id: scope.caseId } : {}),
        },
      },
      select: { id: true },
    });
    if (scope.caseId && caseClients.length === 0) {
      throw new OfficeDisclosureProjectionNotFoundError();
    }
    return {
      approverEligible: isDisclosureApproverEligible(actor, scope.tenantId),
      caseClientIds: caseClients.map((entry) => entry.id),
    };
  }

  private async loadVersions(
    scope: OfficeDisclosureReadScope,
    caseClientIds: readonly string[],
    disclosureId?: string,
  ) {
    if (caseClientIds.length === 0) return [];
    return this.prisma.clientFinancialDisclosureVersion.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(disclosureId ? { disclosureId } : {}),
        disclosure: {
          tenantId: scope.tenantId,
          caseClientId: { in: [...caseClientIds] },
          ...(scope.caseId ? { caseId: scope.caseId } : {}),
          case: { tenantId: scope.tenantId },
        },
      },
      select: OFFICE_SUMMARY_SELECT,
      orderBy: [{ disclosureId: 'asc' }, { version: 'desc' }],
    });
  }

  private async loadVersion(
    scope: OfficeDisclosureReadScope,
    caseClientIds: readonly string[],
    disclosureVersionId: string,
  ) {
    if (caseClientIds.length === 0) throw new OfficeDisclosureProjectionNotFoundError();
    const version = await this.prisma.clientFinancialDisclosureVersion.findFirst({
      where: {
        id: disclosureVersionId,
        tenantId: scope.tenantId,
        disclosure: {
          tenantId: scope.tenantId,
          caseClientId: { in: [...caseClientIds] },
          ...(scope.caseId ? { caseId: scope.caseId } : {}),
          case: { tenantId: scope.tenantId },
        },
      },
      select: OFFICE_VERSION_SELECT,
    });
    if (!version) throw new OfficeDisclosureProjectionNotFoundError();
    return version;
  }

  private async loadApprovalRequests(
    tenantId: string,
    versions: ReadonlyArray<{ id: string; officeApprovalRequestId: string | null }>,
  ): Promise<Map<string, ApprovalRequestProjection>> {
    const expectedTargets = new Map(
      versions
        .filter(
          (version): version is { id: string; officeApprovalRequestId: string } =>
            version.officeApprovalRequestId !== null,
        )
        .map((version) => [version.officeApprovalRequestId, version.id]),
    );
    const ids = versions
      .map((version) => version.officeApprovalRequestId)
      .filter((id): id is string => id !== null);
    if (ids.length === 0) return new Map();
    const requests = await this.prisma.officeApprovalRequest.findMany({
      where: {
        tenantId,
        id: { in: ids },
        targetType: CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE,
      },
      select: {
        id: true,
        targetRef: true,
        requesterUserId: true,
        createdAt: true,
      },
    });
    return new Map(
      requests
        .filter((request) => expectedTargets.get(request.id) === request.targetRef)
        .map((request) => [request.id, request]),
    );
  }

  private async loadApprovalRequest(
    tenantId: string,
    approvalRequestId: string | null,
    disclosureVersionId: string,
  ): Promise<ApprovalRequestProjection | undefined> {
    if (!approvalRequestId) return undefined;
    const requests = await this.loadApprovalRequests(tenantId, [
      { id: disclosureVersionId, officeApprovalRequestId: approvalRequestId },
    ]);
    return requests.get(approvalRequestId);
  }

  private async loadOfficeFileNumbers(
    tenantId: string,
    caseIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (caseIds.length === 0) return new Map();
    const cases = await this.prisma.case.findMany({
      where: { tenantId, id: { in: [...new Set(caseIds)] } },
      select: { id: true, fileNumber: true },
    });
    return new Map(cases.map((entry) => [entry.id, entry.fileNumber]));
  }

  private summary(
    version: OfficeSummaryVersion,
    request: ApprovalRequestProjection | undefined,
    resolved: ResolvedOfficeScope,
    actorUserId: string,
  ): OfficeDisclosureSummary {
    const status = this.status(version.status);
    return {
      disclosureId: version.disclosureId,
      versionId: version.id,
      version: version.version,
      status,
      clientName: this.clientName(version.disclosure.caseClient.client),
      officeFileNumber: version.disclosure.case.fileNumber,
      currency: version.currency,
      totalCollected: canonicalMoney(version.totalCollected),
      clientNetAmount: canonicalMoney(version.clientNetAmount),
      updatedAt: this.isoRequired(version.updatedAt),
      publishedAt: this.iso(version.publishedAt),
      isCurrentEffective: this.isCurrentEffective(version),
      actions: this.actions(status, request, version, resolved, actorUserId),
    };
  }

  private actions(
    status: OfficeDisclosureStatus,
    request: ApprovalRequestProjection | undefined,
    version: { officeApprovedById: string | null },
    resolved: ResolvedOfficeScope,
    actorUserId: string,
  ): OfficeDisclosureActionCapabilities {
    const write = isDisclosureWriteEnabled();
    const publish = write && isDisclosurePublicationEnabled();
    const eligible = resolved.approverEligible;
    return {
      canRequestOfficeApproval: write && status === 'DRAFT',
      canCompleteOfficeApproval:
        write &&
        eligible &&
        status === 'OFFICE_APPROVAL_PENDING' &&
        request !== undefined &&
        request.requesterUserId !== actorUserId,
      canRequestContentApproval: write && status === 'OFFICE_APPROVED',
      canCompleteContentApproval:
        write &&
        eligible &&
        status === 'CONTENT_APPROVAL_PENDING' &&
        request !== undefined &&
        request.requesterUserId !== actorUserId &&
        version.officeApprovedById !== actorUserId,
      canPublish: publish && eligible && status === 'CONTENT_APPROVED',
      canRetryPublication: publish && eligible && status === 'SEND_FAILED',
      canReverse: publish && eligible && status === 'PUBLISHED',
      canSupersede: publish && eligible && status === 'PUBLISHED',
    };
  }

  private delivery(version: {
    status: ClientFinancialDisclosureStatus;
    sendRequestedAt: Date | null;
    providerMessageId: string | null;
    providerAcceptedAt: Date | null;
    publishedAt: Date | null;
  }): OfficeDisclosureDeliveryEvidence {
    const accepted = version.providerMessageId !== null && version.providerAcceptedAt !== null;
    const state =
      version.status === ClientFinancialDisclosureStatus.PUBLISHED
        ? 'PUBLISHED'
        : version.status === ClientFinancialDisclosureStatus.SEND_FAILED
          ? 'FAILED_RETRY_AVAILABLE'
          : accepted
            ? 'PROVIDER_ACCEPTED'
            : version.status === ClientFinancialDisclosureStatus.SEND_PENDING
              ? 'PENDING'
              : 'NOT_REQUESTED';
    return {
      state,
      sendRequestedAt: this.iso(version.sendRequestedAt),
      providerAcceptedAt: accepted ? this.iso(version.providerAcceptedAt) : null,
      publishedAt: this.iso(version.publishedAt),
    };
  }

  private status(status: ClientFinancialDisclosureStatus): OfficeDisclosureStatus {
    if (!(OFFICE_DISCLOSURE_STATUSES as readonly string[]).includes(status)) {
      throw new OfficeDisclosureProjectionForbiddenError();
    }
    return status as OfficeDisclosureStatus;
  }

  private isCurrentEffective(version: {
    id: string;
    status: ClientFinancialDisclosureStatus;
    disclosure: { currentVersionId: string | null };
  }): boolean {
    return (
      version.status === ClientFinancialDisclosureStatus.PUBLISHED &&
      version.disclosure.currentVersionId === version.id
    );
  }

  private clientName(client: {
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    name: string | null;
  }): string {
    return (
      client.displayName?.trim() ||
      [client.firstName, client.lastName].filter(Boolean).join(' ').trim() ||
      client.companyName?.trim() ||
      client.name?.trim() ||
      'Unnamed client'
    );
  }

  private preparationReference(tenantId: string, dispositionId: string): string {
    return createHash('sha256')
      .update(`client-financial-disclosure-office-source-v1:${tenantId}:${dispositionId}`)
      .digest('base64url');
  }

  private auditEventType(action: string): OfficeDisclosureTimelineEventType | null {
    const map: Record<string, OfficeDisclosureTimelineEventType> = {
      [CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SENT]: 'PROVIDER_ACCEPTED',
      [CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SEND_FAILED]: 'SEND_FAILED',
      [CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.PUBLISHED]: 'PUBLISHED',
      [CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.REVERSED]: 'REVERSED',
      [CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SUPERSEDED]: 'SUPERSEDED',
    };
    return map[action] ?? null;
  }

  private pushTimestamp(
    events: OfficeDisclosureTimelineEvent[],
    type: OfficeDisclosureTimelineEventType,
    value: Date | null,
    actor: 'OFFICE_USER' | 'SYSTEM',
  ): void {
    if (value) events.push({ type, occurredAt: this.isoRequired(value), actor });
  }

  private iso(value: Date | null): string | null {
    return value?.toISOString() ?? null;
  }

  private isoRequired(value: Date): string {
    return value.toISOString();
  }

  private safe<T>(value: T): T {
    assertOfficeDisclosureProjectionSafe(value);
    return value;
  }
}
