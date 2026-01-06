/**
 * Validation API - Validation gate and case detail endpoints
 */

import { apiClient } from './client';

// Banka alacağı tipleri
export interface BankClaimWarning {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  suggestion?: string;
}

export interface BankClaimRisk {
  code: string;
  description: string;
  probability: 'LOW' | 'MEDIUM' | 'HIGH';
  impact: string;
}

export interface RequiredDocument {
  code: string;
  name: string;
  description: string;
  isPresent: boolean;
  isMandatory: boolean;
}

export interface IIK68Status {
  hasValidDocuments: boolean;
  documentTypes: string[];
  canRequestRemoval: boolean;
  removalRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface BankClaimValidation {
  isBankClaim: boolean;
  warnings: BankClaimWarning[];
  risks: BankClaimRisk[];
  requiredDocuments: RequiredDocument[];
  iik68Status: IIK68Status;
}

export interface BankClaimValidationParams {
  mahiyetCode: string;
  hasKrediSozlesmesi?: boolean;
  hasHesapOzeti?: boolean;
  hesapOzetiTebligEdildiMi?: boolean;
  hesapOzetiItirazSuresiGectiMi?: boolean;
  hasTemerrut?: boolean;
  hasKefaletname?: boolean;
  borcluItirazEttiMi?: boolean;
  itirazTuru?: 'BORCA' | 'IMZAYA' | null;
}

export interface BankClaimInterestRules {
  defaultInterestType: string;
  canUseBSMV: boolean;
  canUseKKDF: boolean;
  notes: string[];
}

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

  // Banka Alacağı Kontrolleri (İİK 68)
  async isBankClaim(mahiyetCode: string): Promise<{ mahiyetCode: string; isBankClaim: boolean }> {
    return apiClient.request<{ mahiyetCode: string; isBankClaim: boolean }>(
      `/validation-gate/is-bank-claim?mahiyetCode=${encodeURIComponent(mahiyetCode)}`
    );
  },

  async validateBankClaim(params: BankClaimValidationParams): Promise<BankClaimValidation> {
    return apiClient.request<BankClaimValidation>('/validation-gate/bank-claim-validation', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async getBankClaimInterestRules(mahiyetCode: string): Promise<{
    mahiyetCode: string;
    isBankClaim: boolean;
    rules: BankClaimInterestRules | null;
  }> {
    return apiClient.request<{
      mahiyetCode: string;
      isBankClaim: boolean;
      rules: BankClaimInterestRules | null;
    }>(`/validation-gate/bank-claim-interest-rules?mahiyetCode=${encodeURIComponent(mahiyetCode)}`);
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
