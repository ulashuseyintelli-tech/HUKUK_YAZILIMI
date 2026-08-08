import { apiClient } from './client';

/**
 * X1 office workspace'in PRE01 curated read contract'i.
 *
 * Bu katman Prisma entity'lerini veya command-path kimliklerini modellemez. Yalnız
 * `/client-financial-disclosures/office/**` projeksiyonlarını tüketir; tenant ve actor
 * scope'u JWT üzerinden backend tarafında uygulanır.
 */
export const OFFICE_DISCLOSURE_STATUSES = [
  'DRAFT',
  'OFFICE_APPROVAL_PENDING',
  'OFFICE_APPROVED',
  'CONTENT_APPROVAL_PENDING',
  'CONTENT_APPROVED',
  'SEND_PENDING',
  'SEND_FAILED',
  'PUBLISHED',
  'CANCELLED',
  'SUPERSEDED',
  'REVERSED',
] as const;

export type OfficeDisclosureStatus = (typeof OFFICE_DISCLOSURE_STATUSES)[number];

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
  /** Etiket: "Büro dosya no"; canonical kaynak yalnız Case.fileNumber. */
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

export interface OfficeDisclosureDetail extends OfficeDisclosureSummary {
  readonly lines: readonly OfficeDisclosureLine[];
  readonly approval: {
    readonly officeRequestedAt: string | null;
    readonly officeApprovedAt: string | null;
    readonly contentApprovedAt: string | null;
  };
  readonly delivery: {
    readonly state: 'NOT_REQUESTED' | 'PENDING' | 'FAILED_RETRY_AVAILABLE' | 'PROVIDER_ACCEPTED' | 'PUBLISHED';
    readonly sendRequestedAt: string | null;
    readonly providerAcceptedAt: string | null;
    readonly publishedAt: string | null;
  };
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

export const clientFinancialDisclosureApi = {
  /** Office workspace -> GET curated list for the JWT tenant and client scope. */
  async list(clientId: string): Promise<OfficeDisclosureListSurface> {
    const response = await apiClient.get<OfficeDisclosureListSurface>(
      `/client-financial-disclosures/office/clients/${encodeURIComponent(clientId)}`,
    );
    return response.data;
  },

  /** Office workspace -> GET one curated version detail. */
  async getDetail(clientId: string, versionId: string): Promise<OfficeDisclosureDetail> {
    const response = await apiClient.get<OfficeDisclosureDetail>(
      `/client-financial-disclosures/office/clients/${encodeURIComponent(clientId)}/versions/${encodeURIComponent(versionId)}`,
    );
    return response.data;
  },

  /** Office workspace -> GET curated root history with current-effective marker. */
  async getHistory(clientId: string, disclosureId: string): Promise<OfficeDisclosureHistorySurface> {
    const response = await apiClient.get<OfficeDisclosureHistorySurface>(
      `/client-financial-disclosures/office/clients/${encodeURIComponent(clientId)}/disclosures/${encodeURIComponent(disclosureId)}/history`,
    );
    return response.data;
  },
};
