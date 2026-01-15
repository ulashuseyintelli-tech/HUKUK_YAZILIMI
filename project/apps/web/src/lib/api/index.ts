/**
 * API Module Index
 * 
 * Modular API client - her domain için ayrı dosya
 * Eski api.ts dosyasının yerine geçer
 */

// Re-export client
export { apiClient, ApiClient } from './client';

// Re-export domain APIs
export { authApi } from './auth';
export { casesApi } from './cases';
export { clientsApi } from './clients';
export { debtorsApi } from './debtors';
export { lawyersApi } from './lawyers';
export { documentsApi } from './documents';
export { tebligatApi } from './tebligat';
export { financeApi } from './finance';
export { uyapApi } from './uyap';
export { validationApi } from './validation';
export { automationApi } from './automation';
export { addressDiscoveryApi } from './address-discovery';
export { assetQueryApi } from './asset-query';
export { icrabotApi } from './icrabot';
export * as officeApi from './office';
export { interestEngineApi } from './interest-engine';
export * from './interest-engine';

// Core Engine API Clients (TEK KAYNAK)
export { feeEngineApi, formatFee } from './fee-engine';
export type { FeeComputeRequest, FeeComputeResult, GeneratedFeeItem, AttorneyFeeResult, TariffInfo } from './fee-engine';

export { policyEngineApi, getGateMessage, getGateSeverityColor, getActionLabel } from './policy-engine';
export type { 
  ActionCode, 
  GateCode, 
  GateSeverity, 
  GateResult, 
  PolicyEvaluateRequest, 
  PolicyEvaluateResult, 
  AvailableActionsResult,
  DecisionLogEntry 
} from './policy-engine';

// Limitation Engine API Client
export * as limitationEngineApi from './limitation-engine';
export {
  checkLimitation,
  recommendEnforcement,
  getAllRules as getLimitationRules,
  getWarningLevels,
  getWarningColor,
  getWarningColorClass,
  formatDaysLeft,
} from './limitation-engine';
export type {
  WarningLevel,
  LimitationRule,
  LimitationCheckRequest,
  LimitationCheckResult,
  EnforcementRecommendation,
  WarningLevelInfo,
} from './limitation-engine';

// Re-export types
export * from './types';

/**
 * Legacy compatibility layer
 * 
 * Eski api.getCases() gibi çağrıları destekler
 * Yeni kod için doğrudan casesApi.getCases() kullanın
 */
import { apiClient } from './client';
import { authApi } from './auth';
import { casesApi } from './cases';
import { clientsApi } from './clients';
import { debtorsApi } from './debtors';
import { lawyersApi } from './lawyers';
import { documentsApi } from './documents';
import { tebligatApi } from './tebligat';
import { financeApi } from './finance';
import { uyapApi } from './uyap';
import { validationApi } from './validation';
import { automationApi } from './automation';
import { addressDiscoveryApi } from './address-discovery';
import { assetQueryApi } from './asset-query';
import { icrabotApi } from './icrabot';

/**
 * @deprecated Use individual API modules instead (e.g., casesApi, clientsApi)
 */
export const api = {
  // Client methods
  setToken: (token: string) => apiClient.setToken(token),
  getToken: () => apiClient.getToken(),
  clearToken: () => apiClient.clearToken(),
  
  // Generic HTTP
  get: <T = any>(endpoint: string, options?: { responseType?: "json" | "blob" }) => 
    apiClient.get<T>(endpoint, options),
  post: <T = any>(endpoint: string, body?: any) => apiClient.post<T>(endpoint, body),
  put: <T = any>(endpoint: string, body?: any) => apiClient.put<T>(endpoint, body),
  patch: <T = any>(endpoint: string, body?: any) => apiClient.patch<T>(endpoint, body),
  delete: <T = any>(endpoint: string) => apiClient.delete<T>(endpoint),

  // Auth
  login: authApi.login,
  register: authApi.register,
  me: authApi.me,

  // Cases
  getCases: casesApi.getCases,
  getCase: casesApi.getCase,
  createCase: casesApi.createCase,
  updateCase: casesApi.updateCase,
  getCaseStats: casesApi.getCaseStats,
  getNextFileNumber: casesApi.getNextFileNumber,
  getCaseLawyers: casesApi.getCaseLawyers,
  addCaseLawyer: casesApi.addCaseLawyer,
  removeCaseLawyer: casesApi.removeCaseLawyer,
  updateCaseLawyer: casesApi.updateCaseLawyer,
  getCaseStaff: casesApi.getCaseStaff,
  addCaseStaff: casesApi.addCaseStaff,
  removeCaseStaff: casesApi.removeCaseStaff,
  getStatusList: casesApi.getStatusList,

  // Clients
  getClients: clientsApi.getClients,
  getClient: clientsApi.getClient,
  createClient: clientsApi.createClient,
  updateClient: clientsApi.updateClient,

  // Debtors
  getDebtors: debtorsApi.getDebtors,
  searchDebtors: debtorsApi.searchDebtors,
  getDebtor: debtorsApi.getDebtor,
  createDebtor: debtorsApi.createDebtor,
  getCaseDebtors: debtorsApi.getCaseDebtors,
  updateServiceStatus: debtorsApi.updateServiceStatus,
  getServiceHistory: debtorsApi.getServiceHistory,
  verifyAddressViaMernis: debtorsApi.verifyAddressViaMernis,
  suggestNextAddress: debtorsApi.suggestNextAddress,
  getAddressStats: debtorsApi.getAddressStats,
  getNotificationChain: debtorsApi.getNotificationChain,

  // Lawyers
  getLawyers: lawyersApi.getLawyers,
  getLawyer: lawyersApi.getLawyer,
  createLawyer: lawyersApi.createLawyer,
  updateLawyer: lawyersApi.updateLawyer,
  getStaffMembers: lawyersApi.getStaffMembers,

  // Documents
  getFormTypes: documentsApi.getFormTypes,
  getTemplates: documentsApi.getTemplates,
  generateDocument: documentsApi.generateDocument,

  // Tebligat
  getTebligatlar: tebligatApi.getTebligatlar,
  createTebligat: tebligatApi.createTebligat,
  updateTebligat: tebligatApi.updateTebligat,
  trackPttBarcode: tebligatApi.trackPttBarcode,
  checkUetsRegistration: tebligatApi.checkUetsRegistration,

  // Finance
  getDues: financeApi.getDues,
  createDue: financeApi.createDue,
  getCollections: financeApi.getCollections,
  createCollection: financeApi.createCollection,
  getExpenses: financeApi.getExpenses,
  createExpense: financeApi.createExpense,
  getCaseBalance: financeApi.getCaseBalance,
  getBanks: financeApi.getBanks,

  // UYAP
  getExecutionOffices: uyapApi.getExecutionOffices,
  exportCase: uyapApi.exportCase,
  validateForExport: uyapApi.validateForExport,

  // Validation - deprecated fonksiyonlar policyEngineApi'ye yönlendirildi
  /** @deprecated Use policyEngineApi.checkAllGates() instead */
  getValidationStatus: async (caseId: string) => {
    console.warn('⚠️ api.getValidationStatus() is DEPRECATED. Use policyEngineApi.checkAllGates()');
    const { policyEngineApi } = await import('./policy-engine');
    return policyEngineApi.checkAllGates(caseId);
  },
  getCaseInstruments: validationApi.getCaseInstruments,
  getCaseLease: validationApi.getCaseLease,
  getCaseJudgment: validationApi.getCaseJudgment,
  getCaseCollateral: validationApi.getCaseCollateral,

  // Automation
  getAutomationStats: automationApi.getAutomationStats,
  getAiStats: automationApi.getAiStats,
  getTasks: automationApi.getTasks,

  // Address Discovery
  createClientInfoRequest: addressDiscoveryApi.createClientInfoRequest,
  getClientInfoRequests: addressDiscoveryApi.getClientInfoRequests,
  createUyapQuery: addressDiscoveryApi.createUyapQuery,
  getUyapQueries: addressDiscoveryApi.getUyapQueries,
  createInstitutionLetter: addressDiscoveryApi.createInstitutionLetter,
  getInstitutionLetters: addressDiscoveryApi.getInstitutionLetters,
  findSameDebtor: addressDiscoveryApi.findSameDebtor,
  getConfidenceScore: addressDiscoveryApi.getConfidenceScore,
  getResearchStatus: addressDiscoveryApi.getResearchStatus,
  getResearchSuggestions: addressDiscoveryApi.getResearchSuggestions,
  getResearchTimeline: addressDiscoveryApi.getResearchTimeline,

  // Asset Query
  getAssetQueries: assetQueryApi.getAssetQueries,
  createAssetQuery: assetQueryApi.createAssetQuery,
  getDiscoveredAssets: assetQueryApi.getDiscoveredAssets,
};

export default api;
