import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PayerType,
  PaymentPurpose,
  TargetAccountType,
  PAYMENT_PURPOSE_TO_ACCOUNT,
  PAYMENT_PURPOSE_LABELS,
  CreatePaymentInstructionDto,
  PaymentInstructionResult,
} from './payment-instruction.types';

@Injectable()
export class PaymentInstructionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Ödeme talimatı oluşturur
   * Ödeme amacına göre otomatik olarak doğru IBAN'ı seçer
   */
  async createPaymentInstruction(
    tenantId: string,
    dto: CreatePaymentInstructionDto,
  ): Promise<PaymentInstructionResult> {
    // 1. Dosyayı ve icra dairesini getir
    const caseData = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
      include: {
        executionOffice: true,
      },
    });

    if (!caseData) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    if (!caseData.executionOffice) {
      throw new BadRequestException('Dosyaya bağlı icra dairesi bulunamadı');
    }

    const office = caseData.executionOffice;

    // 2. Ödeme kurallarını kontrol et
    this.validatePaymentRules(dto.payerType, dto.purpose);

    // 3. Hedef hesabı belirle
    const targetAccountType = PAYMENT_PURPOSE_TO_ACCOUNT[dto.purpose];
    const iban = this.getTargetIban(office, targetAccountType);

    if (!iban) {
      throw new BadRequestException(
        `İcra dairesinin ${this.getAccountTypeName(targetAccountType)} hesap bilgisi eksik. ` +
        `Lütfen icra dairesi ayarlarından hesap bilgilerini güncelleyin.`
      );
    }

    // 4. Açıklama şablonunu oluştur
    const description = this.generateDescription(
      office.name,
      caseData.executionFileNumber || caseData.fileNumber,
      dto.purpose,
      dto.payerName,
    );

    // 5. Sonucu döndür
    const result: PaymentInstructionResult = {
      bankName: office.bankName || 'T. Vakıflar Bankası T.A.O.',
      iban: iban,
      ibanFormatted: this.formatIban(iban),
      description,
      executionOfficeName: office.name,
      executionFileNumber: caseData.executionFileNumber || caseData.fileNumber,
      amount: dto.amount,
      purpose: dto.purpose,
      purposeLabel: PAYMENT_PURPOSE_LABELS[dto.purpose],
      warnings: this.getWarnings(office, targetAccountType),
    };

    return result;
  }

  /**
   * Ödeme kurallarını kontrol eder
   * Borçlu sadece emanete, alacaklı/vekil sadece harç/cezaevine ödeme yapabilir
   */
  private validatePaymentRules(payerType: PayerType, purpose: PaymentPurpose): void {
    const targetAccount = PAYMENT_PURPOSE_TO_ACCOUNT[purpose];

    // Borçlu sadece emanet hesabına ödeme yapabilir
    if (payerType === PayerType.DEBTOR && targetAccount !== TargetAccountType.EMANET) {
      throw new BadRequestException(
        'Borçlu sadece borç ödemesi (emanet hesabına) yapabilir'
      );
    }

    // Alacaklı/Vekil emanet hesabına ödeme yapamaz (borçlu adına ödeme hariç)
    if (
      (payerType === PayerType.CREDITOR || payerType === PayerType.LAWYER) &&
      targetAccount === TargetAccountType.EMANET
    ) {
      throw new BadRequestException(
        'Alacaklı/Vekil emanet hesabına doğrudan ödeme yapamaz. ' +
        'Harç veya masraf ödemesi seçiniz.'
      );
    }
  }

  /**
   * Hedef hesap türüne göre IBAN'ı döndürür
   */
  private getTargetIban(
    office: { iban?: string | null; ibanHarc?: string | null; ibanCezaevi?: string | null },
    accountType: TargetAccountType,
  ): string | null {
    switch (accountType) {
      case TargetAccountType.EMANET:
        return office.iban || null;
      case TargetAccountType.HARC:
        return office.ibanHarc || null;
      case TargetAccountType.CEZAEVI:
        return office.ibanCezaevi || null;
      default:
        return null;
    }
  }

  /**
   * Hesap türü adını döndürür
   */
  private getAccountTypeName(accountType: TargetAccountType): string {
    switch (accountType) {
      case TargetAccountType.EMANET:
        return 'Emanet';
      case TargetAccountType.HARC:
        return 'Harç';
      case TargetAccountType.CEZAEVI:
        return 'Cezaevi';
      default:
        return 'Bilinmeyen';
    }
  }

  /**
   * Ödeme açıklaması şablonunu oluşturur
   */
  private generateDescription(
    officeName: string,
    fileNumber: string,
    purpose: PaymentPurpose,
    payerName?: string,
  ): string {
    const purposeLabel = PAYMENT_PURPOSE_LABELS[purpose];
    
    if (purpose === PaymentPurpose.DEBT_PAYMENT && payerName) {
      return `${officeName} ${fileNumber} - ${purposeLabel} - Borçlu: ${payerName}`;
    }
    
    return `${officeName} ${fileNumber} - ${purposeLabel}`;
  }

  /**
   * IBAN'ı formatlar (TR00 0000 0000 ... şeklinde)
   */
  private formatIban(iban: string): string {
    // Boşlukları temizle
    const clean = iban.replace(/\s/g, '');
    // 4'erli grupla
    return clean.match(/.{1,4}/g)?.join(' ') || iban;
  }

  /**
   * Uyarıları döndürür
   */
  private getWarnings(
    office: { iban?: string | null; ibanHarc?: string | null; ibanCezaevi?: string | null },
    targetAccountType: TargetAccountType,
  ): string[] | undefined {
    const warnings: string[] = [];

    // Eksik hesap uyarıları
    if (!office.iban) {
      warnings.push('Emanet hesabı (IBAN) eksik');
    }
    if (!office.ibanHarc) {
      warnings.push('Harç hesabı (IBAN) eksik');
    }
    if (!office.ibanCezaevi) {
      warnings.push('Cezaevi hesabı (IBAN) eksik');
    }

    return warnings.length > 0 ? warnings : undefined;
  }

  /**
   * Borçlu için ödeme talimatı oluşturur (kısayol)
   */
  async createDebtorPaymentInstruction(
    tenantId: string,
    caseId: string,
    amount: number,
    debtorName: string,
  ): Promise<PaymentInstructionResult> {
    return this.createPaymentInstruction(tenantId, {
      caseId,
      payerType: PayerType.DEBTOR,
      purpose: PaymentPurpose.DEBT_PAYMENT,
      amount,
      payerName: debtorName,
    });
  }

  /**
   * Harç ödemesi için talimat oluşturur (kısayol)
   */
  async createFeePaymentInstruction(
    tenantId: string,
    caseId: string,
    purpose: PaymentPurpose,
    amount: number,
  ): Promise<PaymentInstructionResult> {
    return this.createPaymentInstruction(tenantId, {
      caseId,
      payerType: PayerType.LAWYER,
      purpose,
      amount,
    });
  }
}
