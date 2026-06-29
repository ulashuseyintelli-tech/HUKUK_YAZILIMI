import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsIn,
  IsEmail,
  Matches,
  ValidateNested,
  ValidateIf,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Task 2 — Client create/update DTO (GÜVENLİ/KADEMELİ).
 *
 * Politika (owner-locked 2026-06-30): tip/format doğrulaması yapılır AMA fazla alan 400 SEBEBİ DEĞİL.
 * - TCKN/VKN: şimdilik YALNIZ rakam + uzunluk (11/10). mod-10/11 checksum AYRI "Client DTO Strictness
 *   Audit" task'ına ertelendi (mevcut veri/fixture geçersiz-checksum içerebilir → veri-denetimi gerek).
 * - Tüm alanlar @IsOptional: create/update aynı gevşek girişi kabul eder; eksik alan doğrulanmaz.
 * - Bu DTO, ClientService.create/update'in OKUDUĞU tüm alanları kapsar; whitelist:true ile fazlalar
 *   düşer ama bilinen alanlar KAYBOLMAZ.
 *
 * NOT (mimari): app.main.ts global ValidationPipe forbidNonWhitelisted:true. Route-level pipe global'i
 * override edemediğinden controller @Body() any tutar + bu DTO ile lenient ValidationPipe MANUEL invoke
 * edilir (global pipe inert kalır). Strict forbidNonWhitelisted + checksum = ertelenen audit task.
 */

const TCKN_RE = /^\d{11}$/;
const VKN_RE = /^\d{10}$/;

export class ClientContactInputDto {
  @IsOptional() @IsString() @MaxLength(40)
  type?: string;

  @IsOptional() @IsString() @MaxLength(200)
  value?: string;

  @IsOptional() @IsString() @MaxLength(120)
  label?: string;

  @IsOptional() @IsBoolean()
  isPrimary?: boolean;
}

export class ClientAddressInputDto {
  @IsOptional() @IsString() @MaxLength(500)
  street?: string;

  @IsOptional() @IsString() @MaxLength(120)
  city?: string;

  @IsOptional() @IsString() @MaxLength(120)
  district?: string;

  @IsOptional() @IsString() @MaxLength(120)
  region?: string;

  @IsOptional() @IsString() @MaxLength(20)
  postalCode?: string;

  @IsOptional() @IsBoolean()
  isPrimary?: boolean;
}

export class CreateClientDto {
  // INDIVIDUAL deprecated ama mevcut veri/fixture kullanıyor → kabul (kırma yok).
  @IsOptional() @IsIn(["PERSON", "COMPANY", "PUBLIC", "INDIVIDUAL"])
  type?: string;

  @IsOptional() @IsString() @MaxLength(200) firstName?: string;
  @IsOptional() @IsString() @MaxLength(200) lastName?: string;
  @IsOptional() @IsString() @MaxLength(300) companyName?: string;
  @IsOptional() @IsString() @MaxLength(300) displayName?: string;
  @IsOptional() @IsString() @MaxLength(300) name?: string;

  // Yalnız rakam + uzunluk; boş string serbest (no-tckn). Checksum AYRI task.
  @IsOptional()
  @ValidateIf((o) => o.tckn !== undefined && o.tckn !== null && o.tckn !== "")
  @Matches(TCKN_RE, { message: "TCKN 11 haneli rakam olmalı" })
  tckn?: string;

  @IsOptional()
  @ValidateIf((o) => o.vkn !== undefined && o.vkn !== null && o.vkn !== "")
  @Matches(VKN_RE, { message: "VKN 10 haneli rakam olmalı" })
  vkn?: string;

  @IsOptional() @IsString() @MaxLength(20) identityNo?: string;
  @IsOptional() @IsString() @MaxLength(200) taxOffice?: string;
  @IsOptional() @IsString() @MaxLength(20) gender?: string;
  @IsOptional() @IsString() @MaxLength(60) detsisNo?: string;
  @IsOptional() @IsString() @MaxLength(60) mersisNo?: string;
  @IsOptional() @IsString() @MaxLength(60) ticaretSicilNo?: string;
  @IsOptional() @IsString() @MaxLength(120) companyType?: string;
  @IsOptional() @IsString() @MaxLength(120) nationality?: string;
  @IsOptional() @IsBoolean() isForeigner?: boolean;

  @IsOptional()
  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== "")
  @IsEmail({}, { message: "Geçerli e-posta giriniz" })
  email?: string;

  @IsOptional() @IsString() @MaxLength(40) phone?: string;

  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) district?: string;
  @IsOptional() @IsString() @MaxLength(120) region?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;

  @IsOptional() @IsBoolean() canCollect?: boolean;
  @IsOptional() @IsBoolean() canWaive?: boolean;
  @IsOptional() @IsBoolean() canSettle?: boolean;
  @IsOptional() @IsBoolean() canRelease?: boolean;

  @IsOptional() @IsString() @MaxLength(5000) notes?: string;

  // Tarihler string olarak gelir; service new Date() yapar → lenient @IsString (sıkı tarih = audit task).
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsString() foundingDate?: string;
  @IsOptional() @IsString() poaStartDate?: string;

  @IsOptional() @IsBoolean() sendBirthdayGreeting?: boolean;
  @IsOptional() @IsBoolean() sendAnniversaryGreeting?: boolean;
  @IsOptional() @IsBoolean() sendHolidayGreeting?: boolean;
  @IsOptional() @IsString() @MaxLength(20) greetingChannel?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ClientContactInputDto)
  phones?: ClientContactInputDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ClientContactInputDto)
  emails?: ClientContactInputDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ClientAddressInputDto)
  addresses?: ClientAddressInputDto[];
}

export class UpdateClientDto extends CreateClientDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}
