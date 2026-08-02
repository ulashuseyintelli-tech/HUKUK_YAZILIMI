import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export enum ManualClientNotificationType {
  GENEL_BILGILENDIRME = "GENEL_BILGILENDIRME",
  MASRAF_ISTEK = "MASRAF_ISTEK",
  RAPOR = "RAPOR",
  HATIRLATMA = "HATIRLATMA",
  DIGER = "DIGER",
}

export enum BulkEmailRecipientType {
  CLIENTS = "clients",
  DEBTORS = "debtors",
}

export enum ClientNotificationTemplateCategory {
  CLIENT_INFO = "CLIENT_INFO",
  EXPENSE_REQUEST = "EXPENSE_REQUEST",
  EXPENSE_REMINDER = "EXPENSE_REMINDER",
  COLLECTION_INFO = "COLLECTION_INFO",
  DEBTOR_NOTICE = "DEBTOR_NOTICE",
  GREETING = "GREETING",
  CLIENT_APPROVAL = "CLIENT_APPROVAL",
  STATEMENT_READY = "STATEMENT_READY",
  PAYMENT_INFO = "PAYMENT_INFO",
  OTHER = "OTHER",
}

const ID_MAX_LENGTH = 100;
const SUBJECT_MAX_LENGTH = 500;
const EMAIL_BODY_MAX_LENGTH = 50_000;
const SMS_BODY_MAX_LENGTH = 1_600;
const TEMPLATE_NAME_MAX_LENGTH = 200;
const TEMPLATE_CODE_MAX_LENGTH = 100;
const BULK_RECIPIENT_MAX_COUNT = 500;

export class SendClientNotificationEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(ID_MAX_LENGTH)
  clientId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ID_MAX_LENGTH)
  caseId?: string;

  @IsEnum(ManualClientNotificationType)
  type: ManualClientNotificationType;

  @IsString()
  @MinLength(1)
  @MaxLength(SUBJECT_MAX_LENGTH)
  subject: string;

  @IsString()
  @MinLength(1)
  @MaxLength(EMAIL_BODY_MAX_LENGTH)
  body: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ID_MAX_LENGTH)
  templateId?: string;
}

export class SendClientNotificationSmsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(ID_MAX_LENGTH)
  clientId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ID_MAX_LENGTH)
  caseId?: string;

  @IsEnum(ManualClientNotificationType)
  type: ManualClientNotificationType;

  @IsString()
  @MinLength(1)
  @MaxLength(SMS_BODY_MAX_LENGTH)
  body: string;
}

export class CreateClientNotificationTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(TEMPLATE_NAME_MAX_LENGTH)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(TEMPLATE_CODE_MAX_LENGTH)
  code: string;

  @IsEnum(ClientNotificationTemplateCategory)
  category: ClientNotificationTemplateCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(SUBJECT_MAX_LENGTH)
  subject: string;

  @IsString()
  @MinLength(1)
  @MaxLength(EMAIL_BODY_MAX_LENGTH)
  body: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateClientNotificationTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TEMPLATE_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(SUBJECT_MAX_LENGTH)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(EMAIL_BODY_MAX_LENGTH)
  body?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class SendClientNotificationBulkEmailDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_RECIPIENT_MAX_COUNT)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(ID_MAX_LENGTH, { each: true })
  recipients: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(SUBJECT_MAX_LENGTH)
  subject: string;

  @IsString()
  @MinLength(1)
  @MaxLength(EMAIL_BODY_MAX_LENGTH)
  message: string;

  @IsEnum(BulkEmailRecipientType)
  type: BulkEmailRecipientType;
}

export const clientNotificationDtoLimits = {
  id: ID_MAX_LENGTH,
  subject: SUBJECT_MAX_LENGTH,
  emailBody: EMAIL_BODY_MAX_LENGTH,
  smsBody: SMS_BODY_MAX_LENGTH,
  templateName: TEMPLATE_NAME_MAX_LENGTH,
  templateCode: TEMPLATE_CODE_MAX_LENGTH,
  bulkRecipientCount: BULK_RECIPIENT_MAX_COUNT,
} as const;
