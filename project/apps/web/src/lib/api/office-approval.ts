/**
 * Office Approval API Client — salt-okuma (P4-4 inbox/detail).
 *
 * Backend: office-approval.controller.ts (GET /office-approvals/inbox, GET /office-approvals/:id).
 * onay/red/write action'ları bu istemcide YOK (kapsam dışı — bu tur salt-okuma).
 */
import { apiClient } from "./client";

export type OfficeApprovalStatusValue =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "APPROVED_WITH_CHANGES"
  | "REVISION_REQUESTED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

/** LIST (inbox) özet — backend toSummaryDto ile birebir (ham savedIntent İÇERMEZ). */
export interface OfficeApprovalSummary {
  id: string;
  actionCode: string;
  targetType: string;
  targetRef: string;
  status: OfficeApprovalStatusValue;
  executionStatus: string;
  requesterUserId: string;
  approverUserId: string | null;
  hasReplacement: boolean;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
}

/** DETAIL — backend toDetailDtoForViewer ile birebir. savedIntent bazı durumlarda sunucu tarafında maskelenmiş olabilir. */
export interface OfficeApprovalDetail extends OfficeApprovalSummary {
  savedIntent: unknown;
  payloadHash: string;
  replacementSavedIntent: unknown | null;
  replacementPayloadHash: string | null;
  decisionNote: string | null;
  executedAt: string | null;
  financeVisibility?: {
    applied: boolean;
    level: "LEGACY_FULL" | "CONTROLLED_FULL" | "MASKED";
    contractVersion: string | null;
    maskedFields: string[];
  };
}

interface OfficeApprovalListResponse {
  success: boolean;
  data: OfficeApprovalSummary[];
}

interface OfficeApprovalDetailResponse {
  success: boolean;
  data: OfficeApprovalDetail;
}

export const officeApprovalApi = {
  /**
   * GET /office-approvals/inbox — approver'ın eyleme geçebileceği bekleyenler (kendi talepleri hariç).
   * Yetkisiz kullanıcı için backend boş liste döner (403 değil) — bu istemci de aynen geçirir.
   */
  getInbox: async (status?: OfficeApprovalStatusValue | ""): Promise<OfficeApprovalSummary[]> => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const { data } = await apiClient.get<OfficeApprovalListResponse>(`/office-approvals/inbox${qs}`);
    return data.data;
  },

  /** GET /office-approvals/:id — tenant-scoped + görünürlük (requester ∨ eligible-approver); aksi 404. */
  getDetail: async (id: string): Promise<OfficeApprovalDetail> => {
    const { data } = await apiClient.get<OfficeApprovalDetailResponse>(`/office-approvals/${encodeURIComponent(id)}`);
    return data.data;
  },
};
