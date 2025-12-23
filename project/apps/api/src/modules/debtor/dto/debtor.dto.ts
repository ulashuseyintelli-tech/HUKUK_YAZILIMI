import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
  Length,
  Matches,
  IsDateString,
} from "class-validator";
import { Type } from "class-transformer";

// ==================== ENUMS ====================

export enum DebtorType {
  INDIVIDUAL = "INDIVIDUAL",
  COMPANY = "COMPANY",
  PUBLIC_INSTITUTION = "PUBLIC_INSTITUTION",
}

export enum DebtorRiskLevel {
  DUSUK = "DUSUK",
  ORTA = "ORTA",
  YUKSEK = "YUKSEK",
  COK_YUKSEK = "COK_YUKSEK",
}

export enum PublicInstitutionType {
  BAKANLIK = "BAKANLIK",
  BELEDIYE = "BELEDIYE",
  IL_OZEL_IDARESI = "IL_OZEL_IDARESI",
  UNIVERSITE = "UNIVERSITE",
  KIT = "KIT",
  DIGER_KAMU = "DIGER_KAMU",
}

export enum AddressType {
  EV = "EV",
  IS = "IS",
  TEBLIGAT = "TEBLIGAT",
  MERNIS = "MERNIS",
  KEP = "KEP",
}

// ==================== ADDRESS DTO ====================

export class CreateDebtorAddressDto {
  @IsEnum(AddressType)
  addressType: AddressType;

  @IsString()
  street: string;

  @IsString()
  city: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsBoolean()
  @IsOptional()
  isMernis?: boolean;
}

export class UpdateDebtorAddressDto {
  @IsEnum(AddressType)
  @IsOptional()
  addressType?: AddressType;

  @IsString()
  @IsOptional()
  street?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsBoolean()
  @IsOptional()
  isMernis?: boolean;
}

// ==================== DEBTOR DTO ====================

export class CreateDebtorDto {
  @IsEnum(DebtorType)
  type: DebtorType;

  // === INDIVIDUAL (Gerçek Kişi) ===
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  @Length(11, 11, { message: "TCKN 11 haneli olmalıdır" })
  @Matches(/^[0-9]+$/, { message: "TCKN sadece rakam içermelidir" })
  tckn?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  fatherName?: string;

  @IsString()
  @IsOptional()
  motherName?: string;

  @IsString()
  @IsOptional()
  birthPlace?: string;

  // === COMPANY (Tüzel Kişi) ===
  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  @Length(10, 10, { message: "VKN 10 haneli olmalıdır" })
  @Matches(/^[0-9]+$/, { message: "VKN sadece rakam içermelidir" })
  vkn?: string;

  @IsString()
  @IsOptional()
  taxOffice?: string;

  @IsString()
  @IsOptional()
  mersisNo?: string;

  @IsString()
  @IsOptional()
  tradeRegisterNo?: string;

  // === PUBLIC_INSTITUTION (Kamu Kurumu) ===
  @IsString()
  @IsOptional()
  institutionName?: string;

  @IsString()
  @IsOptional()
  detsisNo?: string;

  @IsEnum(PublicInstitutionType)
  @IsOptional()
  institutionType?: PublicInstitutionType;

  @IsString()
  @IsOptional()
  parentInstitution?: string;

  @IsString()
  @IsOptional()
  authorizedPerson?: string;

  // === İLETİŞİM ===
  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  kepAddress?: string;

  // === RİSK ===
  @IsEnum(DebtorRiskLevel)
  @IsOptional()
  riskLevel?: DebtorRiskLevel;

  @IsString()
  @IsOptional()
  riskNotes?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  // === ADRESLER ===
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDebtorAddressDto)
  @IsOptional()
  addresses?: CreateDebtorAddressDto[];
}

export class UpdateDebtorDto {
  @IsEnum(DebtorType)
  @IsOptional()
  type?: DebtorType;

  // === INDIVIDUAL ===
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  @Length(11, 11, { message: "TCKN 11 haneli olmalıdır" })
  @Matches(/^[0-9]+$/, { message: "TCKN sadece rakam içermelidir" })
  tckn?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  fatherName?: string;

  @IsString()
  @IsOptional()
  motherName?: string;

  @IsString()
  @IsOptional()
  birthPlace?: string;

  // === COMPANY ===
  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  @Length(10, 10, { message: "VKN 10 haneli olmalıdır" })
  @Matches(/^[0-9]+$/, { message: "VKN sadece rakam içermelidir" })
  vkn?: string;

  @IsString()
  @IsOptional()
  taxOffice?: string;

  @IsString()
  @IsOptional()
  mersisNo?: string;

  @IsString()
  @IsOptional()
  tradeRegisterNo?: string;

  // === PUBLIC_INSTITUTION ===
  @IsString()
  @IsOptional()
  institutionName?: string;

  @IsString()
  @IsOptional()
  detsisNo?: string;

  @IsEnum(PublicInstitutionType)
  @IsOptional()
  institutionType?: PublicInstitutionType;

  @IsString()
  @IsOptional()
  parentInstitution?: string;

  @IsString()
  @IsOptional()
  authorizedPerson?: string;

  // === İLETİŞİM ===
  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  kepAddress?: string;

  // === RİSK ===
  @IsEnum(DebtorRiskLevel)
  @IsOptional()
  riskLevel?: DebtorRiskLevel;

  @IsString()
  @IsOptional()
  riskNotes?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

// ==================== SEARCH & FILTER DTO ====================

export class SearchDebtorsDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(DebtorType)
  @IsOptional()
  type?: DebtorType;

  @IsEnum(DebtorRiskLevel)
  @IsOptional()
  riskLevel?: DebtorRiskLevel;

  @IsString()
  @IsOptional()
  city?: string;
}

// ==================== DUPLICATE CHECK DTO ====================

export class CheckDuplicateDto {
  @IsEnum(DebtorType)
  type: DebtorType;

  @IsString()
  @IsOptional()
  tckn?: string;

  @IsString()
  @IsOptional()
  vkn?: string;

  @IsString()
  @IsOptional()
  detsisNo?: string;
}
