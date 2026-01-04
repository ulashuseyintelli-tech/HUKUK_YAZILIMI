/**
 * Clients API - Client management endpoints
 */

import { apiClient } from './client';

export const clientsApi = {
  async getClients(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiClient.request<any>(`/clients${query}`);
  },

  async getClient(id: string) {
    return apiClient.request<any>(`/clients/${id}`);
  },

  async createClient(data: any) {
    return apiClient.request<any>("/clients", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateClient(id: string, data: any) {
    return apiClient.request<any>(`/clients/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteClient(id: string) {
    return apiClient.request<any>(`/clients/${id}`, { method: "DELETE" });
  },

  // Client Cases
  async getClientCases(clientId: string) {
    return apiClient.request<any>(`/clients/${clientId}/cases`);
  },

  // Client Stats
  async getClientStats(clientId: string) {
    return apiClient.request<any>(`/clients/${clientId}/stats`);
  },
};
