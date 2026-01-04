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

  // Kimlik Bilgileri
  @IsString()
  @IsOptional()
  tckn?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  // Mesleki Bilgiler
  @IsString()
  @IsOptional()
  barNumber?: string;

  @IsString()
  @IsOptional()
  barCity?: string;

  @IsString()
  @IsOptional()
  tbbNo?: string;

  // Vergi Bilgileri
  @IsString()
  @IsOptional()
  vergiDairesi?: string;

  @IsString()
  @IsOptional()
  vergiNo?: string;

  // İletişim
  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  // Banka Bilgileri
  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  iban?: string;

  // Statü
  @IsBoolean()
  @IsOptional()
  isInHouseCounsel?: boolean;

  @IsBoolean()
  @IsOptional()
  isEmployee?: boolean;

  @IsBoolean()
  @IsOptional()
  canSign?: boolean;

  @IsBoolean()
  @IsOptional()
  isResponsible?: boolean;

  @IsBoolean()
  @IsOptional()
  hasSignatureAuthority?: boolean;
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

// Yeni CaseDebtor DTO - Gelişmiş borçlu bilgileri
export class CaseDebtorDto {
  @IsString()
  debtorId: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsNumber()
  @IsOptional()
  liabilityAmount?: number;

  @IsString()
  @IsOptional()
  liabilityType?: string;

  @IsString()
  @IsOptional()
  notificationMode?: string;

  @IsString()
  @IsOptional()
  selectedAddressId?: string;

  @IsBoolean()
  @IsOptional()
  prepareNotification?: boolean;

  @IsString()
  @IsOptional()
  ilanenJustification?: string;

  @IsString()
  @IsOptional()
  caseNote?: string;
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
  AZIL = "AZIL",
  FERAGAT = "FERAGAT",
  SULH = "SULH",
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
  TICARI = "TICARI",
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

  // Yeni CaseDebtor formatı - Gelişmiş borçlu bilgileri
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CaseDebtorDto)
  @IsOptional()
  caseDebtors?: CaseDebtorDto[];

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

  // Lookup Alanları
  @IsString()
  @IsOptional()
  takipTuruId?: string;

  @IsString()
  @IsOptional()
  asamaId?: string;

  @IsString()
  @IsOptional()
  riskId?: string;

  @IsString()
  @IsOptional()
  borcluTipiId?: string;

  @IsString()
  @IsOptional()
  durumEtiketiId?: string;

  @IsString()
  @IsOptional()
  mahiyetTipiId?: string;

  @IsString()
  @IsOptional()
  mahiyetKodu?: string;

  @IsString()
  @IsOptional()
  sorumluPersonelId?: string;

  @IsString()
  @IsOptional()
  dahiliNot?: string;

  @IsString()
  @IsOptional()
  muvekkilNotu?: string;
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

  @IsEnum(LegalCaseStatus)
  @IsOptional()
  caseStatus?: LegalCaseStatus;

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

  @IsDateString()
  @IsOptional()
  caseDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
