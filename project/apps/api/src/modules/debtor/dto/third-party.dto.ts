import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
} from "class-validator";
import { ExternalCaseStatus } from "@prisma/client";

// ==================== ENUMS ====================

export enum ThirdPartyType {
  ISVEREN = "ISVEREN",
  BANKA = "BANKA",
  KIRACI = "KIRACI",
  BORC_ALACAKLI = "BORC_ALACAKLI",
  DIGER = "DIGER",
}

export enum IhbarnameStatus {
  GONDERILDI = "GONDERILDI",
  TEBLIG_EDILDI = "TEBLIG_EDILDI",
  CEVAP_ALINDI = "CEVAP_ALINDI",
  CEVAPSIZ = "CEVAPSIZ",
}

// ==================== DTOs ====================

export class CreateThirdPartyDto {
  @IsEnum(ThirdPartyType)
  type: ThirdPartyType;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  identityNo?: string;

  @IsString()
  address: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  kepAddress?: string;

  @IsString()
  @IsOptional()
  relationDesc?: string;
}

export class UpdateThirdPartyDto {
  @IsEnum(ThirdPartyType)
  @IsOptional()
  type?: ThirdPartyType;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  identityNo?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  kepAddress?: string;

  @IsString()
  @IsOptional()
  relationDesc?: string;
}

export class RecordIhbarnameDto {
  @IsEnum(["89_1", "89_2", "89_3"])
  ihbarnameType: "89_1" | "89_2" | "89_3";

  @IsDateString()
  date: string;

  @IsEnum(IhbarnameStatus)
  @IsOptional()
  status?: IhbarnameStatus;
}

export class RecordResponseDto {
  @IsDateString()
  responseDate: string;

  @IsString()
  responseContent: string;
}

// I15 Phase C: updateExternalCase() daha once `dto: any` idi (hicbir DTO/
// class-validator yoktu). main.ts'deki global ValidationPipe (whitelist +
// forbidNonWhitelisted + transform) zaten aktif oldugundan bu DTO'yu eklemek
// gercek runtime korumasi saglar: gecersiz attachmentStatus veya bilinmeyen
// alan artik ham Prisma hatasi yerine temiz 400 doner. Full transition-
// legality (hangi durumdan hangisine gecilebilir) hicbir governance/DBP
// belgesinde tanimli degil — icad EDILMEDI, yalniz enum uyeligi dogrulanir.
export class UpdateExternalCaseDto {
  @IsString()
  @IsOptional()
  externalOffice?: string;

  @IsString()
  @IsOptional()
  externalCaseNo?: string;

  @IsString()
  @IsOptional()
  counterpartyName?: string;

  @IsNumber()
  @IsOptional()
  claimAmount?: number;

  @IsString()
  @IsOptional()
  claimCurrency?: string;

  @IsEnum(ExternalCaseStatus)
  @IsOptional()
  attachmentStatus?: ExternalCaseStatus;

  @IsDateString()
  @IsOptional()
  attachedAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  priorityNote?: string;
}

// Labels for UI
export const ThirdPartyTypeLabels: Record<ThirdPartyType, string> = {
  [ThirdPartyType.ISVEREN]: "İşveren",
  [ThirdPartyType.BANKA]: "Banka",
  [ThirdPartyType.KIRACI]: "Kiracı",
  [ThirdPartyType.BORC_ALACAKLI]: "Borç-Alacaklı",
  [ThirdPartyType.DIGER]: "Diğer",
};

export const IhbarnameStatusLabels: Record<IhbarnameStatus, string> = {
  [IhbarnameStatus.GONDERILDI]: "Gönderildi",
  [IhbarnameStatus.TEBLIG_EDILDI]: "Tebliğ Edildi",
  [IhbarnameStatus.CEVAP_ALINDI]: "Cevap Alındı",
  [IhbarnameStatus.CEVAPSIZ]: "Cevapsız",
};
