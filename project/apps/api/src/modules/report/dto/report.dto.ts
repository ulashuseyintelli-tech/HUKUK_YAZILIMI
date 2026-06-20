import { IsString, IsOptional, IsDateString, IsEnum, IsArray } from "class-validator";

// Rapor Türleri
export enum ReportType {
  CASE_DEBT = "CASE_DEBT",           // Dosya borç raporu
  INTEREST = "INTEREST",              // Faiz raporu
  COLLECTION_HISTORY = "COLLECTION_HISTORY", // Tahsilat geçmişi
  DEBTOR_SUMMARY = "DEBTOR_SUMMARY",  // Borçlu özeti
  CASE_SUMMARY = "CASE_SUMMARY",      // Dosya özeti
  EXPENSE_REPORT = "EXPENSE_REPORT",  // Masraf raporu
}

// Rapor Formatı
export enum ReportFormat {
  JSON = "JSON",
  PDF = "PDF",
  EXCEL = "EXCEL",
}

// Dosya Borç Raporu İsteği
export class CaseDebtReportDto {
  @IsString()
  caseId: string;

  @IsOptional()
  @IsDateString()
  calculationDate?: string;

  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;
}

// Faiz Raporu İsteği
export class InterestReportDto {
  @IsString()
  caseId: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;
}

// Tahsilat Geçmişi Raporu İsteği
export class CollectionHistoryReportDto {
  @IsOptional()
  @IsString()
  caseId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  statuses?: string[];

  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;
}

// Genel Rapor Filtresi
export class ReportFilterDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  caseId?: string;

  @IsOptional()
  @IsString()
  debtorId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}

// ==================== RAPOR SONUÇLARI ====================

// Dosya Borç Raporu Sonucu
export interface CaseDebtReportResult {
  caseInfo: {
    id: string;
    fileNumber: string;
    executionFileNumber?: string;
    clientName: string;
    status: string;
    openDate: string;
  };
  debtors: {
    id: string;
    caseDebtorId: string;
    name: string;
    tcNo?: string;
    role: string;
    lifecycleStatus: "ACTIVE" | "PASSIVE";
    lifecycleLabel: string;
  }[];
  claimDetails: {
    principalAmount: number;
    currency: string;
    interestAmount: number;
    interestRate?: number;
    interestType?: string;
    interestStartDate?: string;
    interestEndDate: string;
    expenseAmount: number;
    feeAmount: number;
    attorneyFeeAmount: number;
    otherAmount: number;
    totalClaim: number;
  };
  collectionDetails: {
    totalCollected: number;
    collectionCount: number;
    byType: Record<string, number>;
    lastCollectionDate?: string;
  };
  balance: {
    remainingDebt: number;
    remainingPrincipal: number;
    remainingInterest: number;
    remainingExpense: number;
    remainingFee: number;
    remainingAttorneyFee: number;
  };
  calculationDate: string;
  generatedAt: string;
}

// Faiz Raporu Sonucu
export interface InterestReportResult {
  caseInfo: {
    id: string;
    fileNumber: string;
    principalAmount: number;
    currency: string;
  };
  interestDetails: {
    type: string;
    rate: number;
    startDate: string;
    endDate: string;
    days: number;
    calculatedAmount: number;
  };
  dailyBreakdown?: {
    date: string;
    principal: number;
    rate: number;
    dailyInterest: number;
    cumulativeInterest: number;
  }[];
  summary: {
    totalDays: number;
    averageRate: number;
    totalInterest: number;
  };
  generatedAt: string;
}

// Tahsilat Geçmişi Raporu Sonucu
export interface CollectionHistoryReportResult {
  summary: {
    totalCollected: number;
    totalPending: number;
    totalCancelled: number;
    collectionCount: number;
    averageAmount: number;
  };
  byChannel: {
    channel: string;
    count: number;
    total: number;
    percentage: number;
  }[];
  bySource: {
    source: string;
    count: number;
    total: number;
    percentage: number;
  }[];
  byMonth: {
    month: string;
    count: number;
    total: number;
  }[];
  collections: {
    id: string;
    date: string;
    amount: number;
    currency: string;
    channel: string;
    source?: string;
    status: string;
    caseFileNumber?: string;
    caseDebtorId?: string;
    caseDebtorLifecycleStatus?: "ACTIVE" | "PASSIVE";
    caseDebtorLifecycleLabel?: string;
    description?: string;
  }[];
  generatedAt: string;
}

// Dashboard Özet Raporu
export interface DashboardSummaryResult {
  cases: {
    total: number;
    active: number;
    closed: number;
    newThisMonth: number;
  };
  collections: {
    totalThisMonth: number;
    totalThisYear: number;
    pendingAmount: number;
    collectionRate: number;
  };
  debtors: {
    total: number;
    withActiveCase: number;
  };
  upcomingDeadlines: {
    id: string;
    caseFileNumber: string;
    type: string;
    date: string;
    description: string;
  }[];
  recentActivity: {
    type: string;
    description: string;
    date: string;
    caseId?: string;
  }[];
}
