import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

// Tahsilat Türü
export enum CollectionType {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  CHECK = "CHECK",
  OTHER = "OTHER",
}

// Tahsilat Kanalı
export enum CollectionChannel {
  NAKIT = "NAKIT",
  BANKA = "BANKA",
  CEK = "CEK",
  SENET = "SENET",
  KREDI_KARTI = "KREDI_KARTI",
  ICRA_DAIRESI = "ICRA_DAIRESI",
  HACIZ = "HACIZ",
  DIGER = "DIGER",
}

// Tahsilat Kaynağı
export enum CollectionSource {
  MANUAL = "MANUAL",
  EXTERNAL_CASE = "EXTERNAL_CASE",
  THIRD_PARTY = "THIRD_PARTY",
  BANK_SEIZURE = "BANK_SEIZURE",
  SALARY_SEIZURE = "SALARY_SEIZURE",
  AUCTION = "AUCTION",
  SETTLEMENT = "SETTLEMENT",
  BANK_INTEGRATION = "BANK_INTEGRATION", // Banka entegrasyonu (otomatik eşleşen hareket); BANK_SEIZURE ≠ bu
}

// Tahsilat Durumu
export enum CollectionStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

// Mahsup Türü
export enum AllocationType {
  PRINCIPAL = "PRINCIPAL",
  INTEREST = "INTEREST",
  EXPENSE = "EXPENSE",
  FEE = "FEE",
  ATTORNEY_FEE = "ATTORNEY_FEE",
  PENALTY = "PENALTY",
  OTHER = "OTHER",
}

// Mahsup Kaydı DTO
export class AllocationDto {
  @IsEnum(AllocationType)
  allocationType: AllocationType;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}

// Tahsilat Oluşturma DTO
export class CreateCollectionDto {
  @IsString()
  caseId: string;

  @IsOptional()
  @IsString()
  caseDebtorId?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsEnum(CollectionType)
  type: CollectionType;

  @IsOptional()
  @IsEnum(CollectionChannel)
  channel?: CollectionChannel;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  valueDate?: string;

  @IsOptional()
  @IsEnum(CollectionSource)
  sourceType?: CollectionSource;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  receiptNo?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNo?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Otomatik mahsup yapılsın mı?
  @IsOptional()
  autoAllocate?: boolean;

  // Manuel mahsup
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];
}

// Tahsilat Güncelleme DTO
export class UpdateCollectionDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  receiptNo?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// Tahsilat İptal DTO
export class CancelCollectionDto {
  @IsString()
  cancelReason: string;
}

// Kapak Hesabı (Dosya Borç Özeti)
export interface CoverCalculation {
  // Ana Alacak
  principalAmount: number;
  principalCurrency: string;
  
  // Faiz
  interestAmount: number;
  interestStartDate?: string;
  interestEndDate?: string;
  interestType?: string;
  
  // Masraflar
  expenseAmount: number;
  
  // Harçlar
  feeAmount: number;
  
  // Vekalet Ücreti
  attorneyFeeAmount: number;
  
  // Diğer
  otherAmount: number;
  
  // Toplam Alacak
  totalClaim: number;
  
  // Tahsilatlar
  totalCollected: number;
  collectionDetails: {
    principal: number;
    interest: number;
    expense: number;
    fee: number;
    attorneyFee: number;
    other: number;
  };
  
  // Kalan Borç
  remainingDebt: number;
  
  // Hesaplama Tarihi
  calculationDate: string;
}

// Tahsilat Özeti
export interface CollectionSummary {
  totalCollected: number;
  totalPending: number;
  totalCancelled: number;
  collectionCount: number;
  lastCollectionDate?: string;
  byChannel: Record<string, number>;
  bySource: Record<string, number>;
}
