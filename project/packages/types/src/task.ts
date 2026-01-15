/**
 * Task Types - Görev/İş Tipleri
 * 
 * Kullanıcılar:
 * - task modülü
 * - scheduler modülü
 * - automation modülü
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

import type { CaseId, DebtorId, ClientId } from './branded-ids';

// ==================== ENUMS ====================

/** Görev türü */
export enum TaskTypeEnum {
  // Tebligat görevleri
  TEBLIGAT_HAZIRLA = 'TEBLIGAT_HAZIRLA',
  TEBLIGAT_TAKIP = 'TEBLIGAT_TAKIP',
  TEBLIGAT_IADE = 'TEBLIGAT_IADE',
  
  // Haciz görevleri
  HACIZ_TALEP = 'HACIZ_TALEP',
  HACIZ_TAKIP = 'HACIZ_TAKIP',
  
  // Sorgu görevleri
  ADRES_ARASTIRMA = 'ADRES_ARASTIRMA',
  MALVARLIK_SORGULA = 'MALVARLIK_SORGULA',
  
  // Tahsilat görevleri
  TAHSILAT_TAKIP = 'TAHSILAT_TAKIP',
  ODEME_HATIRLATMA = 'ODEME_HATIRLATMA',
  
  // Belge görevleri
  BELGE_HAZIRLA = 'BELGE_HAZIRLA',
  BELGE_GONDER = 'BELGE_GONDER',
  
  // UYAP görevleri
  UYAP_GONDER = 'UYAP_GONDER',
  UYAP_SORGULA = 'UYAP_SORGULA',
  
  // Genel
  MANUEL = 'MANUEL',
  HATIRLATMA = 'HATIRLATMA',
  DIGER = 'DIGER',
}

/** Görev durumu */
export enum TaskStatusEnum {
  PENDING = 'PENDING',           // Bekliyor
  IN_PROGRESS = 'IN_PROGRESS',   // Devam ediyor
  COMPLETED = 'COMPLETED',       // Tamamlandı
  CANCELLED = 'CANCELLED',       // İptal edildi
  FAILED = 'FAILED',             // Başarısız
  ON_HOLD = 'ON_HOLD',           // Beklemede
  OVERDUE = 'OVERDUE',           // Gecikmiş
}

/** Görev önceliği */
export enum TaskPriorityEnum {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

/** Görev kaynağı */
export enum TaskSourceEnum {
  MANUAL = 'MANUAL',             // Manuel oluşturuldu
  SYSTEM = 'SYSTEM',             // Sistem tarafından
  AUTOMATION = 'AUTOMATION',     // Otomasyon kuralı
  SCHEDULER = 'SCHEDULER',       // Zamanlayıcı
  TRIGGER = 'TRIGGER',           // Stage trigger
}

/** Tekrar türü */
export enum TaskRecurrenceEnum {
  NONE = 'NONE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM',
}

// ==================== DTOs ====================

/** Görev DTO */
export interface TaskDTO {
  id: string;
  tenantId: string;
  
  /** İlişkili kayıtlar */
  caseId?: CaseId;
  debtorId?: DebtorId;
  clientId?: ClientId;
  
  /** Görev bilgileri */
  type: TaskTypeEnum;
  title: string;
  description?: string;
  
  /** Durum ve öncelik */
  status: TaskStatusEnum;
  priority: TaskPriorityEnum;
  
  /** Kaynak */
  source: TaskSourceEnum;
  sourceId?: string;
  
  /** Atama */
  assigneeId?: string;
  assigneeName?: string;
  
  /** Tarihler */
  dueDate?: string;
  startDate?: string;
  completedAt?: string;
  
  /** Tekrar */
  recurrence: TaskRecurrenceEnum;
  recurrenceConfig?: RecurrenceConfig;
  
  /** İlerleme */
  progress?: number;
  checklist?: TaskChecklistItem[];
  
  /** Bağımlılıklar */
  dependsOn?: string[];
  blockedBy?: string[];
  
  /** Notlar ve ekler */
  notes?: string;
  attachments?: TaskAttachment[];
  
  /** Meta veriler */
  metadata?: Record<string, unknown>;
  tags?: string[];
  
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/** Tekrar yapılandırması */
export interface RecurrenceConfig {
  interval: number;
  unit: 'day' | 'week' | 'month';
  daysOfWeek?: number[];
  dayOfMonth?: number;
  endDate?: string;
  maxOccurrences?: number;
}

/** Görev checklist öğesi */
export interface TaskChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
}

/** Görev eki */
export interface TaskAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy?: string;
}

/** Görev oluşturma request */
export interface CreateTaskRequest {
  caseId?: string;
  debtorId?: string;
  clientId?: string;
  type: TaskTypeEnum;
  title: string;
  description?: string;
  priority?: TaskPriorityEnum;
  assigneeId?: string;
  dueDate?: string;
  recurrence?: TaskRecurrenceEnum;
  recurrenceConfig?: RecurrenceConfig;
  checklist?: { title: string }[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** Görev güncelleme request */
export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatusEnum;
  priority?: TaskPriorityEnum;
  assigneeId?: string;
  dueDate?: string;
  progress?: number;
  notes?: string;
  tags?: string[];
}

/** Görev özeti */
export interface TaskSummaryDTO {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  byType: Record<TaskTypeEnum, number>;
  byPriority: Record<TaskPriorityEnum, number>;
  byAssignee: Record<string, number>;
}

/** Görev filtresi */
export interface TaskFilter {
  caseId?: string;
  debtorId?: string;
  assigneeId?: string;
  status?: TaskStatusEnum[];
  priority?: TaskPriorityEnum[];
  type?: TaskTypeEnum[];
  dueDateFrom?: string;
  dueDateTo?: string;
  tags?: string[];
}

// ==================== AUTOMATION ====================

/** Otomasyon kuralı */
export interface AutomationRuleDTO {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  
  /** Tetikleyici */
  trigger: AutomationTrigger;
  
  /** Koşullar */
  conditions: AutomationCondition[];
  
  /** Aksiyonlar */
  actions: AutomationAction[];
  
  /** Öncelik */
  priority: number;
  
  /** İstatistikler */
  executionCount: number;
  lastExecutedAt?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface AutomationTrigger {
  type: 'EVENT' | 'SCHEDULE' | 'MANUAL';
  event?: string;
  schedule?: string;
}

export interface AutomationCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  value: unknown;
}

export interface AutomationAction {
  type: 'CREATE_TASK' | 'UPDATE_CASE' | 'SEND_NOTIFICATION' | 'CALL_API';
  config: Record<string, unknown>;
}

// ==================== LABELS ====================

export const TaskTypeLabels: Record<TaskTypeEnum, string> = {
  [TaskTypeEnum.TEBLIGAT_HAZIRLA]: 'Tebligat Hazırla',
  [TaskTypeEnum.TEBLIGAT_TAKIP]: 'Tebligat Takip',
  [TaskTypeEnum.TEBLIGAT_IADE]: 'Tebligat İade İşlemi',
  [TaskTypeEnum.HACIZ_TALEP]: 'Haciz Talebi',
  [TaskTypeEnum.HACIZ_TAKIP]: 'Haciz Takip',
  [TaskTypeEnum.ADRES_ARASTIRMA]: 'Adres Araştırma',
  [TaskTypeEnum.MALVARLIK_SORGULA]: 'Malvarlığı Sorgula',
  [TaskTypeEnum.TAHSILAT_TAKIP]: 'Tahsilat Takip',
  [TaskTypeEnum.ODEME_HATIRLATMA]: 'Ödeme Hatırlatma',
  [TaskTypeEnum.BELGE_HAZIRLA]: 'Belge Hazırla',
  [TaskTypeEnum.BELGE_GONDER]: 'Belge Gönder',
  [TaskTypeEnum.UYAP_GONDER]: 'UYAP Gönder',
  [TaskTypeEnum.UYAP_SORGULA]: 'UYAP Sorgula',
  [TaskTypeEnum.MANUEL]: 'Manuel Görev',
  [TaskTypeEnum.HATIRLATMA]: 'Hatırlatma',
  [TaskTypeEnum.DIGER]: 'Diğer',
};

export const TaskStatusLabels: Record<TaskStatusEnum, string> = {
  [TaskStatusEnum.PENDING]: 'Bekliyor',
  [TaskStatusEnum.IN_PROGRESS]: 'Devam Ediyor',
  [TaskStatusEnum.COMPLETED]: 'Tamamlandı',
  [TaskStatusEnum.CANCELLED]: 'İptal Edildi',
  [TaskStatusEnum.FAILED]: 'Başarısız',
  [TaskStatusEnum.ON_HOLD]: 'Beklemede',
  [TaskStatusEnum.OVERDUE]: 'Gecikmiş',
};

export const TaskPriorityLabels: Record<TaskPriorityEnum, string> = {
  [TaskPriorityEnum.LOW]: 'Düşük',
  [TaskPriorityEnum.MEDIUM]: 'Orta',
  [TaskPriorityEnum.HIGH]: 'Yüksek',
  [TaskPriorityEnum.URGENT]: 'Acil',
};
