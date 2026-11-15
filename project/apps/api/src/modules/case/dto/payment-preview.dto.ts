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

  /**
   * Seçimlik sorumluluk: tahsilat kanalı ve kaynağı (isteğe bağlı). Haciz / icra dairesi kaynaklı ödeme borçlunun
   * sorumluluğunu aşıyorsa önizleme KAYITTAN ÖNCE açıklayıcı engel gösterir.
   */
  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;
}

/** Seçimlik sorumluluk — önizlemede borçlu kapasitesi ve aşan tutarın nasıl tutulacağı. */
export interface PaymentPreviewLiabilityDto {
  /** Dosyada etkin paylı / tutarla sınırlı kalem var ve ödeme bir borçlu hesabına. */
  shareOrCapBound: boolean;
  /** Hesabına ödeme yapılan borçlunun bu ödemede kullanabileceği toplam kapasite (işleyen faiz hariç). */
  debtorCapacityAmount: number;
  /** Kapasiteyi aşan tutar. */
  excessAmount: number;
  /**
   * Aşan tutarın akıbeti:
   *  - DEBTOR_OVERPAYMENT_HELD: borçlu adına fazla ödeme olarak izlenir (başka borçluya aktarılmaz);
   *  - ALLOCATION_HELD_LIMIT_EXCEEDED: haciz / icra dairesi kaynağı — tahsilat kaydedilir, TAMAMI mahsup bekletilir;
   *  - null: aşan tutar yok.
   */
  excessHandling: "DEBTOR_OVERPAYMENT_HELD" | "ALLOCATION_HELD_LIMIT_EXCEEDED" | null;
  /** İade ve başka borca mahsup komutları bu sürümde yoktur; aşan tutar yalnız izlenir ve tahsilat iptaliyle kapanır. */
  refundCommandsAvailable: false;
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
  /**
   * K3-L KP-11: kalan borcun hesaplandığı hesap tarihi (YYYY-MM-DD). Ödeme tarihi verildiyse o gün; verilmediyse
   * Türkiye takvimine göre bugün (`asOfDateSource`).
   */
  asOfDate: string;
  asOfDateSource: "PAYMENT_DATE" | "TURKEY_TODAY_DEFAULT";
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
  /** Yalnız dosyada etkin sorumluluk seçimi varsa döner. */
  liability?: PaymentPreviewLiabilityDto;
}
