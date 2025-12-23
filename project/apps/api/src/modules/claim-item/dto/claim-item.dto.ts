import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsArray,
} from 'class-validator';

// Alacak Kalemi Türü
export enum ClaimItemType {
  PRINCIPAL = 'PRINCIPAL',
  INTEREST = 'INTEREST',
  PRE_INTEREST = 'PRE_INTEREST',
  POST_INTEREST = 'POST_INTEREST',
  EXPENSE = 'EXPENSE',
  FEE = 'FEE',
  ATTORNEY_FEE = 'ATTORNEY_FEE',
  PENALTY = 'PENALTY',
  CHECK_PENALTY = 'CHECK_PENALTY',
  CONTRACTUAL_PENALTY = 'CONTRACTUAL_PENALTY',
  TAX_KDV = 'TAX_KDV',
  TAX_BSMV = 'TAX_BSMV',
  TAX_KKDF = 'TAX_KKDF',
  OTHER = 'OTHER',
}

// Kaynak Belge Türü
export enum DocumentSourceType {
  FATURA = 'FATURA',
  CEK = 'CEK',
  SENET = 'SENET',
  KIRA = 'KIRA',
  SOZLESME = 'SOZLESME',
  ILAM = 'ILAM',
  KARAR = 'KARAR',
  BORC_SENEDI = 'BORC_SENEDI',
  KREDI = 'KREDI',
  DIGER = 'DIGER',
}

// Faiz Türü
export enum InterestType {
  YASAL = 'YASAL',
  TICARI = 'TICARI',
  AVANS = 'AVANS',
  OZEL = 'OZEL',
}

// Alacak Kalemi Durumu
export enum ClaimItemStatus {
  ACTIVE = 'ACTIVE',
  COLLECTED = 'COLLECTED',
  WAIVED = 'WAIVED',
  CANCELLED = 'CANCELLED',
}


// Alacak Kalemi Oluşturma DTO
export class CreateClaimItemDto {
  @IsString()
  caseId: string;

  @IsEnum(ClaimItemType)
  itemType: ClaimItemType;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  sourceDocumentId?: string;

  @IsOptional()
  @IsEnum(DocumentSourceType)
  sourceDocumentType?: DocumentSourceType;

  @IsOptional()
  @IsEnum(InterestType)
  interestType?: InterestType;

  @IsOptional()
  @IsNumber()
  interestRate?: number;

  @IsOptional()
  @IsDateString()
  interestStartDate?: string;

  @IsOptional()
  @IsDateString()
  interestEndDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsBoolean()
  isAllDebtorsLiable?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  liableDebtorIds?: string[];

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

// Alacak Kalemi Güncelleme DTO
export class UpdateClaimItemDto {
  @IsOptional()
  @IsEnum(ClaimItemType)
  itemType?: ClaimItemType;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(InterestType)
  interestType?: InterestType;

  @IsOptional()
  @IsNumber()
  interestRate?: number;

  @IsOptional()
  @IsDateString()
  interestStartDate?: string;

  @IsOptional()
  @IsDateString()
  interestEndDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsBoolean()
  isAllDebtorsLiable?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  liableDebtorIds?: string[];

  @IsOptional()
  @IsEnum(ClaimItemStatus)
  status?: ClaimItemStatus;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}


// Evraktan Otomatik Alacak Kalemi Oluşturma DTO
export class AutoGenerateClaimItemsDto {
  @IsString()
  caseId: string;

  @IsString()
  documentId: string;

  @IsEnum(DocumentSourceType)
  documentType: DocumentSourceType;

  // OCR'dan gelen veriler
  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsNumber()
  kdvAmount?: number;

  @IsOptional()
  @IsNumber()
  checkPenaltyRate?: number; // Çek tazminatı oranı (%10 veya %20)
}

// Faiz Hesaplama DTO
export class CalculateInterestDto {
  @IsNumber()
  principalAmount: number;

  @IsEnum(InterestType)
  interestType: InterestType;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  customRate?: number; // Özel faiz oranı

  @IsOptional()
  @IsString()
  currency?: string;
}

// Alacak Özeti Sonucu
export interface ClaimSummary {
  caseId: string;
  currency: string;
  items: {
    type: ClaimItemType;
    label: string;
    amount: number;
    count: number;
  }[];
  totals: {
    principal: number;
    preInterest: number;
    postInterest: number;
    totalInterest: number;
    expense: number;
    fee: number;
    attorneyFee: number;
    penalty: number;
    tax: number;
    other: number;
    grandTotal: number;
  };
  calculationDate: string;
}

// Faiz Hesaplama Sonucu
export interface InterestCalculationResult {
  principalAmount: number;
  interestType: string;
  rate: number;
  startDate: string;
  endDate: string;
  days: number;
  calculatedInterest: number;
  currency: string;
}
