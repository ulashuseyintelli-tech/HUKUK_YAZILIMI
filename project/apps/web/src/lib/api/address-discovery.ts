/**
 * Address Discovery API - Address research endpoints
 */

import { apiClient } from './client';
import type {
  ClientInfoRequestDTO,
  CreateClientInfoRequestDTO,
  UyapQueryDTO,
  CreateUyapQueryDTO,
  InstitutionLetterDTO,
  CreateInstitutionLetterDTO,
  CrossFileMatch,
  AddressResearchDTO,
} from './types';

export const addressDiscoveryApi = {
  // Client Info Request
  async createClientInfoRequest(data: CreateClientInfoRequestDTO) {
    return apiClient.request<ClientInfoRequestDTO>('/address-discovery/client-info-request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getClientInfoRequests(caseId: string) {
    return apiClient.request<ClientInfoRequestDTO[]>(`/address-discovery/client-info-request/case/${caseId}`);
  },

  async updateClientInfoRequest(id: string, data: Partial<ClientInfoRequestDTO>) {
    return apiClient.request<ClientInfoRequestDTO>(`/address-discovery/client-info-request/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async resendClientInfoRequest(id: string) {
    return apiClient.request<ClientInfoRequestDTO>(`/address-discovery/client-info-request/${id}/resend`, {
      method: 'POST',
    });
  },

  // UYAP Queries
  async createUyapQuery(data: CreateUyapQueryDTO) {
    return apiClient.request<UyapQueryDTO>('/address-discovery/uyap-query', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getUyapQueries(caseDebtorId: string) {
    return apiClient.request<UyapQueryDTO[]>(`/address-discovery/uyap-query/debtor/${caseDebtorId}`);
  },

  async updateUyapQueryResponse(id: string, data: { addressesFound: number; responseData?: any; notes?: string }) {
    return apiClient.request<UyapQueryDTO>(`/address-discovery/uyap-query/${id}/response`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async getUyapQueryTypes() {
    return apiClient.request<any[]>('/address-discovery/uyap-query/types');
  },

  // Institution Letters
  async createInstitutionLetter(data: CreateInstitutionLetterDTO) {
    return apiClient.request<InstitutionLetterDTO>('/address-discovery/institution-letter', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getInstitutionLetters(caseDebtorId: string) {
    return apiClient.request<InstitutionLetterDTO[]>(`/address-discovery/institution-letter/debtor/${caseDebtorId}`);
  },

  async updateInstitutionLetter(id: string, data: Partial<InstitutionLetterDTO>) {
    return apiClient.request<InstitutionLetterDTO>(`/address-discovery/institution-letter/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async sendInstitutionLetter(id: string) {
    return apiClient.request<InstitutionLetterDTO>(`/address-discovery/institution-letter/${id}/send`, {
      method: 'POST',
    });
  },

  async recordInstitutionLetterResponse(id: string, data: { addressesFound: number; responseNotes?: string }) {
    return apiClient.request<InstitutionLetterDTO>(`/address-discovery/institution-letter/${id}/response`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Cross-File
  async findSameDebtor(debtorId: string) {
    return apiClient.request<CrossFileMatch[]>(`/address-discovery/cross-file/${debtorId}`);
  },

  async getCrossFileAddresses(debtorId: string, excludeCaseId: string) {
    return apiClient.request<any[]>(`/address-discovery/cross-file/${debtorId}/addresses?excludeCaseId=${excludeCaseId}`);
  },

  async copyAddressFromOtherCase(debtorId: string, addressId: string, targetCaseId: string) {
    return apiClient.request<any>('/address-discovery/cross-file/copy-address', {
      method: 'POST',
      body: JSON.stringify({ debtorId, addressId, targetCaseId }),
    });
  },

  // Confidence Score
  async getConfidenceScore(addressId: string) {
    return apiClient.request<{ score: number }>(`/address-discovery/confidence/${addressId}`);
  },

  async recalculateConfidenceScore(addressId: string) {
    return apiClient.request<{ score: number }>(`/address-discovery/confidence/${addressId}/recalculate`, {
      method: 'POST',
    });
  },

  // Research Status
  async getResearchStatus(caseDebtorId: string) {
    return apiClient.request<AddressResearchDTO>(`/address-discovery/research/${caseDebtorId}`);
  },

  async startResearch(caseDebtorId: string) {
    return apiClient.request<AddressResearchDTO>(`/address-discovery/research/${caseDebtorId}/start`, {
      method: 'POST',
    });
  },

  async completeResearch(caseDebtorId: string) {
    return apiClient.request<AddressResearchDTO>(`/address-discovery/research/${caseDebtorId}/complete`, {
      method: 'POST',
    });
  },

  async getResearchSuggestions(caseDebtorId: string) {
    return apiClient.request<any[]>(`/address-discovery/research/${caseDebtorId}/suggestions`);
  },

  async getResearchTimeline(caseDebtorId: string) {
    return apiClient.request<any[]>(`/address-discovery/research/${caseDebtorId}/timeline`);
  },
};
