import { apiClient } from './client';

/**
 * X1 office workspace'in PRE01 curated read contract'i.
 *
 * Bu katman Prisma entity'lerini response modeli yapmaz. Office read projeksiyonlarını
 * ve mevcut bounded lifecycle komutlarını tüketir; tenant ve actor scope'u JWT üzerinden
 * backend tarafında uygulanır. Approval request kimliği yalnız command binding girdisidir,
 * office response/UI projeksiyonuna eklenmez.
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
  /** PR-1.3 — tüketilmiş onay kararını bildirime uygulama komutu. */
  readonly canReconcileConsumedApproval: boolean;
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

export interface OfficeDisclosurePreparationSource {
  /** Ham disposition kimliği değildir; PRE01 tarafından üretilen tek yönlü referanstır. */
  readonly preparationReference: string;
  /** PR-1.2 — sunucu tarafinda hesaplanan gorunurluk bayragi; nihai yetki backend'de. */
  readonly canCreateFinancialDisclosure: boolean;
  /** Etiket: "Büro dosya no"; canonical kaynak yalnız Case.fileNumber. */
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

/** PR-1.2 — create komutunun client-safe yanıtı; ham disposition/source ID İÇERMEZ. */
export interface OfficeDisclosureCreateResult {
  readonly disclosureId: string;
  readonly disclosureVersionId: string;
  readonly version: number;
  readonly status: string;
  /** true → aynı kaynak için kök ZATEN vardı; ikinci kök oluşturulmadı. */
  readonly replayed: boolean;
}

export interface OfficeDisclosurePreparationSurface {
  readonly surface: 'OFFICE_PREPARATION_SOURCES';
  readonly items: readonly OfficeDisclosurePreparationSource[];
}

export const CLIENT_FINANCIAL_DISCLOSURE_RENDER_CONTRACT_VERSION =
  'ClientFinancialDisclosureRenderV1' as const;

export interface OfficeDisclosurePreviewSurface {
  readonly surface: 'OFFICE_PREVIEW';
  readonly rendered: {
    readonly contractVersion: typeof CLIENT_FINANCIAL_DISCLOSURE_RENDER_CONTRACT_VERSION;
    readonly subject: string;
    readonly text: string;
  };
}

export const OFFICE_DISCLOSURE_TIMELINE_EVENT_TYPES = [
  'VERSION_CREATED',
  'OFFICE_APPROVAL_REQUESTED',
  'OFFICE_APPROVED',
  'CONTENT_APPROVED',
  'SEND_REQUESTED',
  'PROVIDER_ACCEPTED',
  'SEND_FAILED',
  'PUBLISHED',
  'REVERSED',
  'SUPERSEDED',
  'CANCELLED',
] as const;

export type OfficeDisclosureTimelineEventType =
  (typeof OFFICE_DISCLOSURE_TIMELINE_EVENT_TYPES)[number];

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

export interface DisclosureApprovalTransitionResult {
  readonly disclosureVersionId: string;
  readonly previousStatus: OfficeDisclosureStatus;
  readonly status: OfficeDisclosureStatus;
  readonly replayed: boolean;
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

  /** Office workspace -> GET yalnız server-side POSTED ve single-client kaynaklar. */
  async listPreparationSources(clientId: string): Promise<OfficeDisclosurePreparationSurface> {
    const response = await apiClient.get<OfficeDisclosurePreparationSurface>(
      `/client-financial-disclosures/office/clients/${encodeURIComponent(clientId)}/preparation-sources`,
    );
    return response.data;
  },

  /**
   * PR-1.2 — Office workspace: seçili hazırlama kaynağından İLK finansal bildirim kökünü kurar.
   *
   * Ham disposition ID GÖNDERİLMEZ ve GÖRÜLMEZ; yalnız tek yönlü `preparationReference`
   * taşınır. GÖVDE YOKTUR: `caseId`/`caseClientId`/idempotency anahtarı sunucuda
   * dispozisyondan türetilir. Aynı kaynak için tekrar çağrı ikinci kök ÜRETMEZ
   * (`replayed: true` döner) — idempotency backend sözleşmesindedir.
   */
  async createFromPreparationSource(
    clientId: string,
    preparationReference: string,
  ): Promise<OfficeDisclosureCreateResult> {
    const response = await apiClient.post<{ data: OfficeDisclosureCreateResult }>(
      `/client-financial-disclosures/office/clients/${encodeURIComponent(
        clientId,
      )}/preparation-sources/${encodeURIComponent(preparationReference)}/financial-disclosure`,
    );
    const created = (response.data as { data?: OfficeDisclosureCreateResult })?.data;
    if (!created || typeof created.disclosureVersionId !== 'string') {
      // Yanıt doğrulanmadan BAŞARI SAYILMAZ (sessiz yalancı başarı engeli).
      throw new Error('DISCLOSURE_CREATE_RESPONSE_INVALID');
    }
    return created;
  },

  /**
   * PR-1.3 — tüketilmiş onay kararını bildirime uygular (AÇIK KOMUT; GET'te asla).
   * Kayıtlı approver/decidedAt korunur; talep yeniden mutate edilmez.
   */
  async reconcileConsumedOfficeApproval(versionId: string): Promise<unknown> {
    const response = await apiClient.post(
      `/client-financial-disclosures/${encodeURIComponent(versionId)}/reconcile-consumed-office-approval`,
    );
    return response.data;
  },

  /** Office workspace -> GET the frozen X2 renderer output for one scoped version. */
  async getPreview(clientId: string, versionId: string): Promise<OfficeDisclosurePreviewSurface> {
    const response = await apiClient.get<OfficeDisclosurePreviewSurface>(
      `/client-financial-disclosures/office/clients/${encodeURIComponent(clientId)}/versions/${encodeURIComponent(versionId)}/preview`,
    );
    if (
      response.data.surface !== 'OFFICE_PREVIEW' ||
      response.data.rendered.contractVersion !==
        CLIENT_FINANCIAL_DISCLOSURE_RENDER_CONTRACT_VERSION
    ) {
      throw new Error('Unsupported financial disclosure renderer contract');
    }
    return response.data;
  },

  /** Office workspace -> GET curated audit events; internal actor/event IDs are not projected. */
  async getTimeline(
    clientId: string,
    versionId: string,
  ): Promise<OfficeDisclosureTimelineSurface> {
    const response = await apiClient.get<OfficeDisclosureTimelineSurface>(
      `/client-financial-disclosures/office/clients/${encodeURIComponent(clientId)}/versions/${encodeURIComponent(versionId)}/timeline`,
    );
    if (response.data.surface !== 'OFFICE_TIMELINE') {
      throw new Error('Unsupported financial disclosure timeline contract');
    }
    return response.data;
  },

  /** DRAFT -> OFFICE_APPROVAL_PENDING; eligibility ve lifecycle backend otoritesindedir. */
  async requestOfficeApproval(versionId: string): Promise<DisclosureApprovalTransitionResult> {
    const response = await apiClient.post<DisclosureApprovalTransitionResult>(
      `/client-financial-disclosures/${encodeURIComponent(versionId)}/request-office-approval`,
      {},
    );
    return response.data;
  },

  /** Pending OfficeApprovalRequest bağını tüketerek OFFICE_APPROVED geçişini ister. */
  async completeOfficeApproval(
    versionId: string,
    approvalRequestId: string,
  ): Promise<DisclosureApprovalTransitionResult> {
    const response = await apiClient.post<DisclosureApprovalTransitionResult>(
      `/client-financial-disclosures/${encodeURIComponent(versionId)}/complete-office-approval`,
      { approvalRequestId },
    );
    return response.data;
  },

  /** Renderer içeriği ile alıcıyı mevcut canonical hash zincirine mühürler. */
  async requestContentApproval(
    versionId: string,
    approvedRecipientEmail: string,
  ): Promise<DisclosureApprovalTransitionResult> {
    const response = await apiClient.post<DisclosureApprovalTransitionResult>(
      `/client-financial-disclosures/${encodeURIComponent(versionId)}/request-content-approval`,
      { approvedRecipientEmail },
    );
    return response.data;
  },

  /** CONTENT_APPROVAL_PENDING -> CONTENT_APPROVED; four-eyes backend'de yeniden doğrulanır. */
  async completeContentApproval(versionId: string): Promise<DisclosureApprovalTransitionResult> {
    const response = await apiClient.post<DisclosureApprovalTransitionResult>(
      `/client-financial-disclosures/${encodeURIComponent(versionId)}/complete-content-approval`,
      {},
    );
    return response.data;
  },

  /** Mühürlü içeriği mevcut publication pipeline'ına teslim eder. */
  async publish(versionId: string): Promise<unknown> {
    const response = await apiClient.post<unknown>(
      `/client-financial-disclosures/${encodeURIComponent(versionId)}/publish`,
      {},
    );
    return response.data;
  },

  /** SEND_FAILED -> canonical idempotency-bound retry; eligibility remains backend-authoritative. */
  async retryPublication(versionId: string): Promise<unknown> {
    const response = await apiClient.post<unknown>(
      `/client-financial-disclosures/${encodeURIComponent(versionId)}/retry-publication`,
      {},
    );
    return response.data;
  },
};
