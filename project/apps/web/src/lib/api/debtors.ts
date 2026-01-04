/**
 * Debtors API - Debtor management endpoints
 */

import { apiClient } from './client';
import type {
  CaseDebtorsResponse,
  ServiceReturnReason,
  VerificationResultDTO,
  NextAddressSuggestionDTO,
  AddressStatsDTO,
  NotificationChainDTO,
} from './types';

export const debtorsApi = {
  // Debtors
  async getDebtors(params?: { page?: number; limit?: number; search?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", params.page.toString());
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.search) query.set("search", params.search);
    return apiClient.request<any>(`/debtors?${query}`);
  },

  async searchDebtors(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiClient.request<any>(`/debtors/search${query}`);
  },

  async getDebtor(id: string) {
    return apiClient.request<any>(`/debtors/${id}`);
  },

  async createDebtor(data: any) {
    return apiClient.request<any>("/debtors", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Case Debtors
  async getCaseDebtors(caseId: string) {
    return apiClient.request<CaseDebtorsResponse>(`/debtors/case/${caseId}`);
  },

  async addCaseDebtor(caseId: string, data: { debtorId: string; role?: string }) {
    return apiClient.request<any>(`/debtors/case/${caseId}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async removeCaseDebtor(caseId: string, caseDebtorId: string) {
    return apiClient.request<any>(`/debtors/case/${caseId}/${caseDebtorId}`, {
      method: "DELETE",
    });
  },

  // Service Status (Tebligat)
  async updateServiceStatus(
    caseId: string,
    caseDebtorId: string,
    data: {
      status: string;
      date?: string;
      notes?: string;
      returnReason?: ServiceReturnReason;
      pttBarcodeNo?: string;
      pttResultCode?: string;
    }
  ) {
    return apiClient.request<any>(`/debtors/case/${caseId}/${caseDebtorId}/service-status`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async getServiceHistory(caseDebtorId: string) {
    return apiClient.request<any>(`/debtors/service-history/${caseDebtorId}`);
  },

  // Address Verification
  async verifyAddressViaMernis(addressId: string, tckn: string) {
    return apiClient.request<VerificationResultDTO>(`/addresses/${addressId}/verify/mernis`, {
      method: "POST",
      body: JSON.stringify({ tckn }),
    });
  },

  async verifyAddressViaSgk(addressId: string, tckn: string) {
    return apiClient.request<VerificationResultDTO>(`/addresses/${addressId}/verify/sgk`, {
      method: "POST",
      body: JSON.stringify({ tckn }),
    });
  },

  async verifyAddressViaVergiDairesi(addressId: string, vkn: string) {
    return apiClient.request<VerificationResultDTO>(`/addresses/${addressId}/verify/vergi`, {
      method: "POST",
      body: JSON.stringify({ vkn }),
    });
  },

  // Next Address Suggestion
  async suggestNextAddress(addressId: string, debtorId: string, returnReason: ServiceReturnReason) {
    return apiClient.request<NextAddressSuggestionDTO>(`/addresses/${addressId}/suggest-next`, {
      method: "POST",
      body: JSON.stringify({ debtorId, returnReason }),
    });
  },

  // Address Stats
  async getAddressStats(addressId: string) {
    return apiClient.request<AddressStatsDTO>(`/addresses/${addressId}/stats`);
  },

  // Notification Chain
  async getNotificationChain(debtorId: string) {
    return apiClient.request<NotificationChainDTO>(`/debtors/${debtorId}/notification-chain`);
  },

  // Debtor Addresses
  async getDebtorAddresses(debtorId: string) {
    return apiClient.request<any>(`/debtors/${debtorId}/addresses`);
  },

  async addDebtorAddress(debtorId: string, data: any) {
    return apiClient.request<any>(`/debtors/${debtorId}/addresses`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateDebtorAddress(debtorId: string, addressId: string, data: any) {
    return apiClient.request<any>(`/debtors/${debtorId}/addresses/${addressId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteDebtorAddress(debtorId: string, addressId: string) {
    return apiClient.request<any>(`/debtors/${debtorId}/addresses/${addressId}`, {
      method: "DELETE",
    });
  },
};
