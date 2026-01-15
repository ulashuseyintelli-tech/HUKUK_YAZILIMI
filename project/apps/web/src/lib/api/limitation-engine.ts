/**
 * Limitation Engine Web API Client
 * 
 * Zamanaşımı hesaplama ve kontrol servisi.
 * Backend: /limitation-engine/*
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

import { apiClient } from './client';

// ============================================
// TYPES
// ============================================

export type WarningLevel = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export interface LimitationRule {
  code: string;
  name: string;
  periodYears: number;
  startDateType: string;
  interruptionRules?: string[];
  notes?: string;
}

export interface LimitationSettings {
  yellowThresholdDays: number;
  redThresholdDays: number;
  defaultPeriodYears: number;
}

export interface LimitationCheckRequest {
  caseType: string;
  claimTypeCode?: string;
  startDate?: string;
  instrumentType?: string;
  role?: string;
  lastInterruptionDate?: string;
}

export interface LimitationCheckResult {
  level: WarningLevel;
  expiryDate: string | null;
  daysLeft: number | null;
  periodYears: number;
  message: string;
  rule?: LimitationRule;
  warnings?: string[];
}

export interface EnforcementRecommendationRequest {
  hasJudgment?: boolean;
  judgmentDate?: string;
  hasInstrument?: boolean;
  instrumentType?: string;
  instrumentStartDate?: string;
  generalStartDate?: string;
  role?: string;
}

export interface EnforcementRecommendation {
  enforcementType: string;
  enforcementTypeName: string;
  limitationStatus: WarningLevel;
  expiryDate: string | null;
  daysLeft: number | null;
  reason: string;
  priority: number;
}

export interface LogRiskRequest {
  caseId?: string;
  claimTypeCode: string;
  role?: string;
  startDateInput?: string;
  level: WarningLevel;
  ackAction?: 'PROCEED' | 'BACK';
}

export interface WarningLevelInfo {
  level: WarningLevel;
  color: string;
  icon: string;
  title: string;
  description: string;
}

export interface ModalTexts {
  title: string;
  body: string;
  proceedButton: string;
  backButton: string;
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Tüm zamanaşımı kurallarını getir
 */
export async function getAllRules(): Promise<{
  rules: LimitationRule[];
  settings: LimitationSettings;
}> {
  const response = await apiClient.get('/limitation-engine/rules');
  return response.data;
}

/**
 * Belirli takip türü için kuralları getir
 */
export async function getRulesForCaseType(caseType: string): Promise<{
  caseType: string;
  rules: LimitationRule[];
}> {
  const response = await apiClient.get(`/limitation-engine/rules/by-case-type?caseType=${encodeURIComponent(caseType)}`);
  return response.data;
}

/**
 * Zamanaşımı kontrolü yap
 * 
 * @example
 * const result = await checkLimitation({
 *   caseType: 'KAMBIYO',
 *   claimTypeCode: 'CEK',
 *   startDate: '2023-01-15',
 * });
 * 
 * if (result.level === 'RED') {
 *   // Zamanaşımı dolmuş veya çok yakın
 * }
 */
export async function checkLimitation(
  request: LimitationCheckRequest
): Promise<LimitationCheckResult> {
  const response = await apiClient.post('/limitation-engine/check', request);
  return response.data;
}

/**
 * Takip türü önerisi al
 * 
 * Mevcut duruma göre en uygun takip türünü önerir.
 * Zamanaşımı durumuna göre sıralanmış öneriler döner.
 */
export async function recommendEnforcement(
  request: EnforcementRecommendationRequest
): Promise<EnforcementRecommendation[]> {
  const response = await apiClient.post('/limitation-engine/recommend', request);
  return response.data.recommendations;
}

/**
 * Zamanaşımı risk logunu kaydet
 * 
 * Kullanıcının zamanaşımı uyarısını gördüğünü ve
 * devam etme/geri dönme kararını loglar.
 */
export async function logRisk(request: LogRiskRequest): Promise<{ success: boolean }> {
  const response = await apiClient.post('/limitation-engine/log-risk', request);
  return response.data;
}

/**
 * Uyarı seviyesi bilgilerini getir
 */
export async function getWarningLevels(): Promise<Record<WarningLevel, WarningLevelInfo>> {
  const response = await apiClient.get('/limitation-engine/warning-levels');
  return response.data;
}

/**
 * Modal metinlerini getir
 */
export async function getModalTexts(): Promise<Record<'YELLOW' | 'RED' | 'UNKNOWN', ModalTexts>> {
  const response = await apiClient.get('/limitation-engine/modal-texts');
  return response.data;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Uyarı seviyesine göre renk döndür
 */
export function getWarningColor(level: WarningLevel): string {
  const colors: Record<WarningLevel, string> = {
    GREEN: '#22c55e',
    YELLOW: '#eab308',
    RED: '#ef4444',
    UNKNOWN: '#6b7280',
  };
  return colors[level];
}

/**
 * Uyarı seviyesine göre Tailwind class döndür
 */
export function getWarningColorClass(level: WarningLevel): string {
  const classes: Record<WarningLevel, string> = {
    GREEN: 'text-green-600 bg-green-50 border-green-200',
    YELLOW: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    RED: 'text-red-600 bg-red-50 border-red-200',
    UNKNOWN: 'text-gray-600 bg-gray-50 border-gray-200',
  };
  return classes[level];
}

/**
 * Kalan gün sayısını formatla
 */
export function formatDaysLeft(daysLeft: number | null): string {
  if (daysLeft === null) return 'Bilinmiyor';
  if (daysLeft < 0) return 'Süresi dolmuş';
  if (daysLeft === 0) return 'Bugün doluyor';
  if (daysLeft === 1) return '1 gün kaldı';
  return `${daysLeft} gün kaldı`;
}

/**
 * Zamanaşımı kontrolü gerekli mi?
 * Takip açmadan önce kontrol edilmeli
 */
export function shouldCheckLimitation(caseType: string): boolean {
  // Tüm takip türleri için zamanaşımı kontrolü önerilir
  return true;
}
