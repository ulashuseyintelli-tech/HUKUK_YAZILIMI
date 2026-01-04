/**
 * Asset Query API - Asset discovery endpoints (FAZ 4)
 */

import { apiClient } from './client';

export const assetQueryApi = {
  // Asset Queries
  async getAssetQueries(caseDebtorId: string) {
    return apiClient.request<any>(`/asset-query/debtor/${caseDebtorId}`);
  },

  async createAssetQuery(data: {
    caseDebtorId: string;
    queryType: string;
    notes?: string;
  }) {
    return apiClient.request<any>('/asset-query', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAssetQueryResponse(id: string, data: {
    status: string;
    responseData?: any;
    assetsFound?: number;
    notes?: string;
  }) {
    return apiClient.request<any>(`/asset-query/${id}/response`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async getAssetQueryTypes() {
    return apiClient.request<any[]>('/asset-query/types');
  },

  // Discovered Assets
  async getDiscoveredAssets(caseDebtorId: string) {
    return apiClient.request<any>(`/asset-query/debtor/${caseDebtorId}/assets`);
  },

  async addDiscoveredAsset(caseDebtorId: string, data: {
    assetType: string;
    description: string;
    estimatedValue?: number;
    source: string;
    metadata?: any;
  }) {
    return apiClient.request<any>(`/asset-query/debtor/${caseDebtorId}/assets`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateDiscoveredAsset(assetId: string, data: any) {
    return apiClient.request<any>(`/asset-query/assets/${assetId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteDiscoveredAsset(assetId: string) {
    return apiClient.request<any>(`/asset-query/assets/${assetId}`, {
      method: 'DELETE',
    });
  },

  // Haciz Requests
  async createHacizRequest(assetId: string, data?: any) {
    return apiClient.request<any>(`/asset-query/assets/${assetId}/haciz-request`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  // Asset Summary
  async getAssetSummary(caseDebtorId: string) {
    return apiClient.request<any>(`/asset-query/debtor/${caseDebtorId}/summary`);
  },
};
