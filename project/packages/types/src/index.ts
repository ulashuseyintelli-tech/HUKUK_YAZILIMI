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
