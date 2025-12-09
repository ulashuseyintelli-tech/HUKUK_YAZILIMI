import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";

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

export class LawyerDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  name: string;

  @IsString()
  surname: string;

  @IsString()
  @IsOptional()
  barNumber?: string;

  @IsBoolean()
  @IsOptional()
  canSign?: boolean;
}

export class PartyDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  type: "INDIVIDUAL" | "COMPANY";

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  identityNo?: string;

  @IsString()
  @IsOptional()
  taxOffice?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;
}

export enum ExecutionPath {
  HACIZ = "HACIZ",
  IFLAS = "IFLAS",
  REHIN = "REHIN",
  IPOTEK = "IPOTEK",
  TAHLIYE = "TAHLIYE",
}

export enum LegalCaseStatus {
  DERDEST = "DERDEST",
  ISLEMDE = "ISLEMDE",
  DERKENAR = "DERKENAR",
  HITAM = "HITAM",
  INFAZ = "INFAZ",
  MUVEKKILE_IADE = "MUVEKKILE_IADE",
  ACIZ = "ACIZ",
  BATAK = "BATAK",
  MAHSUP = "MAHSUP",
  TEMLIK = "TEMLIK",
}

// Alt Kategori - UYAP Uyumlu
export enum CaseSubCategory {
  GENEL = "GENEL",
  NAFAKA = "NAFAKA",
  DOVIZ = "DOVIZ",
  KIRA = "KIRA",
  CEZA = "CEZA",
}

// Para Birimi
export enum Currency {
  TRY = "TRY",
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
  CHF = "CHF",
}

// Faiz Türü
export enum InterestType {
  YASAL = "YASAL",
  SABIT = "SABIT",
  AVANS = "AVANS",
  TEMERRUT = "TEMERRUT",
  YOKSUN = "YOKSUN",
}

// OCR Tespit Edilen Takip Türü
export enum DetectedCaseType {
  ILAMLI = "ILAMLI",
  ILAMSIZ = "ILAMSIZ",
  KAMBIYO = "KAMBIYO",
  KIRA = "KIRA",
  IPOTEK = "IPOTEK",
  REHIN = "REHIN",
  UNKNOWN = "UNKNOWN",
}

export enum DueType {
  PRINCIPAL = "PRINCIPAL",
  INTEREST = "INTEREST",
  EXPENSE = "EXPENSE",
  OTHER = "OTHER",
}

export class DueDto {
  @IsEnum(DueType)
  type: DueType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  amount: number;

  @IsDateString()
  dueDate: string;
}

export class CreateCaseDto {
  @IsString()
  fileNumber: string;

  @IsString()
  @IsOptional()
  executionFileNumber?: string;

  @IsEnum(CaseType)
  type: CaseType;

  @IsString()
  @IsOptional()
  subType?: string;

  @IsEnum(CaseStatus)
  @IsOptional()
  status?: CaseStatus;

  // Yeni alanlar - Takip Yolu
  @IsEnum(ExecutionPath)
  @IsOptional()
  executionPath?: ExecutionPath;

  // Yeni alanlar - Hukuki Statü
  @IsEnum(LegalCaseStatus)
  @IsOptional()
  caseStatus?: LegalCaseStatus;

  // İcra Dairesi
  @IsString()
  @IsOptional()
  executionOfficeId?: string;

  // UYAP Kodu
  @IsString()
  @IsOptional()
  uyapBirimKodu?: string;

  // 4. Madde Talep
  @IsBoolean()
  @IsOptional()
  hasArticle4Request?: boolean;

  // Alt Kategori (Genel/Nafaka/Döviz)
  @IsEnum(CaseSubCategory)
  @IsOptional()
  subCategory?: CaseSubCategory;

  // Para Birimi
  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

  // MTS Dosyası
  @IsBoolean()
  @IsOptional()
  isMtsCase?: boolean;

  @IsString()
  @IsOptional()
  mtsReferenceNo?: string;

  // Faiz Bilgileri
  @IsEnum(InterestType)
  @IsOptional()
  interestType?: InterestType;

  @IsDateString()
  @IsOptional()
  interestStartDate?: string;

  @IsString()
  @IsOptional()
  interestDescription?: string;

  // Döviz Alacağı Bilgileri
  @IsDateString()
  @IsOptional()
  exchangeDate?: string;

  @IsString()
  @IsOptional()
  exchangeRateType?: "TAKIP_TARIHI" | "ODEME_TARIHI";

  // Nafaka Bilgileri
  @IsDateString()
  @IsOptional()
  nafakaStartDate?: string;

  @IsNumber()
  @IsOptional()
  monthlyNafakaAmount?: number;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  courtId?: string;

  @IsNumber()
  @IsOptional()
  principalAmount?: number;

  @IsNumber()
  @IsOptional()
  interestRate?: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LawyerDto)
  @IsOptional()
  lawyers?: LawyerDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyDto)
  @IsOptional()
  creditors?: PartyDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyDto)
  @IsOptional()
  debtors?: PartyDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DueDto)
  @IsOptional()
  dues?: DueDto[];

  // OCR / Belge Tarama Bilgileri
  @IsString()
  @IsOptional()
  preDetectedCaseType?: string;

  @IsString()
  @IsOptional()
  preDetectedSubCategory?: string;

  @IsString()
  @IsOptional()
  ocrText?: string;

  @IsBoolean()
  @IsOptional()
  isAutoDetected?: boolean;

  @IsNumber()
  @IsOptional()
  confidenceScore?: number;

  @IsString()
  @IsOptional()
  sourceDocumentId?: string;

  @IsOptional()
  detectionKeywords?: string[];
}

export class UpdateCaseDto {
  @IsString()
  @IsOptional()
  fileNumber?: string;

  @IsString()
  @IsOptional()
  executionFileNumber?: string;

  @IsEnum(CaseType)
  @IsOptional()
  type?: CaseType;

  @IsString()
  @IsOptional()
  subType?: string;

  @IsEnum(CaseStatus)
  @IsOptional()
  status?: CaseStatus;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  courtId?: string;

  @IsNumber()
  @IsOptional()
  principalAmount?: number;

  @IsNumber()
  @IsOptional()
  interestRate?: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
