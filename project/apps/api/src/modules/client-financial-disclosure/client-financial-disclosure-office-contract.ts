import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClientFinancialDisclosureStatus } from '@prisma/client';

/**
 * CODEX-X1-FD-OFFICE-CONTRACT-PRE01-R01 — curated office read contract.
 *
 * Bu yüzey, office UI'ın yaşam döngüsünü tahmin etmesini engeller. Statü ve aksiyon
 * yeterliliği server-side canonical kaynaklardan gelir; UI yalnız bu projeksiyonu sunar.
 */
export const OFFICE_DISCLOSURE_STATUSES = [
  ClientFinancialDisclosureStatus.DRAFT,
  ClientFinancialDisclosureStatus.OFFICE_APPROVAL_PENDING,
  ClientFinancialDisclosureStatus.OFFICE_APPROVED,
  ClientFinancialDisclosureStatus.CONTENT_APPROVAL_PENDING,
  ClientFinancialDisclosureStatus.CONTENT_APPROVED,
  ClientFinancialDisclosureStatus.SEND_PENDING,
  ClientFinancialDisclosureStatus.SEND_FAILED,
  ClientFinancialDisclosureStatus.PUBLISHED,
  ClientFinancialDisclosureStatus.CANCELLED,
  ClientFinancialDisclosureStatus.SUPERSEDED,
  ClientFinancialDisclosureStatus.REVERSED,
] as const;

export type OfficeDisclosureStatus = (typeof OFFICE_DISCLOSURE_STATUSES)[number];

/** Ayrı bir kalıcı SENT durumu yoktur; provider kabulü yalnız türetilmiş kanıttır. */
export type OfficeDisclosureDeliveryState =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'FAILED_RETRY_AVAILABLE'
  | 'PROVIDER_ACCEPTED'
  | 'PUBLISHED';

export interface OfficeDisclosureActionCapabilities {
  readonly canRequestOfficeApproval: boolean;
  readonly canCompleteOfficeApproval: boolean;
  readonly canRequestContentApproval: boolean;
  readonly canCompleteContentApproval: boolean;
  readonly canPublish: boolean;
  readonly canRetryPublication: boolean;
  readonly canReverse: boolean;
  readonly canSupersede: boolean;
}

export interface OfficeDisclosureSummary {
  readonly disclosureId: string;
  readonly versionId: string;
  readonly version: number;
  readonly status: OfficeDisclosureStatus;
  readonly clientName: string;
  /** Client-visible dosya referansı; etiketi "Büro dosya no" ve kaynağı yalnız Case.fileNumber. */
  readonly officeFileNumber: string;
  readonly currency: string;
  readonly totalCollected: string;
  readonly clientNetAmount: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
  readonly isCurrentEffective: boolean;
  readonly actions: OfficeDisclosureActionCapabilities;
}

export interface OfficeDisclosureListSurface {
  readonly surface: 'OFFICE_LIST';
  readonly items: readonly OfficeDisclosureSummary[];
}

export interface OfficeDisclosureLine {
  readonly type: string;
  readonly amount: string;
}

export interface OfficeDisclosureApprovalState {
  readonly officeRequestedAt: string | null;
  readonly officeApprovedAt: string | null;
  readonly contentApprovedAt: string | null;
}

export interface OfficeDisclosureDeliveryEvidence {
  readonly state: OfficeDisclosureDeliveryState;
  readonly sendRequestedAt: string | null;
  readonly providerAcceptedAt: string | null;
  readonly publishedAt: string | null;
}

export interface OfficeDisclosureDetail extends OfficeDisclosureSummary {
  readonly lines: readonly OfficeDisclosureLine[];
  readonly approval: OfficeDisclosureApprovalState;
  readonly delivery: OfficeDisclosureDeliveryEvidence;
  readonly supersedesVersionId: string | null;
  readonly supersededByVersionId: string | null;
  readonly correctionReason: string | null;
  readonly reversedAt: string | null;
  readonly cancelledAt: string | null;
}

export interface OfficeDisclosureHistorySurface {
  readonly surface: 'OFFICE_HISTORY';
  readonly disclosureId: string;
  readonly currentEffectiveVersionId: string | null;
  readonly items: readonly OfficeDisclosureSummary[];
}

export type OfficeDisclosureTimelineEventType =
  | 'VERSION_CREATED'
  | 'OFFICE_APPROVAL_REQUESTED'
  | 'OFFICE_APPROVED'
  | 'CONTENT_APPROVED'
  | 'SEND_REQUESTED'
  | 'PROVIDER_ACCEPTED'
  | 'SEND_FAILED'
  | 'PUBLISHED'
  | 'REVERSED'
  | 'SUPERSEDED'
  | 'CANCELLED';

export interface OfficeDisclosureTimelineEvent {
  readonly type: OfficeDisclosureTimelineEventType;
  readonly occurredAt: string;
  readonly actor: 'OFFICE_USER' | 'SYSTEM';
}

export interface OfficeDisclosureTimelineSurface {
  readonly surface: 'OFFICE_TIMELINE';
  readonly versionId: string;
  readonly events: readonly OfficeDisclosureTimelineEvent[];
}

export interface OfficeDisclosurePreparationSource {
  /** Ham collection/disposition kimliği değildir; salt-okunur, tek yönlü bir referanstır. */
  readonly preparationReference: string;
  /** Client-visible dosya referansı; executionFileNumber/internal ID fallback'i yoktur. */
  readonly officeFileNumber: string;
  readonly postedAt: string;
  readonly currency: string;
  readonly totalAmount: string;
  readonly existingDisclosure: {
    readonly disclosureId: string;
    readonly currentVersionId: string | null;
    readonly status: OfficeDisclosureStatus | null;
  } | null;
}

export interface OfficeDisclosurePreparationSurface {
  readonly surface: 'OFFICE_PREPARATION_SOURCES';
  readonly items: readonly OfficeDisclosurePreparationSource[];
}

export interface OfficeDisclosureReadScope {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly clientId: string;
  readonly caseId?: string;
}

export const OFFICE_DISCLOSURE_FORBIDDEN_FIELDS = [
  'tenantId',
  'clientId',
  'caseId',
  'caseClientId',
  'collectionDispositionId',
  'sourceCollectionId',
  'sourceDispositionLineId',
  'officeApprovedById',
  'contentApprovedById',
  'officeApprovalRequestId',
  'requesterUserId',
  'approverUserId',
  'notificationContent',
  'notificationContentHash',
  'approvedRecipientEmail',
  'approvedRecipientPortalUserId',
  'providerMessageId',
  'sendFailureCode',
  'sendFailureDetail',
  'sendIdempotencyKey',
  'snapshotHash',
  'sourceFingerprint',
  'metadata',
  'oldValues',
  'newValues',
] as const;

const FORBIDDEN_KEYS = new Set<string>(
  OFFICE_DISCLOSURE_FORBIDDEN_FIELDS.map((field) => field.toLowerCase()),
);

/** Test ve runtime tarafında geniş entity spread/regresyonunu fail-closed yakalar. */
export function assertOfficeDisclosureProjectionSafe(value: unknown): void {
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (candidate === null || typeof candidate !== 'object') return;
    for (const [key, nested] of Object.entries(candidate)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new OfficeDisclosureProjectionForbiddenError();
      }
      visit(nested);
    }
  };
  visit(value);
}

export class OfficeDisclosureProjectionForbiddenError extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      error: 'Client Financial Disclosure Office Access Denied',
      code: 'DISCLOSURE_OFFICE_ACCESS_DENIED',
      message: 'The requested financial disclosure office surface is not available.',
    });
    this.name = 'OfficeDisclosureProjectionForbiddenError';
  }
}

/** Var olmayan ve object-scope dışı kayıtlar aynı cevapla döner; varlık bilgisi sızmaz. */
export class OfficeDisclosureProjectionNotFoundError extends NotFoundException {
  constructor() {
    super({
      statusCode: 404,
      error: 'Client Financial Disclosure Office Surface Not Found',
      code: 'DISCLOSURE_OFFICE_NOT_FOUND',
      message: 'The requested financial disclosure office surface is not available.',
    });
    this.name = 'OfficeDisclosureProjectionNotFoundError';
  }
}
