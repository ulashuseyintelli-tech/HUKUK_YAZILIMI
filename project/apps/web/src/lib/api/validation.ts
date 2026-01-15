/**
 * Validation API - Validation gate and case detail endpoints
 * 
 * ⚠️ DEPRECATION NOTICE:
 * validation-gate endpoint'leri deprecated. Yeni kod için policy-engine kullanın:
 * 
 * ```typescript
 * import { policyEngineApi } from './policy-engine';
 * 
 * // Eski: validationApi.validateCase(caseId)
 * // Yeni: policyEngineApi.checkAllGates(caseId)
 * ```
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 * @see policy-engine.ts - Yeni API client
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
  // ==================== DEPRECATED - Redirected to policy-engine ====================
  
  /**
   * @deprecated Use policyEngineApi.checkAllGates(caseId) instead
   * Bu fonksiyon artık policyEngineApi'ye yönlendiriyor
   */
  async getValidationStatus(caseId: string) {
    console.warn('⚠️ validationApi.getValidationStatus() is DEPRECATED. Use policyEngineApi.checkAllGates()');
    const { policyEngineApi } = await import('./policy-engine');
    return policyEngineApi.checkAllGates(caseId);
  },

  /**
   * @deprecated Use policyEngineApi.checkAllGates(caseId) instead
   * Bu fonksiyon artık policyEngineApi'ye yönlendiriyor
   */
  async validateCase(caseId: string) {
    console.warn('⚠️ validationApi.validateCase() is DEPRECATED. Use policyEngineApi.checkAllGates()');
    const { policyEngineApi } = await import('./policy-engine');
    return policyEngineApi.checkAllGates(caseId);
  },

  /**
   * @deprecated Use policyEngineApi.getAvailableActions(caseId) for action rules
   * 
   * ⚠️ HARD FAIL: Bu fonksiyon artık desteklenmiyor.
   * Boş array döndürmek sessiz drift üretir - bunun yerine hata fırlatıyoruz.
   * 
   * @see docs/single-source-of-truth-architecture.md
   */
  async getValidationRules(): Promise<never> {
    console.error('❌ validationApi.getValidationRules() is DEPRECATED and will throw');
    
    // Telemetry: hangi sayfa çağırdı?
    const stack = new Error().stack;
    console.error('[DEPRECATED_USAGE] getValidationRules called from:', stack);
    
    throw new Error(
      'DEPRECATED: validationApi.getValidationRules() artık desteklenmiyor. ' +
      'policyEngineApi.getAvailableActions(caseId) kullanın.'
    );
  },

  /**
   * @deprecated Validation override artık desteklenmiyor - CPE gate'leri kullanın
   */
  async overrideValidation(_caseId: string, _ruleId: string, _reason: string): Promise<never> {
    console.error('❌ validationApi.overrideValidation() is DEPRECATED and will throw');
    throw new Error(
      'DEPRECATED: Validation override artık desteklenmiyor. ' +
      'CPE gate\'leri kullanın.'
    );
  },

  // ==================== BANK CLAIM (still active) ====================
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
