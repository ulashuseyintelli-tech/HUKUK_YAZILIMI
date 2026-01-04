/**
 * UYAP API - UYAP integration endpoints
 */

import { apiClient } from './client';

export const uyapApi = {
  // UYAP Status
  async getUyapStatus() {
    return apiClient.request<any>("/uyap/status");
  },

  // UYAP Queries
  async queryMernis(tckn: string) {
    return apiClient.request<any>("/uyap/query/mernis", {
      method: "POST",
      body: JSON.stringify({ tckn }),
    });
  },

  async querySgk(tckn: string) {
    return apiClient.request<any>("/uyap/query/sgk", {
      method: "POST",
      body: JSON.stringify({ tckn }),
    });
  },

  async queryTapu(tckn: string) {
    return apiClient.request<any>("/uyap/query/tapu", {
      method: "POST",
      body: JSON.stringify({ tckn }),
    });
  },

  async queryArac(tckn: string) {
    return apiClient.request<any>("/uyap/query/arac", {
      method: "POST",
      body: JSON.stringify({ tckn }),
    });
  },

  // UYAP Case Operations
  async sendPaymentOrder(caseId: string) {
    return apiClient.request<any>(`/uyap/case/${caseId}/payment-order`, {
      method: "POST",
    });
  },

  async pushHacizRequest(caseId: string, data: any) {
    return apiClient.request<any>(`/uyap/case/${caseId}/haciz-request`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async submitDocument(caseId: string, documentId: string) {
    return apiClient.request<any>(`/uyap/case/${caseId}/submit-document`, {
      method: "POST",
      body: JSON.stringify({ documentId }),
    });
  },

  // UYAP Export
  async exportCase(caseId: string, options?: { includeDocuments?: boolean }) {
    return apiClient.request<any>(`/uyap-export/case/${caseId}`, {
      method: "POST",
      body: JSON.stringify(options || {}),
    });
  },

  async exportBatch(caseIds: string[], options?: { batchName?: string; includeDocuments?: boolean }) {
    return apiClient.request<any>("/uyap-export/batch", {
      method: "POST",
      body: JSON.stringify({ caseIds, ...options }),
    });
  },

  async validateForExport(caseId: string) {
    return apiClient.request<any>(`/uyap-export/validate/${caseId}`);
  },

  async getExportableCases() {
    return apiClient.request<any>("/uyap-export/exportable");
  },

  async downloadExport(exportId: string) {
    return apiClient.requestBlob(`/uyap-export/download/${exportId}`);
  },

  // Execution Offices
  async getExecutionOffices(city?: string) {
    const query = city ? `?city=${encodeURIComponent(city)}` : "";
    return apiClient.request<any>(`/execution-offices${query}`);
  },

  async getExecutionOffice(id: string) {
    return apiClient.request<any>(`/execution-offices/${id}`);
  },
};
