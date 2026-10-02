import { StaffType } from "@prisma/client";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, ValidateIf } from "class-validator";

/**
 * OFFICE-PUT-BODY-BOUNDARY — `OfficeController` yazma uçlarının gövde sınırı.
 *
 * ÖLÇÜLEN KÖK NEDEN: yazma uçlarının gövdesi DTO SINIFI ile değil satır-içi TypeScript tip
 * literali ile tipliydi. Tip runtime'da silinir; global `ValidationPipe`
 * ({ whitelist, forbidNonWhitelisted }, main.ts) metatype `Object` gördüğü için HİÇ çalışmıyordu
 * ve servis gövdeyi aynen `prisma.office.update({ data })`a veriyordu. Sonuç: F01-yetkili ama
 * ADMIN olmayan aktör `PUT /office` ile SMTP/SMS alanlarını (ADMIN kapısını ve ACT-02 şifrelemesini
 * atlayarak) yazabiliyor; her ayar ucu her Office sütununu (tenantId, id, havuz dizileri ...)
 * yazabiliyordu. Aynı kusur sınıfı avukat (FB0105) ve personelde (F-B03-03) DTO sınıfı + açık
 * alan haritasıyla kapatılmıştı; bu dosya aynı kalıbı Office ayar uçlarına uygular.
 *
 * BU DTO'LAR YENİ SERBESTLİK EKLEMEZ ve DEĞER KURALI KOYMAZ: yalnız uç başına bugün kabul edilen
 * alan kümesini ve o alanın SÜTUN TÜRÜNÜ tipler. (Aralık / biçim kuralları — HH:mm, Int32 sınırı,
 * gün >= 1, e-posta biçimi — ayrı ürün kararıdır; burada YOK.)
 *
 * NULL SEMANTİĞİ KORUNUR: nullable sütunlar (`String?`, `Int?`) `@IsOptional` ile null KABUL eder
 * (ekran `smtpPort: parseInt("")` → NaN → JSON `null` gönderebilir; null bugün sütunu temizler).
 * Null ALAMAYAN sütunlar (`name`, `Boolean`, `Int`, `String[]`, enum dizisi) `@DefinedOnly` ile
 * yalnız `undefined`ı atlar → `null` artık Prisma'da 500 yerine burada 400 olur.
 *
 * ALAN HARİTALARI servis allow-list'i olarak da kullanılır (HTTP dışı çağıranlar için ikinci
 * savunma; denetim kaydı da yalnız haritadaki anahtarları yazar). Ekranın
 * (settings/office/page.tsx) bugün gönderdiği alanların TAMAMI haritalarda vardır — "allowlist +
 * tam-form PUT" tuzağı: tanınmayan alan 400 verir ve ekranı kırar.
 */

/** Yalnız `undefined`ı atlar; `null` doğrulamadan geçer ve reddedilir (null alamayan sütunlar). */
const DefinedOnly = () => ValidateIf((_object, value) => value !== undefined);

// ───────────── alan haritaları (tek kaynak: DTO + servis allow-list) ─────────────

/** PUT /office — ekranın gönderdiği 14 alan + controller'ın bugün kabul ettiği `defaultExecutionOfficeId`. */
export const OFFICE_PROFILE_FIELDS = [
  "name", "address", "city", "district", "postalCode", "phone", "fax", "email", "website",
  "barAssociation", "vergiNo", "vergiDairesi", "mersisNo", "kepAddress", "defaultExecutionOfficeId",
] as const;

/** PUT /office/smtp-settings (ADMIN) */
export const OFFICE_SMTP_FIELDS = [
  "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpSecure", "smtpFromName", "smtpFromEmail",
] as const;

/** PUT /office/sms-settings (ADMIN) */
export const OFFICE_SMS_FIELDS = ["smsProvider", "smsApiKey", "smsApiSecret", "smsSender"] as const;

/** PUT /office/greeting-settings */
export const OFFICE_GREETING_FIELDS = ["autoGreetingEnabled", "autoGreetingTime"] as const;

/** PUT /office/iik78-settings */
export const OFFICE_IIK78_FIELDS = ["inactivityThresholdDays", "inactivityWarningDays"] as const;

/** PUT /office/poa-expiry-settings */
export const OFFICE_POA_EXPIRY_FIELDS = [
  "poaExpiryNotificationEnabled", "poaExpiryThresholdDays", "poaExpiryRecipientLawyerIds",
] as const;

/** PUT /office/escalation-settings — havuz alanları (ilk üç) tek mutation primitive'inden geçer. */
export const OFFICE_ESCALATION_POOL_FIELDS = [
  "escalationManagerLawyerIds", "escalationFounderLawyerIds", "opStaffTypes",
] as const;
export const OFFICE_ESCALATION_FIELDS = [
  ...OFFICE_ESCALATION_POOL_FIELDS,
  "opReminderDays", "opFounderDays", "opRepeatMonths", "opEmailEnabled", "opSmsEnabled",
  "escalationTeamLeadLawyerIds", "caseTaskOwnerDays", "caseTaskTeamLeadDays", "caseTaskManagerDays",
] as const;

/** Haritadaki ve tanımlı (`undefined` olmayan) anahtarları döndürür; geri kalanı ASLA geçmez. */
export function pickOfficeFields(data: object | undefined | null, allowed: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  if (!data) return out;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, key) && (data as Record<string, unknown>)[key] !== undefined) {
      out[key] = (data as Record<string, unknown>)[key];
    }
  }
  return out;
}

// ───────────── DTO sınıfları ─────────────

export class UpdateOfficeDto {
  @DefinedOnly() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() fax?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() barAssociation?: string;
  @IsOptional() @IsString() vergiNo?: string;
  @IsOptional() @IsString() vergiDairesi?: string;
  @IsOptional() @IsString() mersisNo?: string;
  @IsOptional() @IsString() kepAddress?: string;
  @IsOptional() @IsString() defaultExecutionOfficeId?: string;
}

export class UpdateSmtpSettingsDto {
  @IsOptional() @IsString() smtpHost?: string;
  @IsOptional() @IsInt() smtpPort?: number;
  @IsOptional() @IsString() smtpUser?: string;
  @IsOptional() @IsString() smtpPass?: string;
  @DefinedOnly() @IsBoolean() smtpSecure?: boolean;
  @IsOptional() @IsString() smtpFromName?: string;
  @IsOptional() @IsString() smtpFromEmail?: string;
}

export class UpdateSmsSettingsDto {
  @IsOptional() @IsString() smsProvider?: string;
  @IsOptional() @IsString() smsApiKey?: string;
  @IsOptional() @IsString() smsApiSecret?: string;
  @IsOptional() @IsString() smsSender?: string;
}

export class UpdateGreetingSettingsDto {
  @DefinedOnly() @IsBoolean() autoGreetingEnabled?: boolean;
  @IsOptional() @IsString() autoGreetingTime?: string;
}

export class UpdateIik78SettingsDto {
  @DefinedOnly() @IsInt() inactivityThresholdDays?: number;
  @DefinedOnly() @IsInt() inactivityWarningDays?: number;
}

export class UpdatePoaExpirySettingsDto {
  @DefinedOnly() @IsBoolean() poaExpiryNotificationEnabled?: boolean;
  @DefinedOnly() @IsInt() poaExpiryThresholdDays?: number;
  @DefinedOnly() @IsArray() @IsString({ each: true }) poaExpiryRecipientLawyerIds?: string[];
}

export class UpdateEscalationSettingsDto {
  @DefinedOnly() @IsArray() @IsString({ each: true }) escalationManagerLawyerIds?: string[];
  @DefinedOnly() @IsArray() @IsString({ each: true }) escalationFounderLawyerIds?: string[];
  @DefinedOnly() @IsInt() opReminderDays?: number;
  @DefinedOnly() @IsInt() opFounderDays?: number;
  @DefinedOnly() @IsInt() opRepeatMonths?: number;
  @DefinedOnly() @IsBoolean() opEmailEnabled?: boolean;
  @DefinedOnly() @IsBoolean() opSmsEnabled?: boolean;
  @DefinedOnly() @IsArray() @IsEnum(StaffType, { each: true }) opStaffTypes?: StaffType[];
  // D-G5: dosya görevi (case-task) eskalasyon ayarları
  @DefinedOnly() @IsArray() @IsString({ each: true }) escalationTeamLeadLawyerIds?: string[];
  @DefinedOnly() @IsInt() caseTaskOwnerDays?: number;
  @DefinedOnly() @IsInt() caseTaskTeamLeadDays?: number;
  @DefinedOnly() @IsInt() caseTaskManagerDays?: number;
}
