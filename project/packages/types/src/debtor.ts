/**
 * Debtor (Borçlu) Domain Types
 * 
 * Tüm borçlu ile ilgili tipler burada tanımlı.
 * Modüller arası iletişimde bu tipler kullanılmalı.
 * 
 * @see ARCHITECTURE.md - Shared Contracts
 */

import { DebtorId, CaseId, TenantId } from './branded-ids';

// ============================================
// ENUMS
// ============================================

export enum DebtorTypeEnum {
  REAL = 'REAL',       // Gerçek kişi
  LEGAL = 'LEGAL',     // Tüzel kişi
}

export enum DebtorRoleEnum {
  ASIL_BORCLU = 'ASIL_BORCLU',
  MUSTEREK_BORCLU = 'MUSTEREK_BORCLU',
  KEFIL = 'KEFIL',
  AVALIST = 'AVALIST',
  MIRASCI = 'MIRASCI',
  TEMSILCI = 'TEMSILCI',
  DIGER = 'DIGER',
}

export enum ServiceStatusEnum {
  NOT_STARTED = 'NOT_STARTED',
  READY = 'READY',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
  MUHTAR = 'MUHTAR',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
}

export enum ServiceChannelEnum {
  PHYSICAL = 'PHYSICAL',
  KEP = 'KEP',
  UETS = 'UETS',
  UNKNOWN = 'UNKNOWN',
}

export enum ServiceReturnReasonEnum {
  ADDRESS_NOT_FOUND = 'ADDRESS_NOT_FOUND',
  MOVED = 'MOVED',
  REFUSED = 'REFUSED',
  DECEASED = 'DECEASED',
  COMPANY_CLOSED = 'COMPANY_CLOSED',
  UNCLAIMED = 'UNCLAIMED',
  OTHER = 'OTHER',
}

export enum AssetQueryStatusEnum {
  UNKNOWN = 'UNKNOWN',
  YES = 'YES',
  NO = 'NO',
  PENDING = 'PENDING',
  ERROR = 'ERROR',
}

// ============================================
// LABELS
// ============================================

export const DebtorTypeLabels: Record<DebtorTypeEnum, string> = {
  [DebtorTypeEnum.REAL]: 'Gerçek Kişi',
  [DebtorTypeEnum.LEGAL]: 'Tüzel Kişi',
};

export const DebtorRoleLabelsNew: Record<DebtorRoleEnum, string> = {
  [DebtorRoleEnum.ASIL_BORCLU]: 'Asıl Borçlu',
  [DebtorRoleEnum.MUSTEREK_BORCLU]: 'Müşterek Borçlu',
  [DebtorRoleEnum.KEFIL]: 'Kefil',
  [DebtorRoleEnum.AVALIST]: 'Avalist',
  [DebtorRoleEnum.MIRASCI]: 'Mirasçı',
  [DebtorRoleEnum.TEMSILCI]: 'Temsilci',
  [DebtorRoleEnum.DIGER]: 'Diğer',
};

export const ServiceStatusLabelsNew: Record<ServiceStatusEnum, string> = {
  [ServiceStatusEnum.NOT_STARTED]: 'Başlatılmadı',
  [ServiceStatusEnum.READY]: 'Hazır',
  [ServiceStatusEnum.SENT]: 'Gönderildi',
  [ServiceStatusEnum.DELIVERED]: 'Tebliğ Edildi',
  [ServiceStatusEnum.RETURNED]: 'İade',
  [ServiceStatusEnum.MUHTAR]: 'Muhtara Teslim',
  [ServiceStatusEnum.ANNOUNCEMENT]: 'İlan Yoluyla',
  [ServiceStatusEnum.FAILED]: 'Başarısız',
  [ServiceStatusEnum.UNKNOWN]: 'Bilinmiyor',
};

// ============================================
// DTOs
// ============================================

/**
 * Adres DTO
 */
export interface AddressDTO {
  id?: string;
  type: 'HOME' | 'WORK' | 'MERNIS' | 'OTHER';
  fullAddress: string;
  city?: string;
  district?: string;
  postalCode?: string;
  isVerified: boolean;
  source?: 'MANUAL' | 'MERNIS' | 'UYAP' | 'OTHER';
  verifiedAt?: string;
}

/**
 * Debtor DTO - API response/request için
 */
export interface DebtorDTO {
  id: DebtorId;
  tenantId: TenantId;
  
  debtorType: DebtorTypeEnum;
  
  /** Görünen ad */
  displayName: string;
  
  /** Gerçek kişi için */
  firstName?: string;
  lastName?: string;
  tckn?: string;
  
  /** Tüzel kişi için */
  companyName?: string;
  vkn?: string;
  taxOffice?: string;
  
  /** İletişim */
  email?: string;
  phone?: string;
  
  /** Adresler */
  addresses: AddressDTO[];
  
  /** Notlar */
  notes?: string;
  
  createdAt: string;
  updatedAt: string;
}

/**
 * Case-Debtor ilişkisi DTO
 */
export interface CaseDebtorDTO {
  id: string;
  caseId: CaseId;
  debtorId: DebtorId;
  role: DebtorRoleEnum;
  
  /** Tebligat durumu */
  serviceStatus: ServiceStatusEnum;
  serviceChannel?: ServiceChannelEnum;
  serviceSentAt?: string;
  serviceDeliveredAt?: string;
  serviceReturnedAt?: string;
  serviceReturnReason?: ServiceReturnReasonEnum;
  
  /** Malvarlığı sorgu durumları */
  assetVehicle: AssetQueryStatusEnum;
  assetRealEstate: AssetQueryStatusEnum;
  assetBank: AssetQueryStatusEnum;
  assetSgkWage: AssetQueryStatusEnum;
  lastAssetQueryAt?: string;
  
  /** Risk bayrakları */
  riskFlags: string[];
  
  /** Alert sayısı */
  alertCount: number;
  alertLevel: 'NONE' | 'INFO' | 'WARN' | 'DANGER';
  
  /** Borçlu detayı (join) */
  debtor?: DebtorDTO;
}

/**
 * Debtor oluşturma request
 */
export interface CreateDebtorRequest {
  debtorType: DebtorTypeEnum;
  firstName?: string;
  lastName?: string;
  tckn?: string;
  companyName?: string;
  vkn?: string;
  taxOffice?: string;
  email?: string;
  phone?: string;
  addresses?: Omit<AddressDTO, 'id'>[];
  notes?: string;
}

/**
 * Debtor güncelleme request
 */
export interface UpdateDebtorRequest {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

/**
 * Tebligat güncelleme request
 */
export interface UpdateServiceStatusRequest {
  status: ServiceStatusEnum;
  channel?: ServiceChannelEnum;
  trackingNo?: string;
  sentAt?: string;
  deliveredAt?: string;
  returnedAt?: string;
  returnReason?: ServiceReturnReasonEnum;
  note?: string;
}
