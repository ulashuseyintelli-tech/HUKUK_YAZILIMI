/**
 * Policy Engine API Client
 * 
 * Gate kontrolü ve policy kararları için TEK KAYNAK.
 * UI'da kendi validasyon mantığı YASAK - bu client kullanılmalı.
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 * @see policy-engine/case-policy-engine.service.ts
 */

import { apiClient } from './client';

// ============================================
// TYPES
// ============================================

export type ActionCode = 
  | 'UYAP_SEND'
  | 'PAYMENT_ORDER'
  | 'SEIZURE_REQUEST'
  | 'SALE_REQUEST'
  | 'CLOSE_CASE'
  | 'ARCHIVE_CASE'
  | 'ADD_DEBTOR'
  | 'REMOVE_DEBTOR'
  | 'ADD_COLLECTION'
  | 'CANCEL_COLLECTION'
  | 'SEND_NOTIFICATION'
  | 'GENERATE_DOCUMENT';

export type GateCode =
  | 'BALANCE_CHECK'
  | 'DEBTOR_SERVICE_CHECK'
  | 'LIMITATION_CHECK'
  | 'DOCUMENT_CHECK'
  | 'UYAP_CONNECTION_CHECK'
  | 'APPROVAL_CHECK';

export type GateSeverity = 'HARD' | 'SOFT' | 'INFO';

export interface GateResult {
  gateCode: GateCode;
  passed: boolean;
  severity: GateSeverity;
  reason?: string;
  evidence?: Record<string, unknown>;
}

export interface PolicyEvaluateRequest {
  caseId: string;
  actionCode: ActionCode;
  facts?: Record<string, unknown>;
}

export interface PolicyEvaluateResult {
  caseId: string;
  actionCode: ActionCode;
  
  /** Aksiyon izin veriliyor mu? */
  allowed: boolean;
  
  /** Gate sonuçları */
  gates: GateResult[];
  
  /** Engelleyici gate'ler (HARD) */
  blockers: string[];
  
  /** Uyarılar (SOFT) */
  warnings: string[];
  
  /** Bilgilendirmeler (INFO) */
  infos: string[];
  
  /** Karar ID (audit için) */
  decisionId?: string;
  
  /** Değerlendirme tarihi */
  evaluatedAt: string;
}

export interface AvailableActionsResult {
  caseId: string;
  actions: {
    actionCode: ActionCode;
    label: string;
    allowed: boolean;
    blockerCount: number;
    warningCount: number;
  }[];
}

export interface DecisionLogEntry {
  id: string;
  caseId: string;
  actionCode: ActionCode;
  decision: 'ALLOWED' | 'BLOCKED' | 'WARNING';
  gates: GateResult[];
  facts: Record<string, unknown>;
  createdAt: string;
  createdBy?: string;
}

// ============================================
// API CLIENT
// ============================================

export const policyEngineApi = {
  /**
   * Aksiyon için policy değerlendir
   * 
   * @example
   * const result = await policyEngineApi.evaluate({
   *   caseId: 'abc-123',
   *   actionCode: 'UYAP_SEND',
   * });
   * 
   * if (!result.allowed) {
   *   console.log('Blockers:', result.blockers);
   * }
   */
  evaluate: async (request: PolicyEvaluateRequest): Promise<PolicyEvaluateResult> => {
    const response = await apiClient.post('/policy-engine/evaluate', request);
    return response.data;
  },

  /**
   * Tek bir gate kontrol et
   * 
   * @example
   * const result = await policyEngineApi.checkGate('abc-123', 'BALANCE_CHECK');
   */
  checkGate: async (caseId: string, gateCode: GateCode): Promise<GateResult> => {
    const response = await apiClient.get(`/policy-engine/gates/${caseId}/${gateCode}`);
    return response.data;
  },

  /**
   * Tüm gate'leri kontrol et
   */
  checkAllGates: async (caseId: string): Promise<GateResult[]> => {
    const response = await apiClient.get(`/policy-engine/gates/${caseId}`);
    return response.data;
  },

  /**
   * Dosya için mevcut aksiyonları al
   * 
   * @example
   * const result = await policyEngineApi.getAvailableActions('abc-123');
   * const allowedActions = result.actions.filter(a => a.allowed);
   */
  getAvailableActions: async (caseId: string): Promise<AvailableActionsResult> => {
    const response = await apiClient.get(`/policy-engine/actions/${caseId}`);
    return response.data;
  },

  /**
   * Karar loglarını al
   */
  getDecisionLogs: async (caseId: string, limit: number = 10): Promise<DecisionLogEntry[]> => {
    const response = await apiClient.get(`/policy-engine/decisions/${caseId}?limit=${limit}`);
    return response.data;
  },

  /**
   * Belirli bir karar logunu al
   */
  getDecisionLog: async (decisionId: string): Promise<DecisionLogEntry> => {
    const response = await apiClient.get(`/policy-engine/decisions/detail/${decisionId}`);
    return response.data;
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Gate sonucunu Türkçe açıklamaya çevir
 */
export function getGateMessage(gate: GateResult): string {
  const messages: Record<GateCode, string> = {
    BALANCE_CHECK: gate.passed ? 'Bakiye yeterli' : 'Yetersiz bakiye',
    DEBTOR_SERVICE_CHECK: gate.passed ? 'Tebligat tamamlandı' : 'Tebligat eksik',
    LIMITATION_CHECK: gate.passed ? 'Zamanaşımı uygun' : 'Zamanaşımı riski',
    DOCUMENT_CHECK: gate.passed ? 'Belgeler tamam' : 'Eksik belge',
    UYAP_CONNECTION_CHECK: gate.passed ? 'UYAP bağlantısı aktif' : 'UYAP bağlantı sorunu',
    APPROVAL_CHECK: gate.passed ? 'Onay alındı' : 'Onay gerekli',
  };
  return gate.reason || messages[gate.gateCode] || 'Bilinmeyen kontrol';
}

/**
 * Severity'ye göre renk al
 */
export function getGateSeverityColor(severity: GateSeverity): string {
  switch (severity) {
    case 'HARD': return 'red';
    case 'SOFT': return 'amber';
    case 'INFO': return 'blue';
    default: return 'gray';
  }
}

/**
 * ActionCode'u Türkçe label'a çevir
 */
export function getActionLabel(actionCode: ActionCode): string {
  const labels: Record<ActionCode, string> = {
    UYAP_SEND: 'UYAP Gönder',
    PAYMENT_ORDER: 'Ödeme Emri',
    SEIZURE_REQUEST: 'Haciz Talebi',
    SALE_REQUEST: 'Satış Talebi',
    CLOSE_CASE: 'Dosya Kapat',
    ARCHIVE_CASE: 'Arşivle',
    ADD_DEBTOR: 'Borçlu Ekle',
    REMOVE_DEBTOR: 'Borçlu Çıkar',
    ADD_COLLECTION: 'Tahsilat Ekle',
    CANCEL_COLLECTION: 'Tahsilat İptal',
    SEND_NOTIFICATION: 'Bildirim Gönder',
    GENERATE_DOCUMENT: 'Belge Oluştur',
  };
  return labels[actionCode] || actionCode;
}
