import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** OFFICE_APPROVAL_PENDING -> OFFICE_APPROVED için mevcut approval request bağı. */
export class CompleteDisclosureOfficeApprovalDto {
  @IsString()
  @MinLength(1)
  approvalRequestId: string;
}

/** OFFICE_APPROVED -> CONTENT_APPROVAL_PENDING için mühürlenecek içerik ve alıcı bağı. */
export class RequestDisclosureContentApprovalDto {
  @IsString()
  @MinLength(1)
  notificationContent: string;

  @IsEmail()
  approvedRecipientEmail: string;

  @IsString()
  @IsOptional()
  approvedRecipientPortalUserId?: string;
}

/** Onaylı versiyonun mevcut publication servisi üzerinden gönderim konusu. */
export class PublishClientFinancialDisclosureDto {
  @IsString()
  @MinLength(1)
  subject: string;
}

/** PUBLISHED -> REVERSED için client-safe düzeltme gerekçesi. */
export class ReverseClientFinancialDisclosureDto {
  @IsString()
  @MinLength(1)
  correctionReason: string;
}

/** PUBLISHED -> SUPERSEDED için mevcut ve yeni versiyon bağı. */
export class SupersedeClientFinancialDisclosureDto {
  @IsString()
  @MinLength(1)
  supersedingVersionId: string;

  @IsString()
  @MinLength(1)
  correctionReason: string;
}
