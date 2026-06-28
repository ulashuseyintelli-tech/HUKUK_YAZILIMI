import { IsString, IsOptional, MinLength, IsNumberString } from 'class-validator';

/**
 * TM3 Faz C C-1 — Müvekkil Mahsubu (ClientOffset) DTO'ları.
 *
 * Güvenlik: tenantId/createdById/approvedById payload'dan ALINMAZ (req.user). approvalRef public DTO'da YOK
 * (C-1 v1'de confirm-gate entegre değil → client-supplied approvalRef yetki SAĞLAMAZ; service internal future-param).
 * 1 ClientOffset = 1 payable leg + 1 expense leg + 1 amount (gizli FIFO yok).
 */
export class CreateClientOffsetDto {
  @IsString()
  @MinLength(1)
  clientId: string;

  @IsString()
  @MinLength(1)
  currency: string;

  // payable leg — proceeds payable (kanonik bağ caseClientId)
  @IsString()
  @MinLength(1)
  payableCaseId: string;

  @IsString()
  @MinLength(1)
  payableCaseClientId: string;

  // expense leg — masraf borcu (ExpenseRequest pinlenir)
  @IsString()
  @MinLength(1)
  expenseCaseId: string;

  @IsString()
  @MinLength(1)
  expenseRequestId: string;

  /** Pozitif Decimal-string. amount<=min(payableOutstanding, expenseUnpaid) — OTORİTE backend (tx içinde re-validate). */
  @IsNumberString()
  amount: string;

  /** Tenant-scoped duplicate guard; client üretir. */
  @IsString()
  @MinLength(1)
  idempotencyKey: string;
}

/** Mahsup iptali (reversal). reason ZORUNLU (trimmed ≥10). approvalRef public DTO'da YOK (v1). */
export class ReverseClientOffsetDto {
  @IsString()
  @MinLength(10, { message: 'Mahsup iptali gerekçesi en az 10 karakter olmalı' })
  reason: string;

  @IsString()
  @MinLength(1)
  idempotencyKey: string;
}

/** Eligibility filtre (opsiyonel). */
export class OffsetEligibilityQueryDto {
  @IsString()
  @IsOptional()
  currency?: string;
}
