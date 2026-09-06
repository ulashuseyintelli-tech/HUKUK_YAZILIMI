import { IsString, IsOptional, IsEmail, IsEnum, IsBoolean, IsArray, ArrayNotEmpty, IsDateString, IsInt, Min } from 'class-validator';
import { ClientInfoRequestStatus, ClientIntakeFieldCategory } from '@prisma/client';

export class CreateClientInfoRequestDto {
  @IsString()
  caseId: string;

  @IsString()
  clientId: string;

  @IsOptional()
  @IsString()
  debtorId?: string;

  @IsEmail()
  emailTo: string;

  @IsOptional()
  @IsString()
  emailSubject?: string;

  @IsOptional()
  @IsString()
  emailBody?: string;

  /**
   * D-3b ("Yol1"): true ise talep e-postasina mevcut intake altyapisiyla uretilen guvenli form
   * baglantisi eklenir. VARSAYILAN false → mevcut davranis (serbest metin yaniti) DEGISMEZ.
   * Link uretimi ClientIntakeLinkService sozlesmesine tabidir (tenant/muvekkil/dosya siniri,
   * token hash, sure/iptal/tekrar-kullanim); yanit review kuyruguna duser, promotion AYRI kalir.
   */
  @IsOptional()
  @IsBoolean()
  attachIntakeLink?: boolean;

  /** Formun soracagi kategoriler. Verilmezse bilgi talebinin dogal kapsami: ADDRESS + CONTACT. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ClientIntakeFieldCategory, { each: true })
  intakeScope?: ClientIntakeFieldCategory[];

  /** Baglanti son gecerlilik tarihi (ISO). Verilmezse intake sozlesmesinin varsayilani (suresiz). */
  @IsOptional()
  @IsDateString()
  intakeExpiresAt?: string;

  /** Azami kullanim (intake sozlesmesi varsayilani 1). */
  @IsOptional()
  @IsInt()
  @Min(1)
  intakeMaxUses?: number;
}

export class UpdateClientInfoRequestDto {
  @IsOptional()
  @IsEnum(ClientInfoRequestStatus)
  status?: ClientInfoRequestStatus;

  @IsOptional()
  @IsString()
  responseNotes?: string;
}

export class ClientInfoRequestResponseDto {
  id: string;
  caseId: string;
  clientId: string;
  debtorId?: string;
  emailTo: string;
  emailSubject: string;
  emailBody: string;
  status: ClientInfoRequestStatus;
  sentAt: Date;
  respondedAt?: Date;
  responseNotes?: string;
  reminderSentAt?: Date;
  reminderCount: number;
  createdAt: Date;
  updatedAt: Date;
  client?: {
    id: string;
    displayName: string;
  };
  debtor?: {
    id: string;
    name: string;
  };
}
