/**
 * Lawyers API - Lawyer management endpoints
 */

import { apiClient } from './client';

export const lawyersApi = {
  async getLawyers(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiClient.request<any>(`/lawyers${query}`);
  },

  async getLawyer(id: string) {
    return apiClient.request<any>(`/lawyers/${id}`);
  },

  async createLawyer(data: any) {
    return apiClient.request<any>("/lawyers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateLawyer(id: string, data: any) {
    return apiClient.request<any>(`/lawyers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteLawyer(id: string) {
    return apiClient.request<any>(`/lawyers/${id}`, { method: "DELETE" });
  },

  // Staff Members
  async getStaffMembers(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiClient.request<any>(`/staff${query}`);
  },
};
