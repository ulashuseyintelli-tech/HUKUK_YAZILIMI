import { IsDateString, IsNumber, IsOptional, IsString, Matches, Min } from "class-validator";

export class PaymentPreviewRequestDto {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/i)
  currency?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  caseDebtorId?: string;
}

export type PaymentPreviewDistributionSource =
  | "SINGLE_CASE_CLIENT"
  | "CASE_CREDITOR_CLUSTER"
  | "UNKNOWN";

export type PaymentPreviewDistributionStatus =
  | "HELD_PENDING_DISTRIBUTION"
  | "MANUAL_REQUIRED"
  | "BLOCKED";

export interface PaymentPreviewResponseDto {
  nonPersistent: true;
  caseId: string;
  input: {
    amount: number;
    paymentDate?: string;
    currency?: string;
    paymentMethod?: string;
    caseDebtorId?: string | null;
  };
  acceptance: {
    wouldAccept: boolean;
    blockingReasons: string[];
    warnings: string[];
  };
  balanceImpact: {
    currentOutstandingAmount: number;
    paymentAmount: number;
    appliedAmount: number;
    overpaymentAmount: number;
    projectedOutstandingAmount: number;
  };
  distributionPreview: {
    source: PaymentPreviewDistributionSource;
    status: PaymentPreviewDistributionStatus;
    totalAmount: number;
    requiresClientSelection: boolean;
    lines: Array<{
      type: "CLIENT_PAYABLE";
      amount: number;
      caseClientId?: string;
      clientName?: string;
    }>;
  };
}
