import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DEBTOR-ENTERPRISE-APPROVAL-AUTHORIZATION-P0-I01 (bulgu R02-F09A) — I01A CONTAINMENT
 *
 * Bu DTO'lar approval HTTP yuzeyinin trust boundary'sini tasir.
 *
 * AUTHORITY KURALI: `tenantId`, `userId`, `userRole`, `requestedByUserId` gibi
 * yetki alanlari GOVDEDEN OKUNMAZ. Kanonik authority daima authenticated
 * principal'dir. Geriye uyumluluk icin govdede TASINMASINA izin verilen tenant
 * alani yalniz bir TUTARLILIK IDDIASIDIR: principal ile uyusmazsa istek
 * fail-closed reddedilir, sessizce yok sayilmaz.
 *
 * `userId` / `userRole` / `requestedByUserId` DTO'dan TAMAMEN CIKARILMISTIR —
 * whitelist validation sayesinde gonderilmeleri artik reddedilir.
 */

export class CreateApprovalRequestDto {
  @IsString()
  @IsNotEmpty()
  caseId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  riskLevel?: string;

  @IsOptional()
  @IsString()
  lockId?: string;

  /**
   * DEPRECATED / NON-AUTHORITATIVE. Yalniz geriye uyumluluk icin kabul edilir ve
   * yalniz principal tenant'i ile karsilastirilir. Uyusmazlik => fail-closed.
   */
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class SubmitApprovalDecisionDto {
  @IsString()
  @IsNotEmpty()
  approvalRequestId!: string;

  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  note?: string;

  /**
   * DEPRECATED / NON-AUTHORITATIVE — bkz. CreateApprovalRequestDto.tenantId.
   */
  @IsOptional()
  @IsString()
  tenantId?: string;
}
