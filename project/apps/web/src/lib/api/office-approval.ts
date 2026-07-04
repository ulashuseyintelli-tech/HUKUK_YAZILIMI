/**
 * Office Approval API Client — inbox/detail okuma + karar aksiyonları (P4 Decision UI).
 *
 * Backend: office-approval.controller.ts
 *  - GET  /office-approvals/inbox · GET /office-approvals/:id
 *  - POST /office-approvals/:id/{approve,reject,request-revision,approve-with-changes,cancel}
 * Karar uçları DECISION-ONLY: yalnız status geçişi yapar, execution TETİKLEMEZ (deferred, P4-5).
 * Yetki backend'de (self-approval yasağı, approver-eligibility, requester-only cancel) — FE taklit etmez.
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

  /**
   * GET /office-approvals/mine — çağıranın KENDİ oluşturduğu talepler (tüm statüler, requester=self).
   * PAYOUT-APPROVAL-2 PR-2b: payout talebi sahibinin "onay bekliyor/onaylandı, kesinleştir" akışı
   * bunu kullanır — inbox() bunun tersini yapar (kendi talebini HARİÇ tutar), mine() tam tersi.
   */
  getMine: async (status?: OfficeApprovalStatusValue | ""): Promise<OfficeApprovalSummary[]> => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const { data } = await apiClient.get<OfficeApprovalListResponse>(`/office-approvals/mine${qs}`);
    return data.data;
  },

  /** GET /office-approvals/:id — tenant-scoped + görünürlük (requester ∨ eligible-approver); aksi 404. */
  getDetail: async (id: string): Promise<OfficeApprovalDetail> => {
    const { data } = await apiClient.get<OfficeApprovalDetailResponse>(`/office-approvals/${encodeURIComponent(id)}`);
    return data.data;
  },

  /** POST /office-approvals/:id/approve — status→APPROVED; not opsiyonel. Execution tetiklemez. */
  approve: async (id: string, note?: string): Promise<OfficeApprovalDetail> => {
    const { data } = await apiClient.post<OfficeApprovalDetailResponse>(
      `/office-approvals/${encodeURIComponent(id)}/approve`,
      note && note.trim() ? { note: note.trim() } : {},
    );
    return data.data;
  },

  /** POST /office-approvals/:id/reject — gerekçe (note) ZORUNLU (backend @MinLength). */
  reject: async (id: string, note: string): Promise<OfficeApprovalDetail> => {
    const { data } = await apiClient.post<OfficeApprovalDetailResponse>(
      `/office-approvals/${encodeURIComponent(id)}/reject`,
      { note },
    );
    return data.data;
  },

  /** POST /office-approvals/:id/request-revision — revizyon notu ZORUNLU; REVISION_REQUESTED ≠ REJECTED. */
  requestRevision: async (id: string, note: string): Promise<OfficeApprovalDetail> => {
    const { data } = await apiClient.post<OfficeApprovalDetailResponse>(
      `/office-approvals/${encodeURIComponent(id)}/request-revision`,
      { note },
    );
    return data.data;
  },

  /**
   * POST /office-approvals/:id/approve-with-changes — replacementSavedIntent ZORUNLU (opaque obje);
   * orijinal savedIntent backend'de ASLA ezilmez, değişiklik ayrı iz bırakır.
   */
  approveWithChanges: async (
    id: string,
    replacementSavedIntent: Record<string, unknown>,
    note?: string,
  ): Promise<OfficeApprovalDetail> => {
    const { data } = await apiClient.post<OfficeApprovalDetailResponse>(
      `/office-approvals/${encodeURIComponent(id)}/approve-with-changes`,
      note && note.trim() ? { replacementSavedIntent, note: note.trim() } : { replacementSavedIntent },
    );
    return data.data;
  },

  /** POST /office-approvals/:id/cancel — YALNIZ talep sahibi (backend enforce); PENDING dışında 409. */
  cancel: async (id: string): Promise<OfficeApprovalDetail> => {
    const { data } = await apiClient.post<OfficeApprovalDetailResponse>(
      `/office-approvals/${encodeURIComponent(id)}/cancel`,
      {},
    );
    return data.data;
  },
};
