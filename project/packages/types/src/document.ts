/**
 * Document Types - Belge/Evrak Tipleri
 * 
 * Kullanıcılar:
 * - document modülü
 * - template-engine modülü
 * - pdf modülü
 * - ocr modülü
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

import type { CaseId, ClientId, DebtorId } from './branded-ids';

// ==================== ENUMS ====================

/** Belge türü */
export enum DocumentTypeEnum {
  // Takip Belgeleri
  ORNEK_1 = 'ORNEK_1',           // Ödeme Emri
  ORNEK_4 = 'ORNEK_4',           // İcra Emri
  ORNEK_7 = 'ORNEK_7',           // Haciz Tutanağı
  ORNEK_10 = 'ORNEK_10',         // Satış İlanı
  
  // Evraklar
  VEKALETNAME = 'VEKALETNAME',
  TEBLIGAT = 'TEBLIGAT',
  HACIZ_IHBARNAMESI = 'HACIZ_IHBARNAMESI',
  MAAŞ_HACZI = 'MAAS_HACZI',
  
  // Kaynak Belgeler
  FATURA = 'FATURA',
  CEK = 'CEK',
  SENET = 'SENET',
  KIRA_SOZLESMESI = 'KIRA_SOZLESMESI',
  ILAM = 'ILAM',
  KARAR = 'KARAR',
  
  // Raporlar
  HESAP_OZETI = 'HESAP_OZETI',
  FAIZ_DOKUMU = 'FAIZ_DOKUMU',
  TAHSILAT_RAPORU = 'TAHSILAT_RAPORU',
  
  // Diğer
  DIGER = 'DIGER',
}

/** Belge durumu */
export enum DocumentStatusEnum {
  DRAFT = 'DRAFT',           // Taslak
  PENDING = 'PENDING',       // Onay bekliyor
  APPROVED = 'APPROVED',     // Onaylandı
  SENT = 'SENT',             // Gönderildi
  DELIVERED = 'DELIVERED',   // Teslim edildi
  CANCELLED = 'CANCELLED',   // İptal edildi
  ARCHIVED = 'ARCHIVED',     // Arşivlendi
}

/** Belge formatı */
export enum DocumentFormatEnum {
  PDF = 'PDF',
  DOCX = 'DOCX',
  HTML = 'HTML',
  XML = 'XML',
  JSON = 'JSON',
}

/** Belge kaynağı */
export enum DocumentSourceEnum {
  MANUAL = 'MANUAL',         // Manuel yükleme
  TEMPLATE = 'TEMPLATE',     // Şablondan oluşturuldu
  OCR = 'OCR',               // OCR ile tarandı
  UYAP = 'UYAP',             // UYAP'tan alındı
  EMAIL = 'EMAIL',           // E-posta eki
  API = 'API',               // API entegrasyonu
}

// ==================== DTOs ====================

/** Belge DTO */
export interface DocumentDTO {
  id: string;
  caseId: CaseId;
  
  /** Belge türü */
  documentType: DocumentTypeEnum;
  
  /** Belge adı */
  name: string;
  
  /** Açıklama */
  description?: string;
  
  /** Dosya yolu/URL */
  filePath?: string;
  fileUrl?: string;
  
  /** Dosya bilgileri */
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  format: DocumentFormatEnum;
  
  /** Durum */
  status: DocumentStatusEnum;
  
  /** Kaynak */
  source: DocumentSourceEnum;
  
  /** İlişkili kayıtlar */
  clientId?: ClientId;
  debtorId?: DebtorId;
  
  /** Şablon bilgisi */
  templateId?: string;
  templateVersion?: number;
  
  /** OCR bilgisi */
  ocrProcessed?: boolean;
  ocrConfidence?: number;
  extractedData?: Record<string, unknown>;
  
  /** Meta veriler */
  metadata?: Record<string, unknown>;
  tags?: string[];
  
  /** Tarihler */
  documentDate?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/** Belge oluşturma request */
export interface CreateDocumentRequest {
  caseId: string;
  documentType: DocumentTypeEnum;
  name: string;
  description?: string;
  format?: DocumentFormatEnum;
  source?: DocumentSourceEnum;
  clientId?: string;
  debtorId?: string;
  templateId?: string;
  documentDate?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

/** Şablon DTO */
export interface TemplateDTO {
  id: string;
  code: string;
  name: string;
  description?: string;
  documentType: DocumentTypeEnum;
  format: DocumentFormatEnum;
  
  /** Şablon içeriği */
  content?: string;
  filePath?: string;
  
  /** Versiyon */
  version: number;
  isActive: boolean;
  
  /** Değişkenler */
  variables: TemplateVariable[];
  
  /** Kullanım */
  caseTypes?: string[];
  
  createdAt: string;
  updatedAt: string;
}

/** Şablon değişkeni */
export interface TemplateVariable {
  name: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'money' | 'array';
  required: boolean;
  defaultValue?: unknown;
  source?: string;
}

/** Belge oluşturma sonucu */
export interface GenerateDocumentResult {
  documentId: string;
  fileName: string;
  fileUrl?: string;
  filePath?: string;
  format: DocumentFormatEnum;
  generatedAt: string;
}

// ==================== LABELS ====================

export const DocumentTypeLabels: Record<DocumentTypeEnum, string> = {
  [DocumentTypeEnum.ORNEK_1]: 'Örnek 1 - Ödeme Emri',
  [DocumentTypeEnum.ORNEK_4]: 'Örnek 4 - İcra Emri',
  [DocumentTypeEnum.ORNEK_7]: 'Örnek 7 - Haciz Tutanağı',
  [DocumentTypeEnum.ORNEK_10]: 'Örnek 10 - Satış İlanı',
  [DocumentTypeEnum.VEKALETNAME]: 'Vekaletname',
  [DocumentTypeEnum.TEBLIGAT]: 'Tebligat',
  [DocumentTypeEnum.HACIZ_IHBARNAMESI]: 'Haciz İhbarnamesi',
  [DocumentTypeEnum.MAAŞ_HACZI]: 'Maaş Haczi',
  [DocumentTypeEnum.FATURA]: 'Fatura',
  [DocumentTypeEnum.CEK]: 'Çek',
  [DocumentTypeEnum.SENET]: 'Senet',
  [DocumentTypeEnum.KIRA_SOZLESMESI]: 'Kira Sözleşmesi',
  [DocumentTypeEnum.ILAM]: 'İlam',
  [DocumentTypeEnum.KARAR]: 'Mahkeme Kararı',
  [DocumentTypeEnum.HESAP_OZETI]: 'Hesap Özeti',
  [DocumentTypeEnum.FAIZ_DOKUMU]: 'Faiz Dökümü',
  [DocumentTypeEnum.TAHSILAT_RAPORU]: 'Tahsilat Raporu',
  [DocumentTypeEnum.DIGER]: 'Diğer',
};

export const DocumentStatusLabels: Record<DocumentStatusEnum, string> = {
  [DocumentStatusEnum.DRAFT]: 'Taslak',
  [DocumentStatusEnum.PENDING]: 'Onay Bekliyor',
  [DocumentStatusEnum.APPROVED]: 'Onaylandı',
  [DocumentStatusEnum.SENT]: 'Gönderildi',
  [DocumentStatusEnum.DELIVERED]: 'Teslim Edildi',
  [DocumentStatusEnum.CANCELLED]: 'İptal Edildi',
  [DocumentStatusEnum.ARCHIVED]: 'Arşivlendi',
};
