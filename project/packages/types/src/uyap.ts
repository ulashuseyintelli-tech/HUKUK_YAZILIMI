/**
 * UYAP Types - UYAP Entegrasyon Tipleri
 * 
 * Kullanıcılar:
 * - uyap modülü
 * - uyap-export modülü
 * - icrabot modülü
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

import type { CaseId } from './branded-ids';

// ==================== ENUMS ====================

/** UYAP işlem türü */
export enum UyapOperationTypeEnum {
  // Takip İşlemleri
  TAKIP_AC = 'TAKIP_AC',                     // Takip Aç
  TAKIP_GUNCELLE = 'TAKIP_GUNCELLE',         // Takip Güncelle
  TAKIP_KAPAT = 'TAKIP_KAPAT',               // Takip Kapat
  
  // Evrak İşlemleri
  EVRAK_GONDER = 'EVRAK_GONDER',             // Evrak Gönder
  EVRAK_SORGULA = 'EVRAK_SORGULA',           // Evrak Sorgula
  
  // Haciz İşlemleri
  HACIZ_TALEP = 'HACIZ_TALEP',               // Haciz Talebi
  HACIZ_FEKK = 'HACIZ_FEKK',                 // Haciz Fekki
  
  // Sorgu İşlemleri
  MERNIS_SORGULA = 'MERNIS_SORGULA',         // MERNİS Sorgusu
  EGMTAKBIS_SORGULA = 'EGMTAKBIS_SORGULA',   // Tapu Sorgusu
  SGK_SORGULA = 'SGK_SORGULA',               // SGK Sorgusu
  BANKA_SORGULA = 'BANKA_SORGULA',           // Banka Sorgusu
  ARAC_SORGULA = 'ARAC_SORGULA',             // Araç Sorgusu
  
  // Diğer
  DIGER = 'DIGER',
}

/** UYAP işlem durumu */
export enum UyapOperationStatusEnum {
  PENDING = 'PENDING',           // Bekliyor
  PROCESSING = 'PROCESSING',     // İşleniyor
  SUCCESS = 'SUCCESS',           // Başarılı
  FAILED = 'FAILED',             // Başarısız
  CANCELLED = 'CANCELLED',       // İptal
  TIMEOUT = 'TIMEOUT',           // Zaman aşımı
}

/** UYAP bağlantı durumu */
export enum UyapConnectionStatusEnum {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  ERROR = 'ERROR',
}

/** UYAP hata türü */
export enum UyapErrorTypeEnum {
  CONNECTION = 'CONNECTION',     // Bağlantı hatası
  AUTH = 'AUTH',                 // Kimlik doğrulama hatası
  VALIDATION = 'VALIDATION',     // Validasyon hatası
  BUSINESS = 'BUSINESS',         // İş kuralı hatası
  SYSTEM = 'SYSTEM',             // Sistem hatası
  TIMEOUT = 'TIMEOUT',           // Zaman aşımı
}

// ==================== DTOs ====================

/** UYAP işlem DTO */
export interface UyapOperationDTO {
  id: string;
  caseId: CaseId;
  
  /** İşlem türü */
  operationType: UyapOperationTypeEnum;
  
  /** Durum */
  status: UyapOperationStatusEnum;
  
  /** UYAP referans numaraları */
  uyapDosyaNo?: string;
  uyapIslemNo?: string;
  uyapEvrakNo?: string;
  
  /** İstek/Yanıt */
  requestData?: Record<string, unknown>;
  responseData?: Record<string, unknown>;
  
  /** Hata bilgisi */
  errorType?: UyapErrorTypeEnum;
  errorCode?: string;
  errorMessage?: string;
  
  /** Tarihler */
  requestedAt: string;
  processedAt?: string;
  completedAt?: string;
  
  /** Retry bilgisi */
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  
  /** Meta veriler */
  metadata?: Record<string, unknown>;
  
  createdBy?: string;
}

/** UYAP export request */
export interface UyapExportRequest {
  caseId: string;
  operationType: UyapOperationTypeEnum;
  data: Record<string, unknown>;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

/** UYAP export sonucu */
export interface UyapExportResult {
  operationId: string;
  status: UyapOperationStatusEnum;
  uyapDosyaNo?: string;
  uyapIslemNo?: string;
  message?: string;
  errors?: UyapError[];
}

/** UYAP hata */
export interface UyapError {
  type: UyapErrorTypeEnum;
  code: string;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

/** UYAP validasyon sonucu */
export interface UyapValidationResult {
  isValid: boolean;
  errors: UyapValidationError[];
  warnings: UyapValidationWarning[];
}

export interface UyapValidationError {
  field: string;
  code: string;
  message: string;
}

export interface UyapValidationWarning {
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

/** UYAP sorgu sonucu */
export interface UyapQueryResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: UyapError;
  queryDate: string;
  source: string;
}

/** MERNİS sorgu sonucu */
export interface MernisQueryResult {
  tckn: string;
  name: string;
  surname: string;
  birthDate?: string;
  birthPlace?: string;
  fatherName?: string;
  motherName?: string;
  gender?: 'E' | 'K';
  maritalStatus?: string;
  addresses: MernisAddress[];
  isAlive: boolean;
  deathDate?: string;
}

export interface MernisAddress {
  type: 'YERLESIM' | 'DIGER';
  fullAddress: string;
  city: string;
  district: string;
  neighborhood?: string;
  street?: string;
  buildingNo?: string;
  apartmentNo?: string;
  postalCode?: string;
  registrationDate?: string;
}

/** Tapu sorgu sonucu */
export interface TapuQueryResult {
  tckn: string;
  properties: TapuProperty[];
}

export interface TapuProperty {
  tasinmazNo: string;
  il: string;
  ilce: string;
  mahalle: string;
  ada: string;
  parsel: string;
  nitelik: string;
  yuzolcumu?: number;
  hisseOrani?: string;
  edinmeTarihi?: string;
  ipotekVar: boolean;
  hacizVar: boolean;
}

/** SGK sorgu sonucu */
export interface SgkQueryResult {
  tckn: string;
  isActive: boolean;
  employer?: {
    name: string;
    sicilNo: string;
    city: string;
  };
  lastPaymentDate?: string;
  monthlyIncome?: number;
}

/** Araç sorgu sonucu */
export interface AracQueryResult {
  tckn: string;
  vehicles: Vehicle[];
}

export interface Vehicle {
  plaka: string;
  marka: string;
  model: string;
  modelYili: number;
  renk?: string;
  motorNo?: string;
  sasiNo?: string;
  tescilTarihi?: string;
  hacizVar: boolean;
  rehinVar: boolean;
}

/** UYAP bağlantı bilgisi */
export interface UyapConnectionInfo {
  status: UyapConnectionStatusEnum;
  lastConnectedAt?: string;
  lastErrorAt?: string;
  lastError?: string;
  sessionId?: string;
  expiresAt?: string;
}

// ==================== LABELS ====================

export const UyapOperationTypeLabels: Record<UyapOperationTypeEnum, string> = {
  [UyapOperationTypeEnum.TAKIP_AC]: 'Takip Aç',
  [UyapOperationTypeEnum.TAKIP_GUNCELLE]: 'Takip Güncelle',
  [UyapOperationTypeEnum.TAKIP_KAPAT]: 'Takip Kapat',
  [UyapOperationTypeEnum.EVRAK_GONDER]: 'Evrak Gönder',
  [UyapOperationTypeEnum.EVRAK_SORGULA]: 'Evrak Sorgula',
  [UyapOperationTypeEnum.HACIZ_TALEP]: 'Haciz Talebi',
  [UyapOperationTypeEnum.HACIZ_FEKK]: 'Haciz Fekki',
  [UyapOperationTypeEnum.MERNIS_SORGULA]: 'MERNİS Sorgusu',
  [UyapOperationTypeEnum.EGMTAKBIS_SORGULA]: 'Tapu Sorgusu',
  [UyapOperationTypeEnum.SGK_SORGULA]: 'SGK Sorgusu',
  [UyapOperationTypeEnum.BANKA_SORGULA]: 'Banka Sorgusu',
  [UyapOperationTypeEnum.ARAC_SORGULA]: 'Araç Sorgusu',
  [UyapOperationTypeEnum.DIGER]: 'Diğer',
};

export const UyapOperationStatusLabels: Record<UyapOperationStatusEnum, string> = {
  [UyapOperationStatusEnum.PENDING]: 'Bekliyor',
  [UyapOperationStatusEnum.PROCESSING]: 'İşleniyor',
  [UyapOperationStatusEnum.SUCCESS]: 'Başarılı',
  [UyapOperationStatusEnum.FAILED]: 'Başarısız',
  [UyapOperationStatusEnum.CANCELLED]: 'İptal',
  [UyapOperationStatusEnum.TIMEOUT]: 'Zaman Aşımı',
};
