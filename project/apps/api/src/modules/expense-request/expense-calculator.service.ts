import { Injectable, Logger } from '@nestjs/common';
import { TariffService } from '@/modules/tariff/tariff.service';
import { Decimal } from '@prisma/client/runtime/library';

export interface CaseData {
  principalAmount: number;
  interestAmount?: number;
  caseType: string; // ILAMSIZ, ILAMLI, KAMBIYO, KIRA, TAHLIYE
  debtorCount?: number;
  currency?: string;
}

export interface ExpenseItemCalculation {
  itemCode: string;
  label: string;
  suggestedAmount: number;
  calcParams?: Record<string, any>;
}

// Masraf Seti Şablonları
export const EXPENSE_SET_TEMPLATES = {
  OPENING: {
    code: 'OPENING',
    name: 'Takip Açılış Masrafları',
    items: [
      { code: 'BASVURMA_HARCI', label: 'Başvurma Harcı', calculator: 'calculateBasvurmaHarci' },
      { code: 'PESIN_HARC', label: 'Peşin Harç', calculator: 'calculatePesinHarc' },
      { code: 'VEKALET_HARCI', label: 'Vekalet Harcı', calculator: 'calculateVekaletHarci' },
      { code: 'TEBLIGAT_GIDERI', label: 'Tebligat Gideri', calculator: 'calculateTebligatGideri', params: { count: 1 } },
      { code: 'DOSYA_GIDERI', label: 'Dosya Gideri', calculator: 'calculateDosyaGideri' },
      { code: 'VEKALET_PULU', label: 'Vekalet Pulu', calculator: 'calculateVekaletPulu' },
    ],
    gateType: 'BLOCKING',
  },
  RE_NOTIFICATION: {
    code: 'RE_NOTIFICATION',
    name: 'Yeniden Tebligat Masrafları',
    items: [
      { code: 'YENIDEN_TEBLIGAT', label: 'Yeniden Tebligat Gideri', calculator: 'calculateTebligatGideri', params: { count: 1 } },
    ],
    gateType: 'BLOCKING',
  },
  SEIZURE: {
    code: 'SEIZURE',
    name: 'Haciz Masrafları',
    items: [
      { code: 'HACIZ_HARCI', label: 'Haciz Harcı', calculator: 'calculateHacizHarci' },
      { code: 'HACIZ_YOLLUK', label: 'Haciz Yolluk', calculator: 'calculateHacizYolluk' },
    ],
    gateType: 'BLOCKING',
  },
  SALE: {
    code: 'SALE',
    name: 'Satış Masrafları',
    items: [
      { code: 'ILAN_GIDERI', label: 'İlan Gideri', calculator: 'calculateIlanGideri' },
      { code: 'SATIS_HARCI', label: 'Satış Harcı', calculator: 'calculateSatisHarci' },
    ],
    gateType: 'BLOCKING',
  },
} as const;

@Injectable()
export class ExpenseCalculatorService {
  private readonly logger = new Logger(ExpenseCalculatorService.name);

  constructor(private tariffService: TariffService) {}

  /**
   * Başvurma Harcı hesapla (sabit tutar)
   */
  calculateBasvurmaHarci(principalAmount: number): Decimal {
    const tariff = this.tariffService.getActiveTariff();
    const fee = tariff?.fixed_fees?.application_fee?.amount || 738.50;
    return new Decimal(fee);
  }

  /**
   * Peşin Harç hesapla (binde 5)
   */
  calculatePesinHarc(principalAmount: number, interestAmount: number = 0): Decimal {
    const tariff = this.tariffService.getActiveTariff();
    const rateFee = tariff?.rate_fees?.ilamsiz_pesin_harc;
    const rate = rateFee?.rate || 0.005;
    const minAmount = rateFee?.min_amount || 120;

    const base = principalAmount + interestAmount;
    const calculated = base * rate;
    
    return new Decimal(Math.max(calculated, minAmount));
  }

  /**
   * Vekalet Harcı hesapla (sabit tutar)
   */
  calculateVekaletHarci(): Decimal {
    const tariff = this.tariffService.getActiveTariff();
    const fee = tariff?.fixed_fees?.poa_copy_fee?.amount || 105.00;
    return new Decimal(fee);
  }

  /**
   * Tebligat Gideri hesapla (adet bazlı)
   */
  calculateTebligatGideri(count: number = 1, type: 'NORMAL' | 'UETS' | 'FAST' = 'NORMAL'): Decimal {
    const tariff = this.tariffService.getActiveTariff();
    const postage = tariff?.postage?.[type];
    const unitAmount = postage?.amount || 252.00;
    return new Decimal(unitAmount * count);
  }

  /**
   * Dosya Gideri hesapla (sabit tutar)
   */
  calculateDosyaGideri(): Decimal {
    const tariff = this.tariffService.getActiveTariff();
    const fee = tariff?.fixed_fees?.file_expense?.amount || 50.00;
    return new Decimal(fee);
  }

  /**
   * Vekalet Pulu hesapla (sabit tutar)
   */
  calculateVekaletPulu(): Decimal {
    const tariff = this.tariffService.getActiveTariff();
    const fee = tariff?.fixed_fees?.bar_stamp_fee?.amount || 165.60;
    return new Decimal(fee);
  }

  /**
   * Haciz Harcı hesapla (nispi)
   */
  calculateHacizHarci(principalAmount: number): Decimal {
    const tariff = this.tariffService.getActiveTariff();
    const seizureFee = (tariff as any)?.seizure_fees?.haciz_harci;
    const rate = seizureFee?.rate || 0.0044;
    const minAmount = seizureFee?.min_amount || 100;

    const calculated = principalAmount * rate;
    return new Decimal(Math.max(calculated, minAmount));
  }

  /**
   * Haciz Yolluk hesapla (sabit tutar)
   */
  calculateHacizYolluk(): Decimal {
    const tariff = this.tariffService.getActiveTariff();
    const fee = (tariff as any)?.seizure_fees?.haciz_yolluk?.amount || 350.00;
    return new Decimal(fee);
  }

  /**
   * İlan Gideri hesapla (sabit tutar - ortalama)
   */
  calculateIlanGideri(): Decimal {
    const tariff = this.tariffService.getActiveTariff();
    const fee = (tariff as any)?.sale_fees?.ilan_gideri?.amount || 2500.00;
    return new Decimal(fee);
  }

  /**
   * Satış Harcı hesapla (nispi)
   */
  calculateSatisHarci(saleAmount: number): Decimal {
    const tariff = this.tariffService.getActiveTariff();
    const saleFee = (tariff as any)?.sale_fees?.satis_harci;
    const rate = saleFee?.rate || 0.0113;

    return new Decimal(saleAmount * rate);
  }

  /**
   * Açılış masrafları hesapla (6 kalem)
   */
  calculateOpeningExpenses(caseData: CaseData): ExpenseItemCalculation[] {
    const template = EXPENSE_SET_TEMPLATES.OPENING;
    const items: ExpenseItemCalculation[] = [];

    for (const item of template.items) {
      let amount: Decimal;
      let calcParams: Record<string, any> = {};

      switch (item.calculator) {
        case 'calculateBasvurmaHarci':
          amount = this.calculateBasvurmaHarci(caseData.principalAmount);
          calcParams = { principalAmount: caseData.principalAmount };
          break;
        case 'calculatePesinHarc':
          amount = this.calculatePesinHarc(caseData.principalAmount, caseData.interestAmount || 0);
          calcParams = { principalAmount: caseData.principalAmount, interestAmount: caseData.interestAmount || 0 };
          break;
        case 'calculateVekaletHarci':
          amount = this.calculateVekaletHarci();
          break;
        case 'calculateTebligatGideri':
          const count = item.params?.count || caseData.debtorCount || 1;
          amount = this.calculateTebligatGideri(count);
          calcParams = { count };
          break;
        case 'calculateDosyaGideri':
          amount = this.calculateDosyaGideri();
          break;
        case 'calculateVekaletPulu':
          amount = this.calculateVekaletPulu();
          break;
        default:
          amount = new Decimal(0);
      }

      items.push({
        itemCode: item.code,
        label: item.label,
        suggestedAmount: amount.toNumber(),
        calcParams,
      });
    }

    return items;
  }

  /**
   * Aşama bazlı masraflar hesapla
   */
  calculateStageExpenses(stageCode: string, caseData: CaseData): ExpenseItemCalculation[] {
    const template = EXPENSE_SET_TEMPLATES[stageCode as keyof typeof EXPENSE_SET_TEMPLATES];
    if (!template) {
      this.logger.warn(`Unknown stage code: ${stageCode}`);
      return [];
    }

    const items: ExpenseItemCalculation[] = [];

    for (const item of template.items) {
      let amount: Decimal;
      let calcParams: Record<string, any> = {};

      switch (item.calculator) {
        case 'calculateTebligatGideri':
          const count = item.params?.count || 1;
          amount = this.calculateTebligatGideri(count);
          calcParams = { count };
          break;
        case 'calculateHacizHarci':
          amount = this.calculateHacizHarci(caseData.principalAmount);
          calcParams = { principalAmount: caseData.principalAmount };
          break;
        case 'calculateHacizYolluk':
          amount = this.calculateHacizYolluk();
          break;
        case 'calculateIlanGideri':
          amount = this.calculateIlanGideri();
          break;
        case 'calculateSatisHarci':
          amount = this.calculateSatisHarci(caseData.principalAmount);
          calcParams = { principalAmount: caseData.principalAmount };
          break;
        default:
          amount = new Decimal(0);
      }

      items.push({
        itemCode: item.code,
        label: item.label,
        suggestedAmount: amount.toNumber(),
        calcParams,
      });
    }

    return items;
  }

  /**
   * Toplam masraf hesapla
   */
  calculateTotal(items: ExpenseItemCalculation[]): number {
    return items.reduce((sum, item) => sum + item.suggestedAmount, 0);
  }

  /**
   * Masraf seti şablonunu getir
   */
  getTemplate(stageCode: string) {
    return EXPENSE_SET_TEMPLATES[stageCode as keyof typeof EXPENSE_SET_TEMPLATES] || null;
  }

  /**
   * Tüm şablonları getir
   */
  getAllTemplates() {
    return EXPENSE_SET_TEMPLATES;
  }
}
