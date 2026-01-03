import { IsString, IsEnum, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum InstitutionType {
  SGK = 'SGK',
  VERGI_DAIRESI = 'VERGI_DAIRESI',
  TICARET_SICILI = 'TICARET_SICILI',
  BELEDIYE = 'BELEDIYE',
  TAPU = 'TAPU',
  NUFUS = 'NUFUS',
}

export enum InstitutionLetterStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  RESPONDED = 'RESPONDED',
  NO_RESPONSE = 'NO_RESPONSE',
}

// Kurum yazı şablonları
export const INSTITUTION_LETTER_TEMPLATES: Record<InstitutionType, {
  name: string;
  letterTypes: string[];
  defaultSubject: string;
}> = {
  [InstitutionType.SGK]: {
    name: 'Sosyal Güvenlik Kurumu',
    letterTypes: ['ADRES_SORGU', 'ISYERI_SORGU', 'EMEKLI_SORGU'],
    defaultSubject: 'Borçlu Adres ve İşyeri Bilgisi Talebi',
  },
  [InstitutionType.VERGI_DAIRESI]: {
    name: 'Vergi Dairesi',
    letterTypes: ['ADRES_SORGU', 'MUKELLEFIYET_SORGU'],
    defaultSubject: 'Borçlu Vergi Mükellefiyet ve Adres Bilgisi Talebi',
  },
  [InstitutionType.TICARET_SICILI]: {
    name: 'Ticaret Sicil Müdürlüğü',
    letterTypes: ['ADRES_SORGU', 'ORTAK_SORGU', 'YETKILI_SORGU'],
    defaultSubject: 'Şirket Adres ve Yetkili Bilgisi Talebi',
  },
  [InstitutionType.BELEDIYE]: {
    name: 'Belediye Başkanlığı',
    letterTypes: ['ADRES_SORGU', 'EMLAK_SORGU'],
    defaultSubject: 'Borçlu Adres Bilgisi Talebi',
  },
  [InstitutionType.TAPU]: {
    name: 'Tapu Müdürlüğü',
    letterTypes: ['GAYRIMENKUL_SORGU'],
    defaultSubject: 'Borçlu Gayrimenkul Bilgisi Talebi',
  },
  [InstitutionType.NUFUS]: {
    name: 'Nüfus Müdürlüğü',
    letterTypes: ['ADRES_SORGU', 'AILE_SORGU'],
    defaultSubject: 'Borçlu Nüfus ve Adres Bilgisi Talebi',
  },
};

export class CreateInstitutionLetterDto {
  @IsString()
  caseDebtorId: string;

  @IsEnum(InstitutionType)
  institution: InstitutionType;

  @IsString()
  letterType: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  recipientName?: string; // Kurum adı veya kişi

  @IsOptional()
  @IsString()
  recipientAddress?: string;
}

export class MarkLetterAsSentDto {
  @IsString()
  sentMethod: string; // POSTA, KEP, ELDEN, FAKS

  @IsOptional()
  @IsString()
  trackingNumber?: string; // Posta takip no

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MarkLetterAsRespondedDto {
  @IsOptional()
  @IsString()
  responseNotes?: string;

  @IsOptional()
  @IsNumber()
  addressesFound?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddressFromLetterDto)
  addresses?: AddressFromLetterDto[];
}

export class AddressFromLetterDto {
  @IsString()
  fullAddress: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  addressType?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
