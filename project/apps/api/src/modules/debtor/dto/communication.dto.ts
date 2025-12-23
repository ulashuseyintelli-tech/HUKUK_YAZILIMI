import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
} from "class-validator";

// ==================== ENUMS ====================

export enum CommunicationChannel {
  SMS = "SMS",
  EMAIL = "EMAIL",
  PHONE_CALL = "PHONE_CALL",
}

export enum CommunicationStatus {
  PENDING = "PENDING",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
}

export enum CommunicationType {
  ODEME_HATIRLATMA = "ODEME_HATIRLATMA",
  TAHSILAT_BILDIRIMI = "TAHSILAT_BILDIRIMI",
  UZLASMA_TEKLIFI = "UZLASMA_TEKLIFI",
  ICRA_UYARI = "ICRA_UYARI",
  HACIZ_UYARI = "HACIZ_UYARI",
  GENEL_BILGILENDIRME = "GENEL_BILGILENDIRME",
}

// ==================== DTOs ====================

export class SendSmsDto {
  @IsString()
  @IsOptional()
  caseId?: string;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsString()
  content: string;

  @IsEnum(CommunicationType)
  @IsOptional()
  type?: CommunicationType;
}

export class SendEmailDto {
  @IsString()
  @IsOptional()
  caseId?: string;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsString()
  subject: string;

  @IsString()
  content: string;

  @IsEnum(CommunicationType)
  @IsOptional()
  type?: CommunicationType;
}

export class LogPhoneCallDto {
  @IsString()
  @IsOptional()
  caseId?: string;

  @IsNumber()
  @IsOptional()
  callDuration?: number;

  @IsString()
  callNotes: string;

  @IsEnum(CommunicationType)
  @IsOptional()
  type?: CommunicationType;
}

// Labels for UI
export const CommunicationChannelLabels: Record<CommunicationChannel, string> = {
  [CommunicationChannel.SMS]: "SMS",
  [CommunicationChannel.EMAIL]: "E-posta",
  [CommunicationChannel.PHONE_CALL]: "Telefon",
};

export const CommunicationTypeLabels: Record<CommunicationType, string> = {
  [CommunicationType.ODEME_HATIRLATMA]: "Ödeme Hatırlatma",
  [CommunicationType.TAHSILAT_BILDIRIMI]: "Tahsilat Bildirimi",
  [CommunicationType.UZLASMA_TEKLIFI]: "Uzlaşma Teklifi",
  [CommunicationType.ICRA_UYARI]: "İcra Uyarısı",
  [CommunicationType.HACIZ_UYARI]: "Haciz Uyarısı",
  [CommunicationType.GENEL_BILGILENDIRME]: "Genel Bilgilendirme",
};
