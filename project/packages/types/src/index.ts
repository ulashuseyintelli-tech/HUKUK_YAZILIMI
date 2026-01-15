// ==================== CORE TYPES ====================

// Money - Para tipi (float TL YASAK)
export * from './money';

// Branded IDs - String karışıklığını önler
export * from './branded-ids';

// Domain Types
export * from './case';
export * from './debtor';
export * from './client';
export * from './collection';
export * from './document';
export * from './tebligat';
export * from './uyap';
export * from './task';

// Engine Types
export * from './interest';
export * from './policy';
export * from './fee';

// ==================== ENUMS ====================

export enum Plan {
  FREE = "FREE",
  PRO = "PRO",
  ENTERPRISE = "ENTERPRISE",
}

export enum UserRole {
  ADMIN = "ADMIN",
  USER = "USER",
  VIEWER = "VIEWER",
}

export enum ClientType {
  INDIVIDUAL = "INDIVIDUAL",
  COMPANY = "COMPANY",
}

export enum DebtorType {
  INDIVIDUAL = "INDIVIDUAL",
  COMPANY = "COMPANY",
}

export enum CaseType {
  GENERAL_EXECUTION = "GENERAL_EXECUTION",
  MORTGAGE = "MORTGAGE",
  PLEDGE = "PLEDGE",
  BANKRUPTCY = "BANKRUPTCY",
  CHECK = "CHECK",
  BOND = "BOND",
  RENTAL = "RENTAL",
  OTHER = "OTHER",
}

export enum CaseStatus {
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
  SUSPENDED = "SUSPENDED",
  ARCHIVED = "ARCHIVED",
}

export enum TaskStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum Priority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

// ==================== INTERFACES ====================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  settings?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  surname: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Client {
  id: string;
  tenantId: string;
  type: ClientType;
  name: string;
  identityNo?: string;
  taxOffice?: string;
  email?: string;
  phone?: string;
  address?: Record<string, any>;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Debtor {
  id: string;
  tenantId: string;
  type: DebtorType;
  name: string;
  identityNo?: string;
  taxOffice?: string;
  email?: string;
  phone?: string;
  addresses?: Record<string, any>;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Case {
  id: string;
  tenantId: string;
  fileNumber: string;
  executionFileNumber?: string;
  type: CaseType;
  status: CaseStatus;
  clientId?: string;
  courtId?: string;
  principalAmount?: number;
  interestRate?: number;
  startDate?: Date;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  tenantId: string;
  caseId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: Date;
  assigneeId?: string;
  createdById?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== API TYPES ====================

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

// ==================== LABELS ====================

export const CaseTypeLabels: Record<CaseType, string> = {
  [CaseType.GENERAL_EXECUTION]: "Genel Haciz Yolu",
  [CaseType.MORTGAGE]: "İpotekli Takip",
  [CaseType.PLEDGE]: "Rehinli Takip",
  [CaseType.BANKRUPTCY]: "İflas Yolu",
  [CaseType.CHECK]: "Çek Takibi",
  [CaseType.BOND]: "Senet Takibi",
  [CaseType.RENTAL]: "Kira Takibi",
  [CaseType.OTHER]: "Diğer",
};

export const CaseStatusLabels: Record<CaseStatus, string> = {
  [CaseStatus.ACTIVE]: "Aktif",
  [CaseStatus.CLOSED]: "Kapalı",
  [CaseStatus.SUSPENDED]: "Askıda",
  [CaseStatus.ARCHIVED]: "Arşivlenmiş",
};

export const TaskStatusLabels: Record<TaskStatus, string> = {
  [TaskStatus.PENDING]: "Bekliyor",
  [TaskStatus.IN_PROGRESS]: "Devam Ediyor",
  [TaskStatus.COMPLETED]: "Tamamlandı",
  [TaskStatus.CANCELLED]: "İptal Edildi",
};

export const PriorityLabels: Record<Priority, string> = {
  [Priority.LOW]: "Düşük",
  [Priority.MEDIUM]: "Orta",
  [Priority.HIGH]: "Yüksek",
  [Priority.URGENT]: "Acil",
};


// ==================== BORÇLU MODÜLÜ ====================

// Tebligat Durumu
export enum ServiceStatus {
  NOT_STARTED = "NOT_STARTED",     // Hiç hazırlanmadı/çıkmadı
  READY = "READY",                 // Tebliğ evrağı hazır
  SENT = "SENT",                   // PTT/elektronik gönderildi
  DELIVERED = "DELIVERED",         // Tebliğ edildi
  RETURNED = "RETURNED",           // İade
  MUHTAR = "MUHTAR",               // Muhtara teslim (TK 21/2)
  ANNOUNCEMENT = "ANNOUNCEMENT",   // İlan yoluyla
  FAILED = "FAILED",               // Teknik/işlemsel hata
  UNKNOWN = "UNKNOWN",             // Eski kayıt/migrasyon
}

// Tebligat İade Sebebi
export enum ServiceReturnReason {
  ADDRESS_NOT_FOUND = "ADDRESS_NOT_FOUND",   // Adres bulunamadı
  MOVED = "MOVED",                           // Taşınmış
  REFUSED = "REFUSED",                       // Tebellüğden imtina
  DECEASED = "DECEASED",                     // Vefat
  COMPANY_CLOSED = "COMPANY_CLOSED",         // Şirket kapanmış
  UNCLAIMED = "UNCLAIMED",                   // Alınmadı/sahipsiz
  OTHER = "OTHER",                           // Diğer
}

// Tebligat Kanalı
export enum ServiceChannel {
  PHYSICAL = "PHYSICAL",   // PTT ile fiziksel
  KEP = "KEP",             // Kayıtlı Elektronik Posta
  UETS = "UETS",           // Ulusal Elektronik Tebligat
  UNKNOWN = "UNKNOWN",
}

// Malvarlığı Sorgu Durumu
export enum AssetQueryStatus {
  UNKNOWN = "UNKNOWN",   // Sorgu yapılmadı
  YES = "YES",           // Var
  NO = "NO",             // Yok
  PENDING = "PENDING",   // Sorgu devam ediyor
  ERROR = "ERROR",       // Sorgu hatası
}

// Borçlu Rolü
export enum DebtorRole {
  ASIL_BORCLU = "ASIL_BORCLU",           // Asıl Borçlu
  MUSTEREK_BORCLU = "MUSTEREK_BORCLU",   // Müşterek Borçlu
  KEFIL = "KEFIL",                       // Kefil
  AVALIST = "AVALIST",                   // Aval Veren
  MIRASCI = "MIRASCI",                   // Mirasçı
  TEMSILCI = "TEMSILCI",                 // Temsilci
  DIGER = "DIGER",                       // Diğer
}

// Alert Seviyesi
export enum AlertLevel {
  NONE = "NONE",
  INFO = "INFO",
  WARN = "WARN",
  DANGER = "DANGER",
}

// Borçlu Issue Kodları
export type DebtorIssueCode =
  | "MISSING_ADDRESS"
  | "MISSING_TCKN"
  | "MISSING_VKN"
  | "NO_CONTACT"
  | "SERVICE_NOT_STARTED"
  | "SERVICE_STUCK"
  | "RETURN_REASON_MISSING"
  | "DELIVERED_DATE_MISSING"
  | "SERVICE_FAILED"
  | "RISK_CONCORDAT"
  | "RISK_BANKRUPTCY"
  | "RISK_ADDRESS_SUSPECT"
  | "STALE_30D"
  | "NO_ASSET_QUERY";

// Borçlu Issue
export interface DebtorIssue {
  code: DebtorIssueCode;
  level: AlertLevel;
  label: string;
}

// Tebligat Bilgisi DTO
export interface ServiceDTO {
  status: ServiceStatus;
  channel?: ServiceChannel;
  trackingNo?: string;
  sentAt?: string;
  deliveredAt?: string;
  returnedAt?: string;
  returnReason?: ServiceReturnReason;
}

// Malvarlığı Bilgisi DTO
export interface AssetsDTO {
  vehicle: AssetQueryStatus;
  realEstate: AssetQueryStatus;
  bank: AssetQueryStatus;
  sgkWage: AssetQueryStatus;
  lastQueryAt?: string;
}

// Borçlu Liste Item DTO (hafif - liste için)
export interface DebtorListItemDTO {
  id: string;
  caseDebtorId: string;
  displayName: string;
  personType: "REAL" | "LEGAL";
  role: DebtorRole;
  identityMasked?: string;
  phoneMasked?: string;
  addressShort?: string;
  serviceStatus: ServiceStatus;
  alertCount: number;
  alertLevel: AlertLevel;
}

// Borçlu Detay DTO (tam - drawer için)
export interface DebtorDetailDTO extends DebtorListItemDTO {
  emailMasked?: string;
  service: ServiceDTO;
  assets: AssetsDTO;
  riskFlags: string[];
  staleDays?: number;
  quickNote?: string;
  issues: DebtorIssue[];
}

// Borçlu Özet DTO (panel üstü şerit)
export interface DebtorsSummaryDTO {
  total: number;
  delivered: number;
  pending: number;
  returned: number;
  danger: number;
}

// Tebligat Güncelleme Request
export interface UpdateServiceRequest {
  status: ServiceStatus;
  channel?: ServiceChannel;
  trackingNo?: string;
  sentAt?: string;
  deliveredAt?: string;
  returnedAt?: string;
  returnReason?: ServiceReturnReason;
  note?: string;
}

// Borçlu Not Güncelleme Request
export interface UpdateDebtorNoteRequest {
  text: string;
}

// ==================== BORÇLU LABELS ====================

export const ServiceStatusLabels: Record<ServiceStatus, string> = {
  [ServiceStatus.NOT_STARTED]: "Başlatılmadı",
  [ServiceStatus.READY]: "Hazır",
  [ServiceStatus.SENT]: "Gönderildi",
  [ServiceStatus.DELIVERED]: "Tebliğ Edildi",
  [ServiceStatus.RETURNED]: "İade",
  [ServiceStatus.MUHTAR]: "Muhtara Teslim",
  [ServiceStatus.ANNOUNCEMENT]: "İlan Yoluyla",
  [ServiceStatus.FAILED]: "Başarısız",
  [ServiceStatus.UNKNOWN]: "Bilinmiyor",
};

export const ServiceReturnReasonLabels: Record<ServiceReturnReason, string> = {
  [ServiceReturnReason.ADDRESS_NOT_FOUND]: "Adres bulunamadı",
  [ServiceReturnReason.MOVED]: "Taşınmış",
  [ServiceReturnReason.REFUSED]: "Tebellüğden imtina",
  [ServiceReturnReason.DECEASED]: "Vefat",
  [ServiceReturnReason.COMPANY_CLOSED]: "Şirket kapanmış",
  [ServiceReturnReason.UNCLAIMED]: "Alınmadı",
  [ServiceReturnReason.OTHER]: "Diğer",
};

export const DebtorRoleLabels: Record<DebtorRole, string> = {
  [DebtorRole.ASIL_BORCLU]: "Asıl Borçlu",
  [DebtorRole.MUSTEREK_BORCLU]: "Müşterek Borçlu",
  [DebtorRole.KEFIL]: "Kefil",
  [DebtorRole.AVALIST]: "Avalist",
  [DebtorRole.MIRASCI]: "Mirasçı",
  [DebtorRole.TEMSILCI]: "Temsilci",
  [DebtorRole.DIGER]: "Diğer",
};

export const AlertLevelLabels: Record<AlertLevel, string> = {
  [AlertLevel.NONE]: "Yok",
  [AlertLevel.INFO]: "Bilgi",
  [AlertLevel.WARN]: "Uyarı",
  [AlertLevel.DANGER]: "Kritik",
};

export const DebtorIssueLabelMap: Record<DebtorIssueCode, string> = {
  MISSING_ADDRESS: "Adres eksik",
  MISSING_TCKN: "TCKN eksik",
  MISSING_VKN: "VKN eksik",
  NO_CONTACT: "İletişim bilgisi yok",
  SERVICE_NOT_STARTED: "Tebligat başlatılmadı",
  SERVICE_STUCK: "Tebligat takılı (7+ gün)",
  RETURN_REASON_MISSING: "İade sebebi girilmedi",
  DELIVERED_DATE_MISSING: "Tebliğ tarihi eksik",
  SERVICE_FAILED: "Tebligat başarısız",
  RISK_CONCORDAT: "Konkordato riski",
  RISK_BANKRUPTCY: "İflas riski",
  RISK_ADDRESS_SUSPECT: "Adres şüpheli",
  STALE_30D: "30+ gündür işlem yok",
  NO_ASSET_QUERY: "Malvarlığı sorgusu yapılmadı",
};
