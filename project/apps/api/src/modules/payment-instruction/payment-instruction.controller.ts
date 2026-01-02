import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Query,
} from '@nestjs/common';
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
export class PaymentInstructionController {
  constructor(private readonly paymentInstructionService: PaymentInstructionService) {}

  /**
   * Ödeme talimatı oluşturur
   * POST /api/payment-instructions
   */
  @Post()
  async createPaymentInstruction(
    @Request() req: any,
    @Body() dto: CreatePaymentInstructionDto,
  ): Promise<PaymentInstructionResult> {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];
    return this.paymentInstructionService.createPaymentInstruction(tenantId, dto);
  }

  /**
   * Borçlu ödeme talimatı oluşturur (kısayol)
   * POST /api/payment-instructions/debtor
   */
  @Post('debtor')
  async createDebtorPayment(
    @Request() req: any,
    @Body() body: { caseId: string; amount: number; debtorName: string },
  ): Promise<PaymentInstructionResult> {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];
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
   */
  @Post('fee')
  async createFeePayment(
    @Request() req: any,
    @Body() body: { caseId: string; purpose: PaymentPurpose; amount: number },
  ): Promise<PaymentInstructionResult> {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];
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
