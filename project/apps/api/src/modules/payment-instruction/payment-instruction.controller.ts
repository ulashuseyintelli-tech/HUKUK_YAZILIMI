import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentInstructionService } from './payment-instruction.service';
import {
  PayerType,
  PaymentPurpose,
  CreatePaymentInstructionDto,
  PaymentInstructionResult,
  PAYMENT_PURPOSE_LABELS,
  PAYMENT_PURPOSE_TO_ACCOUNT,
  TargetAccountType,
} from './payment-instruction.types';

@Controller('payment-instructions')
@UseGuards(JwtAuthGuard)
export class PaymentInstructionController {
  constructor(private readonly paymentInstructionService: PaymentInstructionService) {}

  /**
   * Ödeme talimatı oluşturur
   * POST /api/payment-instructions
   *
   * Çağrıldığı yerler:
   * - web/lib/api.ts createPaymentInstruction() → POST /payment-instructions
   * - web/components/payment/PaymentInstructionModal.tsx → api.post('/payment-instructions')
   *
   * Güvenlik: tenantId artık YALNIZCA JwtAuthGuard'lı request context'ten (@CurrentUser).
   * x-tenant-id header fallback'i kaldırıldı (cross-tenant yazma vektörü kapatıldı).
   */
  @Post()
  async createPaymentInstruction(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreatePaymentInstructionDto,
  ): Promise<PaymentInstructionResult> {
    return this.paymentInstructionService.createPaymentInstruction(tenantId, dto);
  }

  /**
   * Borçlu ödeme talimatı oluşturur (kısayol)
   * POST /api/payment-instructions/debtor
   *
   * Çağrıldığı yerler:
   * - web/lib/api.ts → POST /payment-instructions/debtor
   *
   * Güvenlik: tenantId yalnızca JwtAuthGuard'lı context'ten (@CurrentUser).
   */
  @Post('debtor')
  async createDebtorPayment(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { caseId: string; amount: number; debtorName: string },
  ): Promise<PaymentInstructionResult> {
    return this.paymentInstructionService.createDebtorPaymentInstruction(
      tenantId,
      body.caseId,
      body.amount,
      body.debtorName,
    );
  }

  /**
   * Harç/Masraf ödeme talimatı oluşturur (kısayol)
   * POST /api/payment-instructions/fee
   *
   * Çağrıldığı yerler:
   * - web/lib/api.ts → POST /payment-instructions/fee
   *
   * Güvenlik: tenantId yalnızca JwtAuthGuard'lı context'ten (@CurrentUser).
   */
  @Post('fee')
  async createFeePayment(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { caseId: string; purpose: PaymentPurpose; amount: number },
  ): Promise<PaymentInstructionResult> {
    return this.paymentInstructionService.createFeePaymentInstruction(
      tenantId,
      body.caseId,
      body.purpose,
      body.amount,
    );
  }

  /**
   * Ödeme türlerini listeler
   * GET /api/payment-instructions/purposes
   */
  @Get('purposes')
  getPaymentPurposes(): Array<{
    value: PaymentPurpose;
    label: string;
    targetAccount: TargetAccountType;
    allowedPayers: PayerType[];
  }> {
    return Object.values(PaymentPurpose).map((purpose) => {
      const targetAccount = PAYMENT_PURPOSE_TO_ACCOUNT[purpose];
      
      // Borçlu sadece emanete, alacaklı/vekil sadece harç/cezaevine
      const allowedPayers: PayerType[] =
        targetAccount === TargetAccountType.EMANET
          ? [PayerType.DEBTOR]
          : [PayerType.CREDITOR, PayerType.LAWYER];

      return {
        value: purpose,
        label: PAYMENT_PURPOSE_LABELS[purpose],
        targetAccount,
        allowedPayers,
      };
    });
  }

  /**
   * Ödeme türlerini ödeyene göre filtreler
   * GET /api/payment-instructions/purposes-by-payer?payerType=DEBTOR
   */
  @Get('purposes-by-payer')
  getPaymentPurposesByPayer(
    @Query('payerType') payerType: PayerType,
  ): Array<{ value: PaymentPurpose; label: string }> {
    return Object.values(PaymentPurpose)
      .filter((purpose) => {
        const targetAccount = PAYMENT_PURPOSE_TO_ACCOUNT[purpose];
        
        if (payerType === PayerType.DEBTOR) {
          return targetAccount === TargetAccountType.EMANET;
        }
        
        // Alacaklı/Vekil için emanet hariç tümü
        return targetAccount !== TargetAccountType.EMANET;
      })
      .map((purpose) => ({
        value: purpose,
        label: PAYMENT_PURPOSE_LABELS[purpose],
      }));
  }
}
