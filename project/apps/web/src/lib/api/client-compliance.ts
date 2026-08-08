import { apiClient } from './client';

/**
 * CAD C2 — KVKK/C3 uyum yüzeyleri API katmanı (B02: consent + aydınlatma teslim).
 *
 * SÖZLEŞME KAYNAĞI: C2-B01-SURFACE-CONTRACT-INVENTORY-R01.md — backend sözleşmesi
 * YENİDEN YAZILMAZ; bu katman mevcut route'ları olduğu gibi tüketir:
 *   GET/POST /clients/:id/consents · POST /clients/:id/consents/revoke
 *   GET /clients/disclosure-texts · GET/POST /clients/:id/disclosure-deliveries
 *
 * FAIL-CLOSED: backend'in gerekçeli reddi ({message, reasonCode?}) OLDUĞU GİBİ
 * yukarı taşınır — UI kendi hukuki metnini ÜRETMEZ (POL: sessiz boş ekran YASAK).
 * Tenant izolasyonu: tüm çağrılar oturum tenant'ı üzerinden (apiClient auth header);
 * bu katman cross-tenant parametre TAŞIMAZ.
 * Not: controller'lar çıplak payload döner; apiClient `{ data }` sarar → payload
 * `response.data`'dadır (accounting'teki çift-zarftan FARKLI — orada controller da sarar).
 */

export interface ClientConsentRecord {
  id: string;
  activity: string;
  status?: string | null;
  grantedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  note?: string | null;
  source?: string | null;
}

export interface ClientDisclosureText {
  id: string;
  version: number;
  title?: string | null;
  createdAt?: string;
}

export interface ClientDisclosureDelivery {
  id: string;
  disclosureTextId: string;
  method: string;
  deliveredAt: string;
  createdAt?: string;
}

/** Backend hata gövdesini gerekçesiyle yakalar — fail-closed gösterim için. */
export interface ComplianceApiError {
  status?: number;
  message: string;
  reasonCode?: string;
}

export function toComplianceError(err: unknown): ComplianceApiError {
  const anyErr = err as { response?: { status?: number; data?: { message?: string | string[]; reasonCode?: string } }; message?: string };
  const data = anyErr?.response?.data;
  const msg = Array.isArray(data?.message) ? data?.message.join(' · ') : data?.message;
  return {
    status: anyErr?.response?.status,
    message: msg || anyErr?.message || 'İşlem reddedildi (gerekçe alınamadı — fail-closed).',
    reasonCode: data?.reasonCode,
  };
}

export const clientComplianceApi = {
  async listConsents(clientId: string): Promise<ClientConsentRecord[]> {
    const res = await apiClient.get(`/clients/${clientId}/consents`);
    return res.data ?? [];
  },
  async grantConsent(clientId: string, body: { activity: string; note?: string }): Promise<unknown> {
    const res = await apiClient.post(`/clients/${clientId}/consents`, body);
    return res.data;
  },
  async revokeConsent(clientId: string, body: { activity: string; note?: string }): Promise<unknown> {
    const res = await apiClient.post(`/clients/${clientId}/consents/revoke`, body);
    return res.data;
  },
  async listDisclosureTexts(): Promise<ClientDisclosureText[]> {
    const res = await apiClient.get('/clients/disclosure-texts');
    return res.data ?? [];
  },
  async listDeliveries(clientId: string): Promise<ClientDisclosureDelivery[]> {
    const res = await apiClient.get(`/clients/${clientId}/disclosure-deliveries`);
    return res.data ?? [];
  },
  async recordDelivery(
    clientId: string,
    body: { disclosureTextId: string; method: string; deliveredAt: string },
  ): Promise<unknown> {
    const res = await apiClient.post(`/clients/${clientId}/disclosure-deliveries`, body);
    return res.data;
  },
};

// ---- CAD C2-B03 — DSAR + Legal Hold (mevcut backend sözleşmesi; B01 envanteri) ----

export interface ClientDsarRecord {
  id: string;
  clientId: string;
  type: string;
  channel: string;
  status: string; // backend durum makinesi: RECEIVED → IN_REVIEW → RESPONDED
  receivedAt: string;
  assignedToUserId?: string | null;
  respondedAt?: string | null;
  summary?: string | null;
}

export interface ClientLegalHoldRecord {
  id: string;
  clientId: string;
  scopeType: string;
  reason: string;
  status: string; // ACTIVE | RELEASE_REQUESTED | RELEASED
  caseId?: string | null;
  recordFamily?: string | null;
  createdAt?: string;
}

export interface DeletionEvaluationResult {
  allowed?: boolean;
  unmetConditions?: string[];
  [k: string]: unknown;
}

export const clientComplianceDsarApi = {
  async listRequests(clientId: string): Promise<ClientDsarRecord[]> {
    const res = await apiClient.get(`/clients/data-subject-requests?clientId=${encodeURIComponent(clientId)}`);
    return res.data ?? [];
  },
  async createRequest(
    clientId: string,
    body: { type: string; channel: string; receivedAt: string; summary?: string },
  ): Promise<unknown> {
    const res = await apiClient.post(`/clients/${clientId}/data-subject-requests`, body);
    return res.data;
  },
  async startReview(requestId: string): Promise<unknown> {
    const res = await apiClient.post(`/clients/data-subject-requests/${requestId}/start-review`, {});
    return res.data;
  },
  async assign(requestId: string, assignedToUserId: string): Promise<unknown> {
    const res = await apiClient.post(`/clients/data-subject-requests/${requestId}/assign`, { assignedToUserId });
    return res.data;
  },
  async respond(requestId: string, responseNote: string): Promise<unknown> {
    const res = await apiClient.post(`/clients/data-subject-requests/${requestId}/respond`, { responseNote });
    return res.data;
  },
};

export const clientComplianceLegalHoldApi = {
  async listHolds(clientId: string): Promise<ClientLegalHoldRecord[]> {
    const res = await apiClient.get(`/clients/legal-holds?clientId=${encodeURIComponent(clientId)}`);
    return res.data ?? [];
  },
  async placeHold(clientId: string, body: { scopeType: string; reason: string }): Promise<unknown> {
    const res = await apiClient.post(`/clients/${clientId}/legal-holds`, body);
    return res.data;
  },
  async requestRelease(holdId: string, releaseReason: string): Promise<unknown> {
    const res = await apiClient.post(`/clients/legal-holds/${holdId}/request-release`, { releaseReason });
    return res.data;
  },
  async approveRelease(holdId: string): Promise<unknown> {
    const res = await apiClient.post(`/clients/legal-holds/${holdId}/approve-release`, {});
    return res.data;
  },
  async evaluateDeletion(clientId: string): Promise<DeletionEvaluationResult> {
    const res = await apiClient.post(`/clients/${clientId}/deletion-evaluation`, {});
    return res.data ?? {};
  },
};
