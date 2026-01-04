/**
 * Tebligat API - Notification/Service endpoints
 */

import { apiClient } from './client';
import type {
  TebligatDTO,
  CreateTebligatDTO,
  UpdateTebligatDTO,
  PttTrackingResult,
  UetsRecipient,
} from './types';

export const tebligatApi = {
  // Tebligat CRUD
  async getTebligatlar(caseId: string) {
    return apiClient.request<TebligatDTO[]>(`/tebligat/case/${caseId}`);
  },

  async getTebligat(id: string) {
    return apiClient.request<TebligatDTO>(`/tebligat/${id}`);
  },

  async createTebligat(data: CreateTebligatDTO) {
    return apiClient.request<TebligatDTO>("/tebligat", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateTebligat(id: string, data: UpdateTebligatDTO) {
    return apiClient.request<TebligatDTO>(`/tebligat/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteTebligat(id: string) {
    return apiClient.request<void>(`/tebligat/${id}`, { method: "DELETE" });
  },

  // Tebligat Actions
  async sendTebligat(id: string) {
    return apiClient.request<TebligatDTO>(`/tebligat/${id}/send`, {
      method: "POST",
    });
  },

  async completeTebligat(id: string, data: { result: string; notes?: string }) {
    return apiClient.request<TebligatDTO>(`/tebligat/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async cancelTebligat(id: string, reason?: string) {
    return apiClient.request<TebligatDTO>(`/tebligat/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  // PTT Tracking
  async trackPttBarcode(barcodeNo: string) {
    return apiClient.request<PttTrackingResult>(`/tebligat/ptt-track/${barcodeNo}`);
  },

  async bulkTrackPtt(caseId: string) {
    return apiClient.request<any>(`/tebligat/case/${caseId}/bulk-track`, {
      method: "POST",
    });
  },

  // UETS/KEP
  async checkUetsRegistration(tcVkn: string) {
    return apiClient.request<UetsRecipient>(`/tebligat/uets-check/${tcVkn}`);
  },

  async sendUetsTebligat(id: string) {
    return apiClient.request<TebligatDTO>(`/tebligat/${id}/send-uets`, {
      method: "POST",
    });
  },

  // Bulk Operations
  async createBulkTebligat(caseId: string, data: { debtorIds: string[]; type: string }) {
    return apiClient.request<TebligatDTO[]>(`/tebligat/case/${caseId}/bulk`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Stats
  async getTebligatStats(caseId: string) {
    return apiClient.request<any>(`/tebligat/case/${caseId}/stats`);
  },
};
