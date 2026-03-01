/**
 * Collection (Tahsilat) Domain Types
 * 
 * Tüm tahsilat ile ilgili tipler burada tanımlı.
 * 
 * ⚠️ ÖNEMLİ: Tahsilat dağıtımı (allocation) hesabı
 * SADECE interest-engine/TBK100AllocatorService tarafından yapılır.
 * Bu modül sadece event store ve projection görevi görür.
 * 
 * @see ARCHITECTURE.md - Shared Contracts
 * @see interest-engine/allocation/tbk100-allocator.service.ts
 */

import { Money } from './money';
import { CollectionId, CaseId, TenantId } from './branded-ids';

// ============================================
// ENUMS
// ============================================

export enum CollectionStatusEnum {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum CollectionTypeEnum {
  PAYMENT = 'PAYMENT',           // Normal ödeme
  SEIZURE = 'SEIZURE',           // Haciz tahsilatı
  SALE = 'SALE',                 // Satış tahsilatı
  SETTLEMENT = 'SETTLEMENT',     // Sulh
  REFUND = 'REFUND',             // İade
  OTHER = 'OTHER',
}

export enum CollectionChannelEnum {
  BANK = 'BANK',
  CASH = 'CASH',
  CHECK = 'CHECK',
  UYAP = 'UYAP',
  PTT = 'PTT',
  OTHER = 'OTHER',
}

/**
 * TBK 100 Mahsup Sırası
 * Sıra: FAİZ → MASRAF → FER'İ → ANAPARA
 */
export enum AllocationTypeEnum {
  INTEREST = 'INTEREST',           // Faiz
  FEE = 'FEE',                     // Harç/Masraf
  EXPENSE = 'EXPENSE',             // İcra masrafı
  ATTORNEY_FEE = 'ATTORNEY_FEE',   // Vekalet ücreti
  PRINCIPAL = 'PRINCIPAL',         // Anapara
  OTHER = 'OTHER',
}

// ============================================
// LABELS
// ============================================

export const CollectionStatusLabels: Record<CollectionStatusEnum, string> = {
  [CollectionStatusEnum.PENDING]: 'Beklemede',
  [CollectionStatusEnum.CONFIRMED]: 'Onaylandı',
  [CollectionStatusEnum.CANCELLED]: 'İptal',
  [CollectionStatusEnum.REFUNDED]: 'İade Edildi',
};

export const CollectionTypeLabels: Record<CollectionTypeEnum, string> = {
  [CollectionTypeEnum.PAYMENT]: 'Ödeme',
  [CollectionTypeEnum.SEIZURE]: 'Haciz Tahsilatı',
  [CollectionTypeEnum.SALE]: 'Satış Tahsilatı',
  [CollectionTypeEnum.SETTLEMENT]: 'Sulh',
  [CollectionTypeEnum.REFUND]: 'İade',
  [CollectionTypeEnum.OTHER]: 'Diğer',
};

export const CollectionChannelLabels: Record<CollectionChannelEnum, string> = {
  [CollectionChannelEnum.BANK]: 'Banka',
  [CollectionChannelEnum.CASH]: 'Nakit',
  [CollectionChannelEnum.CHECK]: 'Çek',
  [CollectionChannelEnum.UYAP]: 'UYAP',
  [CollectionChannelEnum.PTT]: 'PTT',
  [CollectionChannelEnum.OTHER]: 'Diğer',
};

export const AllocationTypeLabels: Record<AllocationTypeEnum, string> = {
  [AllocationTypeEnum.INTEREST]: 'Faiz',
  [AllocationTypeEnum.FEE]: 'Harç',
  [AllocationTypeEnum.EXPENSE]: 'Masraf',
  [AllocationTypeEnum.ATTORNEY_FEE]: 'Vekalet Ücreti',
  [AllocationTypeEnum.PRINCIPAL]: 'Anapara',
  [AllocationTypeEnum.OTHER]: 'Diğer',
};

// ============================================
// DTOs
// ============================================

/**
 * Allocation (Mahsup) DTO
 * 
 * ⚠️ Bu değerler interest-engine/TBK100AllocatorService tarafından hesaplanır.
 * Collection modülü sadece sonucu saklar.
 */
export interface AllocationDTO {
  id?: string;
  collectionId: CollectionId;
  allocationType: AllocationTypeEnum;
  amount: Money;
  description?: string;
  
  /** Hesaplama kaynağı - her zaman 'interest-engine' olmalı */
  source: 'interest-engine' | 'legacy';
}

/**
 * Collection DTO - API response/request için
 */
export interface CollectionDTO {
  id: CollectionId;
  tenantId: TenantId;
  caseId: CaseId;
  caseDebtorId?: string;
  
  /** Tahsilat tutarı */
  amount: Money;
  
  /** Tahsilat tipi */
  type: CollectionTypeEnum;
  
  /** Tahsilat kanalı */
  channel: CollectionChannelEnum;
  
  /** Durum */
  status: CollectionStatusEnum;
  
  /** Tahsilat tarihi - ISO 8601 (YYYY-MM-DD) */
  date: string;
  
  /** Valör tarihi */
  valueDate?: string;
  
  /** Makbuz/Dekont no */
  receiptNo?: string;
  
  /** Banka bilgileri */
  bankName?: string;
  accountNo?: string;
  
  /** Açıklama */
  description?: string;
  
  /** Notlar */
  notes?: string;
  
  /**
   * Mahsup dağılımı - ÇEKİRDEKTEN GELİR
   * interest-engine/TBK100AllocatorService tarafından hesaplanır
   */
  allocations: AllocationDTO[];
  
  /** İptal bilgileri */
  cancelledAt?: string;
  cancelReason?: string;
  
  createdAt: string;
  updatedAt: string;
}

/**
 * Collection oluşturma request
 */
export interface CreateCollectionRequest {
  caseId: CaseId;
  caseDebtorId?: string;
  amount: Money;
  type: CollectionTypeEnum;
  channel: CollectionChannelEnum;
  date: string;
  valueDate?: string;
  receiptNo?: string;
  bankName?: string;
  accountNo?: string;
  description?: string;
  notes?: string;
  
  /**
   * Otomatik mahsup yapılsın mı?
   * true: interest-engine/TBK100AllocatorService çağrılır
   * false: Manuel allocation beklenir
   */
  autoAllocate?: boolean;
}

/**
 * Collection güncelleme request
 */
export interface UpdateCollectionRequest {
  amount?: Money;
  date?: string;
  description?: string;
  receiptNo?: string;
  notes?: string;
}

/**
 * Collection iptal request
 */
export interface CancelCollectionRequest {
  reason: string;
}

/**
 * Collection özet (liste için hafif)
 */
export interface CollectionSummaryDTO {
  id: CollectionId;
  caseId: CaseId;
  amount: Money;
  type: CollectionTypeEnum;
  channel: CollectionChannelEnum;
  status: CollectionStatusEnum;
  date: string;
  debtorName?: string;
}

/**
 * Dosya tahsilat özeti
 */
export interface CaseCollectionSummary {
  caseId: CaseId;
  
  /** Toplam onaylı tahsilat */
  totalConfirmed: Money;
  
  /** Bekleyen tahsilat */
  totalPending: Money;
  
  /** İptal edilen tahsilat */
  totalCancelled: Money;
  
  /** Tahsilat sayısı */
  collectionCount: number;
  
  /** Son tahsilat tarihi */
  lastCollectionDate?: string;
  
  /** Kanala göre dağılım */
  byChannel: Record<CollectionChannelEnum, Money>;
  
  /** Tipe göre dağılım */
  byType: Record<CollectionTypeEnum, Money>;
}

/**
 * Allocation sonucu - interest-engine'den döner
 * 
 * @see interest-engine/allocation/tbk100-allocator.service.ts
 */
export interface AllocationResult {
  /** Tahsilat ID */
  collectionId: CollectionId;
  
  /** Tahsilat tutarı */
  paymentAmount: Money;
  
  /** Dağıtım detayları */
  allocations: AllocationDTO[];
  
  /** Tahsilat sonrası kalan borç */
  remainingDebt: Money;
  
  /** Tahsilat sonrası kalan anapara */
  remainingPrincipal: Money;
  
  /** Hesaplama tarihi */
  calculatedAt: string;
  
  /** Hesaplama kaynağı */
  source: 'interest-engine';
}
