/**
 * Tebligat Types - Tebligat/Bildirim Tipleri
 * 
 * Kullanıcılar:
 * - tebligat modülü
 * - scheduler modülü
 * - notification modülü
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

import type { CaseId, DebtorId } from './branded-ids';

// ==================== ENUMS ====================

/** Tebligat türü */
export enum TebligatTypeEnum {
  ODEME_EMRI = 'ODEME_EMRI',           // Ödeme Emri (Örnek 1)
  ICRA_EMRI = 'ICRA_EMRI',             // İcra Emri (Örnek 4)
  HACIZ_IHBARNAMESI = 'HACIZ_IHBARNAMESI', // Haciz İhbarnamesi
  SATIS_ILANI = 'SATIS_ILANI',         // Satış İlanı
  TAHLIYE_EMRI = 'TAHLIYE_EMRI',       // Tahliye Emri
  GENEL = 'GENEL',                     // Genel Tebligat
}

/** Tebligat durumu */
export enum TebligatStatusEnum {
  DRAFT = 'DRAFT',               // Taslak
  READY = 'READY',               // Hazır
  SENT = 'SENT',                 // Gönderildi
  IN_TRANSIT = 'IN_TRANSIT',     // Yolda
  DELIVERED = 'DELIVERED',       // Tebliğ Edildi
  RETURNED = 'RETURNED',         // İade
  MUHTAR = 'MUHTAR',             // Muhtara Teslim (TK 21/2)
  ANNOUNCEMENT = 'ANNOUNCEMENT', // İlan Yoluyla
  FAILED = 'FAILED',             // Başarısız
  CANCELLED = 'CANCELLED',       // İptal
}

/** Tebligat kanalı */
export enum TebligatChannelEnum {
  PTT = 'PTT',                   // PTT ile fiziksel
  KEP = 'KEP',                   // Kayıtlı Elektronik Posta
  UETS = 'UETS',                 // Ulusal Elektronik Tebligat
  ELDEN = 'ELDEN',               // Elden teslim
  ILAN = 'ILAN',                 // İlan yoluyla
}

/** İade sebebi */
export enum TebligatReturnReasonEnum {
  ADDRESS_NOT_FOUND = 'ADDRESS_NOT_FOUND',   // Adres bulunamadı
  MOVED = 'MOVED',                           // Taşınmış
  REFUSED = 'REFUSED',                       // Tebellüğden imtina
  DECEASED = 'DECEASED',                     // Vefat
  COMPANY_CLOSED = 'COMPANY_CLOSED',         // Şirket kapanmış
  UNCLAIMED = 'UNCLAIMED',                   // Alınmadı/sahipsiz
  WRONG_ADDRESS = 'WRONG_ADDRESS',           // Yanlış adres
  NO_SUCH_PERSON = 'NO_SUCH_PERSON',         // Böyle biri yok
  OTHER = 'OTHER',                           // Diğer
}

/** Tebligat önceliği */
export enum TebligatPriorityEnum {
  NORMAL = 'NORMAL',
  URGENT = 'URGENT',
  EXPRESS = 'EXPRESS',
}

// ==================== DTOs ====================

/** Tebligat DTO */
export interface TebligatDTO {
  id: string;
  caseId: CaseId;
  debtorId: DebtorId;
  
  /** Tebligat türü */
  type: TebligatTypeEnum;
  
  /** Durum */
  status: TebligatStatusEnum;
  
  /** Kanal */
  channel: TebligatChannelEnum;
  
  /** Öncelik */
  priority: TebligatPriorityEnum;
  
  /** Adres bilgileri */
  address: TebligatAddressDTO;
  
  /** Takip numaraları */
  trackingNo?: string;
  barcodeNo?: string;
  
  /** Tarihler */
  preparedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  returnedAt?: string;
  
  /** İade bilgisi */
  returnReason?: TebligatReturnReasonEnum;
  returnNote?: string;
  
  /** Tebliğ alan bilgisi */
  receivedBy?: string;
  receiverRelation?: string;
  
  /** Belge referansı */
  documentId?: string;
  
  /** Notlar */
  notes?: string;
  
  /** Meta veriler */
  metadata?: Record<string, unknown>;
  
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/** Tebligat adresi */
export interface TebligatAddressDTO {
  fullAddress: string;
  street?: string;
  buildingNo?: string;
  apartmentNo?: string;
  district?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  
  /** Adres türü */
  addressType?: 'HOME' | 'WORK' | 'REGISTERED' | 'OTHER';
  
  /** Adres kaynağı */
  source?: 'MANUAL' | 'MERNIS' | 'UYAP' | 'CLIENT';
  
  /** Doğrulama */
  isVerified?: boolean;
  verifiedAt?: string;
}

/** Tebligat oluşturma request */
export interface CreateTebligatRequest {
  caseId: string;
  debtorId: string;
  type: TebligatTypeEnum;
  channel: TebligatChannelEnum;
  priority?: TebligatPriorityEnum;
  address: TebligatAddressDTO;
  documentId?: string;
  notes?: string;
}

/** Tebligat güncelleme request */
export interface UpdateTebligatRequest {
  status?: TebligatStatusEnum;
  trackingNo?: string;
  sentAt?: string;
  deliveredAt?: string;
  returnedAt?: string;
  returnReason?: TebligatReturnReasonEnum;
  returnNote?: string;
  receivedBy?: string;
  receiverRelation?: string;
  notes?: string;
}

/** PTT takip sonucu */
export interface PttTrackingResult {
  barcodeNo: string;
  status: string;
  statusCode: string;
  lastUpdate: string;
  events: PttTrackingEvent[];
}

export interface PttTrackingEvent {
  date: string;
  location: string;
  status: string;
  description: string;
}

/** Tebligat özeti */
export interface TebligatSummaryDTO {
  total: number;
  delivered: number;
  pending: number;
  returned: number;
  failed: number;
  byChannel: Record<TebligatChannelEnum, number>;
  byStatus: Record<TebligatStatusEnum, number>;
}

// ==================== LABELS ====================

export const TebligatTypeLabels: Record<TebligatTypeEnum, string> = {
  [TebligatTypeEnum.ODEME_EMRI]: 'Ödeme Emri',
  [TebligatTypeEnum.ICRA_EMRI]: 'İcra Emri',
  [TebligatTypeEnum.HACIZ_IHBARNAMESI]: 'Haciz İhbarnamesi',
  [TebligatTypeEnum.SATIS_ILANI]: 'Satış İlanı',
  [TebligatTypeEnum.TAHLIYE_EMRI]: 'Tahliye Emri',
  [TebligatTypeEnum.GENEL]: 'Genel Tebligat',
};

export const TebligatStatusLabels: Record<TebligatStatusEnum, string> = {
  [TebligatStatusEnum.DRAFT]: 'Taslak',
  [TebligatStatusEnum.READY]: 'Hazır',
  [TebligatStatusEnum.SENT]: 'Gönderildi',
  [TebligatStatusEnum.IN_TRANSIT]: 'Yolda',
  [TebligatStatusEnum.DELIVERED]: 'Tebliğ Edildi',
  [TebligatStatusEnum.RETURNED]: 'İade',
  [TebligatStatusEnum.MUHTAR]: 'Muhtara Teslim',
  [TebligatStatusEnum.ANNOUNCEMENT]: 'İlan Yoluyla',
  [TebligatStatusEnum.FAILED]: 'Başarısız',
  [TebligatStatusEnum.CANCELLED]: 'İptal',
};

export const TebligatChannelLabels: Record<TebligatChannelEnum, string> = {
  [TebligatChannelEnum.PTT]: 'PTT',
  [TebligatChannelEnum.KEP]: 'KEP',
  [TebligatChannelEnum.UETS]: 'UETS',
  [TebligatChannelEnum.ELDEN]: 'Elden Teslim',
  [TebligatChannelEnum.ILAN]: 'İlan Yoluyla',
};

export const TebligatReturnReasonLabels: Record<TebligatReturnReasonEnum, string> = {
  [TebligatReturnReasonEnum.ADDRESS_NOT_FOUND]: 'Adres bulunamadı',
  [TebligatReturnReasonEnum.MOVED]: 'Taşınmış',
  [TebligatReturnReasonEnum.REFUSED]: 'Tebellüğden imtina',
  [TebligatReturnReasonEnum.DECEASED]: 'Vefat',
  [TebligatReturnReasonEnum.COMPANY_CLOSED]: 'Şirket kapanmış',
  [TebligatReturnReasonEnum.UNCLAIMED]: 'Alınmadı',
  [TebligatReturnReasonEnum.WRONG_ADDRESS]: 'Yanlış adres',
  [TebligatReturnReasonEnum.NO_SUCH_PERSON]: 'Böyle biri yok',
  [TebligatReturnReasonEnum.OTHER]: 'Diğer',
};
