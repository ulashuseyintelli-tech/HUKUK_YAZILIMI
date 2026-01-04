/**
 * Cases API - Case management endpoints
 */

import { apiClient } from './client';

export const casesApi = {
  async getCases(params?: { status?: string; clientId?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.clientId) query.set("clientId", params.clientId);
    if (params?.page) query.set("page", params.page.toString());
    if (params?.limit) query.set("limit", params.limit.toString());
    return apiClient.request<any>(`/cases?${query}`);
  },

  async getCase(id: string) {
    return apiClient.request<any>(`/cases/${id}`);
  },

  async createCase(data: any) {
    return apiClient.request<any>("/cases", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateCase(id: string, data: any) {
    return apiClient.request<any>(`/cases/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteCase(id: string) {
    return apiClient.request<any>(`/cases/${id}`, { method: "DELETE" });
  },

  async getCaseStats() {
    return apiClient.request<any>("/cases/stats");
  },

  async getNextFileNumber() {
    const res = await apiClient.request<{ fileNumber: string }>("/cases/next-file-number");
    return res.fileNumber;
  },

  // Case Lawyers
  async getCaseLawyers(caseId: string) {
    return apiClient.request<any>(`/cases/${caseId}/lawyers`);
  },

  async addCaseLawyer(caseId: string, data: {
    lawyerId: string;
    role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
    canSign?: boolean;
  }) {
    return apiClient.request<any>(`/cases/${caseId}/lawyers`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async removeCaseLawyer(caseId: string, caseLawyerId: string) {
    return apiClient.request<any>(`/cases/${caseId}/lawyers/${caseLawyerId}`, {
      method: "DELETE",
    });
  },

  async updateCaseLawyer(caseId: string, caseLawyerId: string, data: {
    role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
    canSign?: boolean;
  }) {
    return apiClient.request<any>(`/cases/${caseId}/lawyers/${caseLawyerId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  // Case Staff
  async getCaseStaff(caseId: string) {
    return apiClient.request<any>(`/cases/${caseId}/staff`);
  },

  async addCaseStaff(caseId: string, data: { staffId: string; role?: string }) {
    return apiClient.request<any>(`/cases/${caseId}/staff`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async removeCaseStaff(caseId: string, caseStaffId: string) {
    return apiClient.request<any>(`/cases/${caseId}/staff/${caseStaffId}`, {
      method: "DELETE",
    });
  },

  // Case Status
  async getStatusList() {
    return apiClient.request<any>("/case-status/list");
  },

  async updateCaseStatus(caseId: string, status: string) {
    return apiClient.request<any>(`/cases/${caseId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
};
