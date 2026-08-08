import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** OFFICE_APPROVAL_PENDING -> OFFICE_APPROVED için mevcut approval request bağı. */
export class CompleteDisclosureOfficeApprovalDto {
  @IsString()
  @MinLength(1)
  approvalRequestId: string;
}

/** OFFICE_APPROVED -> CONTENT_APPROVAL_PENDING için renderer içeriğine bağlanacak alıcı. */
export class RequestDisclosureContentApprovalDto {
  @IsEmail()
  approvedRecipientEmail: string;

  @IsString()
  @IsOptional()
  approvedRecipientPortalUserId?: string;
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
