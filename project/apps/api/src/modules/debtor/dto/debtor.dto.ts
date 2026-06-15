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
  IsInt,
  Min,
  Max,
  Allow,
} from "class-validator";
import { Type } from "class-transformer";

// ==================== ENUMS ====================

export enum DebtorType {
  INDIVIDUAL = "INDIVIDUAL",
  COMPANY = "COMPANY",
  PUBLIC_INSTITUTION = "PUBLIC_INSTITUTION",
  ESTATE = "ESTATE", // Tereke (Miras Ortaklığı)
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

// ==================== ESTATE HEIR DTO ====================

export class CreateEstateHeirDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  @Length(11, 11, { message: "TCKN 11 haneli olmalıdır" })
  @Matches(/^[0-9]+$/, { message: "TCKN sadece rakam içermelidir" })
  tckn?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  shareRatio?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;
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

  // === ESTATE (Tereke - Miras Ortaklığı) ===
  @IsString()
  @IsOptional()
  deceasedName?: string;

  @IsString()
  @IsOptional()
  @Length(11, 11, { message: "Muris TCKN 11 haneli olmalıdır" })
  @Matches(/^[0-9]+$/, { message: "Muris TCKN sadece rakam içermelidir" })
  deceasedTckn?: string;

  @IsDateString()
  @IsOptional()
  deathDate?: string;

  @IsString()
  @IsOptional()
  inheritanceDocPath?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEstateHeirDto)
  @IsOptional()
  estateHeirs?: CreateEstateHeirDto[];

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

  // === ADDRESS INTAKE MODE ===
  @IsBoolean()
  @IsOptional()
  clientConfirmed?: boolean; // Adresler müvekkilden alındı mı?
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

  // === ESTATE (Tereke) - PR-D2b: Debtor.update() içinde çözülür, ayrı endpoint yok ===
  @IsString()
  @IsOptional()
  deceasedName?: string;

  @IsString()
  @IsOptional()
  @Length(11, 11, { message: "Muris TCKN 11 haneli olmalıdır" })
  @Matches(/^[0-9]+$/, { message: "Muris TCKN sadece rakam içermelidir" })
  deceasedTckn?: string;

  @IsDateString()
  @IsOptional()
  deathDate?: string;

  @IsString()
  @IsOptional()
  inheritanceDocPath?: string;

  // estateHeirs gönderilirse mevcut mirasçı listesi REPLACE edilir (deleteMany+create, transaction).
  // Gönderilmezse mirasçılara dokunulmaz. (Ayrı incremental endpoint yok — ürün kararı.)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEstateHeirDto)
  @IsOptional()
  estateHeirs?: CreateEstateHeirDto[];

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

// ==================== DEBTOR INTELLIGENCE DTO (PR-D4e-3a) ====================

export enum DebtorIntelType {
  LOCATION_VERIFICATION = "LOCATION_VERIFICATION",
  ACTIVITY_CHECK = "ACTIVITY_CHECK",
  ASSET_SIGHTING = "ASSET_SIGHTING",
  NEIGHBOR_CONFIRM = "NEIGHBOR_CONFIRM",
}

export enum DebtorIntelResult {
  PENDING_VERIFICATION = "PENDING_VERIFICATION",
  IN_FIELD = "IN_FIELD",
  VERIFIED_PRESENT = "VERIFIED_PRESENT",
  VERIFIED_ABSENT = "VERIFIED_ABSENT",
  INCONCLUSIVE = "INCONCLUSIVE",
  NOT_FOUND = "NOT_FOUND",
}

export class CreateDebtorIntelligenceDto {
  @IsString()
  @IsOptional()
  addressId?: string;

  @IsString()
  @IsOptional()
  caseId?: string;

  @IsEnum(DebtorIntelType)
  intelType: DebtorIntelType;

  @IsEnum(DebtorIntelResult)
  result: DebtorIntelResult;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  confidence?: number;

  @Allow() // serbest Json (foto/koordinat referansları); whitelist'te korunur
  @IsOptional()
  evidence?: any;

  @IsString()
  @IsOptional()
  note?: string;
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
