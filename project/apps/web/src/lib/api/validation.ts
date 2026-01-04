/**
 * Validation API - Validation gate and case detail endpoints
 */

import { apiClient } from './client';

export const validationApi = {
  // Validation Gate
  async getValidationStatus(caseId: string) {
    return apiClient.request<any>(`/validation-gate/case/${caseId}`);
  },

  async validateCase(caseId: string) {
    return apiClient.request<any>(`/validation-gate/case/${caseId}/validate`, {
      method: 'POST',
    });
  },

  async getValidationRules() {
    return apiClient.request<any>('/validation-gate/rules');
  },

  async overrideValidation(caseId: string, ruleId: string, reason: string) {
    return apiClient.request<any>(`/validation-gate/case/${caseId}/override`, {
      method: 'POST',
      body: JSON.stringify({ ruleId, reason }),
    });
  },

  // Case Instruments (Çek/Senet)
  async getCaseInstruments(caseId: string) {
    return apiClient.request<any>(`/case-instruments/case/${caseId}`);
  },

  async createCaseInstrument(caseId: string, data: any) {
    return apiClient.request<any>('/case-instruments', {
      method: 'POST',
      body: JSON.stringify({ caseId, ...data }),
    });
  },

  async updateCaseInstrument(id: string, data: any) {
    return apiClient.request<any>(`/case-instruments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteCaseInstrument(id: string) {
    return apiClient.request<any>(`/case-instruments/${id}`, { method: 'DELETE' });
  },

  // Case Lease (Kira)
  async getCaseLease(caseId: string) {
    return apiClient.request<any>(`/case-lease/case/${caseId}`);
  },

  async createCaseLease(caseId: string, data: any) {
    return apiClient.request<any>('/case-lease', {
      method: 'POST',
      body: JSON.stringify({ caseId, ...data }),
    });
  },

  async updateCaseLease(id: string, data: any) {
    return apiClient.request<any>(`/case-lease/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Case Judgment (İlam)
  async getCaseJudgment(caseId: string) {
    return apiClient.request<any>(`/case-judgment/case/${caseId}`);
  },

  async createCaseJudgment(caseId: string, data: any) {
    return apiClient.request<any>('/case-judgment', {
      method: 'POST',
      body: JSON.stringify({ caseId, ...data }),
    });
  },

  async updateCaseJudgment(id: string, data: any) {
    return apiClient.request<any>(`/case-judgment/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Case Collateral (Rehin/İpotek)
  async getCaseCollateral(caseId: string) {
    return apiClient.request<any>(`/case-collateral/case/${caseId}`);
  },

  async createCaseCollateral(caseId: string, data: any) {
    return apiClient.request<any>('/case-collateral', {
      method: 'POST',
      body: JSON.stringify({ caseId, ...data }),
    });
  },

  async updateCaseCollateral(id: string, data: any) {
    return apiClient.request<any>(`/case-collateral/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
};
