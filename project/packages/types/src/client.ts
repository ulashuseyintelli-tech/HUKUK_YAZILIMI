/**
 * Client (Müvekkil) Domain Types
 * 
 * Tüm müvekkil ile ilgili tipler burada tanımlı.
 * Modüller arası iletişimde bu tipler kullanılmalı.
 * 
 * @see ARCHITECTURE.md - Shared Contracts
 */

import { ClientId, TenantId } from './branded-ids';

// ============================================
// ENUMS
// ============================================

export enum ClientTypeEnum {
  INDIVIDUAL = 'INDIVIDUAL',   // Gerçek kişi
  COMPANY = 'COMPANY',         // Şirket
  INSTITUTION = 'INSTITUTION', // Kurum
}

export enum ClientStatusEnum {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

// ============================================
// LABELS
// ============================================

export const ClientTypeLabels: Record<ClientTypeEnum, string> = {
  [ClientTypeEnum.INDIVIDUAL]: 'Gerçek Kişi',
  [ClientTypeEnum.COMPANY]: 'Şirket',
  [ClientTypeEnum.INSTITUTION]: 'Kurum',
};

export const ClientStatusLabels: Record<ClientStatusEnum, string> = {
  [ClientStatusEnum.ACTIVE]: 'Aktif',
  [ClientStatusEnum.INACTIVE]: 'Pasif',
  [ClientStatusEnum.SUSPENDED]: 'Askıda',
};

// ============================================
// DTOs
// ============================================

/**
 * Client DTO - API response/request için
 */
export interface ClientDTO {
  id: ClientId;
  tenantId: TenantId;
  
  clientType: ClientTypeEnum;
  status: ClientStatusEnum;
  
  /** Görünen ad */
  displayName: string;
  
  /** Resmi ad */
  name: string;
  
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
  fax?: string;
  website?: string;
  
  /** Adres */
  address?: {
    fullAddress: string;
    city?: string;
    district?: string;
    postalCode?: string;
  };
  
  /** Banka bilgileri */
  bankName?: string;
  iban?: string;
  
  /** Yetkili kişi (şirket için) */
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  
  /** Notlar */
  notes?: string;
  
  /** İstatistikler */
  activeCaseCount?: number;
  totalCaseCount?: number;
  
  createdAt: string;
  updatedAt: string;
}

/**
 * Client oluşturma request
 */
export interface CreateClientRequest {
  clientType: ClientTypeEnum;
  name: string;
  firstName?: string;
  lastName?: string;
  tckn?: string;
  companyName?: string;
  vkn?: string;
  taxOffice?: string;
  email?: string;
  phone?: string;
  fax?: string;
  website?: string;
  address?: {
    fullAddress: string;
    city?: string;
    district?: string;
    postalCode?: string;
  };
  bankName?: string;
  iban?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
}

/**
 * Client güncelleme request
 */
export interface UpdateClientRequest {
  name?: string;
  status?: ClientStatusEnum;
  email?: string;
  phone?: string;
  fax?: string;
  website?: string;
  address?: {
    fullAddress: string;
    city?: string;
    district?: string;
    postalCode?: string;
  };
  bankName?: string;
  iban?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
}

/**
 * Client özet (liste için hafif)
 */
export interface ClientSummaryDTO {
  id: ClientId;
  displayName: string;
  clientType: ClientTypeEnum;
  status: ClientStatusEnum;
  phone?: string;
  email?: string;
  activeCaseCount: number;
}

/**
 * Client seçim listesi için
 */
export interface ClientSelectOption {
  id: ClientId;
  displayName: string;
  clientType: ClientTypeEnum;
}
