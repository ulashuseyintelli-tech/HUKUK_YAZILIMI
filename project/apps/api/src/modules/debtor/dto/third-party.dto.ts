import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
} from "class-validator";
import { ExternalCaseStatus, ExternalCaseClosureReason } from "@prisma/client";

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
// gercek runtime korumasi saglar: gecersiz alan artik ham Prisma hatasi
// yerine temiz 400 doner.
//
// DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02 (OWNER D2 POLICY
// DECISION — RATIFIED): `attachmentStatus` bu DTO'dan KALDIRILDI. Durum
// artik yalniz ExternalCaseStatusTransitionService uzerinden, ratifiye
// edilmis transition matrix + actor-authority + CAS ile degisir — generic
// metadata update'in bir yan-etkisi olarak DEGIL. Bkz. TransitionExternal
// CaseStatusDto / CloseExternalCaseDto.
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

// DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02: createExternalCase()
// daha once `dto: any` idi. `attachmentStatus` burada YOK — create() daima
// HACIZ_TALEP ile baslar (owner-ratified baslangic durumu); statusSource/
// statusChangedBy/statusChangedAt servis tarafindan authenticated actor'dan
// server-side set edilir (client-supplied DEGIL).
export class CreateExternalCaseDto {
  @IsString()
  externalOffice: string;

  @IsString()
  @IsOptional()
  externalOfficeId?: string;

  @IsString()
  externalCaseNo: string;

  @IsString()
  counterpartyName: string;

  @IsString()
  @IsOptional()
  counterpartyId?: string;

  @IsNumber()
  claimAmount: number;

  @IsString()
  @IsOptional()
  claimCurrency?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  priorityNote?: string;
}

// DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02: manuel FACT/PROCESS
// gecisi (HACIZ_TALEP->CEVAP_BEKLENIYOR / HACIZ_TALEP->HACIZ_KONDU /
// CEVAP_BEKLENIYOR->HACIZ_KONDU). `expectedStatus` client'in gordugu son
// durumdur — CAS guard (bank-candidate-settlement-transition.service.ts
// emsali): sunucudaki gercek durum bununla uyusmazsa 409 doner, sessiz
// overwrite YOK.
export class TransitionExternalCaseStatusDto {
  @IsEnum(ExternalCaseStatus)
  expectedStatus: ExternalCaseStatus;

  @IsEnum(ExternalCaseStatus)
  targetStatus: ExternalCaseStatus;

  @IsString()
  @IsOptional()
  externalReference?: string;

  @IsDateString()
  @IsOptional()
  statusOccurredAt?: string;
}

// DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02: manuel KAPANDI —
// yalniz CaseLawyer (staff, canEdit=true olsa bile, YETKİLİ DEGİL). closure
// Reason=FULLY_COLLECTED bu yoldan KABUL EDİLMEZ (yalniz SYSTEM_DERIVED
// writer uretebilir) — servis katmaninda ayrica dogrulanir.
export class CloseExternalCaseDto {
  @IsEnum(ExternalCaseStatus)
  expectedStatus: ExternalCaseStatus;

  @IsEnum(ExternalCaseClosureReason)
  closureReason: ExternalCaseClosureReason;

  @IsString()
  @IsOptional()
  externalReference?: string;

  @IsDateString()
  @IsOptional()
  statusOccurredAt?: string;
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
