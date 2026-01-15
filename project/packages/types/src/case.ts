/**
 * Case (Dosya) Domain Types
 * 
 * Tüm dosya ile ilgili tipler burada tanımlı.
 * Modüller arası iletişimde bu tipler kullanılmalı.
 * 
 * @see ARCHITECTURE.md - Shared Contracts
 */

import { Money } from './money';
import { CaseId, ClientId, TenantId, ExecutionOfficeId } from './branded-ids';

// ============================================
// ENUMS
// ============================================

export enum CaseTypeEnum {
  GENERAL_EXECUTION = 'GENERAL_EXECUTION',
  MORTGAGE = 'MORTGAGE',
  PLEDGE = 'PLEDGE',
  BANKRUPTCY = 'BANKRUPTCY',
  CHECK = 'CHECK',
  BOND = 'BOND',
  RENTAL = 'RENTAL',
  ALIMONY = 'ALIMONY',
  OTHER = 'OTHER',
}

export enum CaseStatusEnum {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  DERDEST = 'DERDEST',
  CLOSED = 'CLOSED',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

export enum ExecutionPathEnum {
  ILAMSIZ = 'ILAMSIZ',
  ILAMLI = 'ILAMLI',
  KAMBIYO = 'KAMBIYO',
  REHIN = 'REHIN',
  IPOTEK = 'IPOTEK',
  IFLAS = 'IFLAS',
}

export enum WorkflowStageEnum {
  DRAFT = 'DRAFT',
  PAYMENT_ORDER = 'PAYMENT_ORDER',
  WAITING_RESPONSE = 'WAITING_RESPONSE',
  ENFORCEMENT = 'ENFORCEMENT',
  SEIZURE = 'SEIZURE',
  SALE = 'SALE',
  DISTRIBUTION = 'DISTRIBUTION',
  CLOSED = 'CLOSED',
}

// ============================================
// LABELS
// ============================================

export const CaseTypeLabelsNew: Record<CaseTypeEnum, string> = {
  [CaseTypeEnum.GENERAL_EXECUTION]: 'Genel Haciz Yolu',
  [CaseTypeEnum.MORTGAGE]: 'İpotekli Takip',
  [CaseTypeEnum.PLEDGE]: 'Rehinli Takip',
  [CaseTypeEnum.BANKRUPTCY]: 'İflas Yolu',
  [CaseTypeEnum.CHECK]: 'Çek Takibi',
  [CaseTypeEnum.BOND]: 'Senet Takibi',
  [CaseTypeEnum.RENTAL]: 'Kira Takibi',
  [CaseTypeEnum.ALIMONY]: 'Nafaka Takibi',
  [CaseTypeEnum.OTHER]: 'Diğer',
};

export const CaseStatusLabelsNew: Record<CaseStatusEnum, string> = {
  [CaseStatusEnum.DRAFT]: 'Taslak',
  [CaseStatusEnum.ACTIVE]: 'Aktif',
  [CaseStatusEnum.DERDEST]: 'Derdest',
  [CaseStatusEnum.CLOSED]: 'Kapalı',
  [CaseStatusEnum.SUSPENDED]: 'Askıda',
  [CaseStatusEnum.ARCHIVED]: 'Arşivlenmiş',
};

// ============================================
// DTOs
// ============================================

/**
 * Case DTO - API response/request için
 */
export interface CaseDTO {
  id: CaseId;
  tenantId: TenantId;
  fileNumber: string;
  executionFileNumber?: string;
  
  caseType: CaseTypeEnum;
  caseStatus: CaseStatusEnum;
  executionPath: ExecutionPathEnum;
  workflowStage: WorkflowStageEnum;
  
  /** Takip tarihi - ISO 8601 (YYYY-MM-DD) */
  caseDate: string;
  
  /** Asıl alacak - Money tipi ZORUNLU */
  principalAmount: Money;
  
  /**
   * Hesaplanmış faiz - ÇEKİRDEKTEN GELİR
   * UI/modül hesaplamaz, interest-engine'den alır
   */
  calculatedInterest?: Money;
  
  /**
   * Toplam borç - ÇEKİRDEKTEN GELİR
   * UI/modül hesaplamaz, interest-engine'den alır
   */
  totalDebt?: Money;
  
  clientId?: ClientId;
  executionOfficeId?: ExecutionOfficeId;
  
  /** UYAP birim kodu */
  uyapBirimKodu?: string;
  
  /** Son icrai işlem tarihi */
  lastEnforcementActionAt?: string;
  
  /** Otomasyon aktif mi */
  isAutomationEnabled: boolean;
  
  /** Metadata (JSON) */
  metadata?: Record<string, unknown>;
  
  createdAt: string;
  updatedAt: string;
}

/**
 * Case oluşturma request
 */
export interface CreateCaseRequest {
  fileNumber: string;
  caseType: CaseTypeEnum;
  executionPath: ExecutionPathEnum;
  caseDate: string;
  principalAmount: Money;
  clientId?: ClientId;
  executionOfficeId?: ExecutionOfficeId;
  metadata?: Record<string, unknown>;
}

/**
 * Case güncelleme request
 */
export interface UpdateCaseRequest {
  fileNumber?: string;
  executionFileNumber?: string;
  caseStatus?: CaseStatusEnum;
  workflowStage?: WorkflowStageEnum;
  principalAmount?: Money;
  uyapBirimKodu?: string;
  isAutomationEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Case özet (liste için hafif)
 */
export interface CaseSummaryDTO {
  id: CaseId;
  fileNumber: string;
  executionFileNumber?: string;
  caseType: CaseTypeEnum;
  caseStatus: CaseStatusEnum;
  caseDate: string;
  principalAmount: Money;
  totalDebt?: Money;
  clientName?: string;
  debtorCount: number;
  alertCount: number;
}

/**
 * Case hesap özeti - ÇEKİRDEKTEN GELİR
 */
export interface CaseCalculationSummary {
  caseId: CaseId;
  asOfDate: string;
  
  /** Asıl alacak */
  principal: Money;
  
  /** Takip öncesi faiz */
  preEnforcementInterest: Money;
  
  /** Takip sonrası faiz */
  postEnforcementInterest: Money;
  
  /** Toplam faiz */
  totalInterest: Money;
  
  /** İcra masrafları */
  fees: Money;
  
  /** Vekalet ücreti */
  attorneyFee: Money;
  
  /** Toplam borç */
  grandTotal: Money;
  
  /** Tahsilat toplamı */
  totalCollected: Money;
  
  /** Kalan borç */
  remainingDebt: Money;
  
  /** Hesaplama kaynağı */
  source: 'interest-engine';
}
