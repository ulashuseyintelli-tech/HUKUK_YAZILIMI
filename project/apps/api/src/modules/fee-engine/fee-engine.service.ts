import { Injectable, OnModuleInit, Logger, Inject, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type {
  ITariffRepository,
  Tariff,
  GeneratedFeeItem,
  FeeProfile,
  FeeProfileItem,
} from '@shared/types';

/**
 * Fee Engine Service
 * 
 * Sorumluluklar:
 * - Masraf hesaplama (açılış masrafları, tebligat, harçlar)
 * - Masraf profili yönetimi
 * 
 * NOT: Tarife YAML yönetimi bu modülün sorumluluğunda DEĞİL.
 * @see tariff - Tarife YAML yönetimi için tek kaynak
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

// Internal types (YAML format - snake_case)
interface InternalFeeProfile {
  applies_to_case_types: string[];
  tariff_year: number;
  fixed_fee_items: Array<{
    code: string;
    item_type: string;
    label: string;
    auto_add: boolean;
    formula?: { base: string; rate_from_tariff: string };
  }>;
  rate_fee_items: Array<{
    code: string;
    item_type: string;
    label: string;
    auto_add: boolean;
    formula?: { base: string; rate_from_tariff: string };
  }>;
  postage_policy: {
    default: string;
    allow: string[];
    auto_add: boolean;
    per_debtor?: boolean;
  };
}

// Injection token for TariffRepository
export const TARIFF_REPOSITORY = 'TARIFF_REPOSITORY';

@Injectable()
export class FeeEngineService implements OnModuleInit {
  private readonly logger = new Logger(FeeEngineService.name);
  private feeProfiles: Map<string, InternalFeeProfile> = new Map();
  private currentYear: number = new Date().getFullYear();
  
  // Fallback tariff (TariffRepository yoksa)
  private fallbackTariff: Tariff | null = null;

  constructor(
    @Optional() @Inject(TARIFF_REPOSITORY) private readonly tariffRepository?: ITariffRepository,
  ) {}

  async onModuleInit() {
    await this.loadFeeProfiles();
    
    // TariffRepository yoksa fallback yükle
    if (!this.tariffRepository) {
      this.logger.warn('TariffRepository not injected, using fallback tariff');
      this.fallbackTariff = this.getDefaultTariff();
    }
  }

  // ============================================
  // TARIFF ACCESS (via Repository or Fallback)
  // ============================================

  private getTariff(year?: number): Tariff | null {
    const targetYear = year || this.currentYear;
    
    if (this.tariffRepository) {
      return this.tariffRepository.getTariff(targetYear) 
        || this.tariffRepository.getActiveTariff();
    }
    
    return this.fallbackTariff;
  }

  private getDefaultTariff(): Tariff {
    return {
      version: 1,
      year: 2025,
      effectiveDate: '2025-01-01',
      fixedFees: {
        application_fee: { amount: 615.40, label: 'Başvurma Harcı', itemType: 'FEE', appliesTo: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
        poa_copy_fee: { amount: 87.50, label: 'Vekalet Suret Harcı', itemType: 'FEE', appliesTo: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
        bar_stamp_fee: { amount: 138.00, label: 'Vekalet Pulu', itemType: 'STAMP', appliesTo: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
      },
      rateFees: {
        ilamsiz_pesin_harc: { rate: 0.005, label: 'Peşin Harç', itemType: 'FEE', base: 'principal_plus_interest', appliesTo: ['ILAMSIZ', 'KIRA'], minAmount: 100 },
        kambiyo_pesin_harc: { rate: 0.005, label: 'Peşin Harç', itemType: 'FEE', base: 'principal_plus_interest', appliesTo: ['KAMBIYO'], minAmount: 100 },
      },
      postage: {
        UETS: { amount: 15.00, label: 'UETS Tebligat', description: 'Elektronik tebligat' },
        NORMAL: { amount: 210.00, label: 'Normal Tebligat', description: 'PTT normal tebligat' },
        FAST: { amount: 420.00, label: 'Hızlı Tebligat', description: 'PTT hızlı tebligat' },
        PUBLIC_ANNOUNCEMENT: { amount: null, label: 'İlanen Tebligat', description: 'Gazete ilanı' },
      },
      interestRates: {
        TRY: {
          YASAL: [{ startDate: '2024-01-01', rate: 24 }],
          TICARI: [{ startDate: '2024-01-01', rate: 48 }],
        },
      },
      penalties: {
        bad_check_compensation: { defaultRate: 0.10, maxRate: 0.20, label: 'Karşılıksız Çek Tazminatı' },
      },
    };
  }

  // ============================================
  // FEE PROFILES (YAML)
  // ============================================

  private async loadFeeProfiles(): Promise<void> {
    try {
      const possiblePaths = [
        path.join(process.cwd(), 'src/config/fee-profiles.yaml'),
        path.join(process.cwd(), 'dist/config/fee-profiles.yaml'),
        path.join(__dirname, '../../config/fee-profiles.yaml'),
      ];

      for (const configPath of possiblePaths) {
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          const data = yaml.load(content) as Record<string, any>;
          
          for (const [key, profile] of Object.entries(data)) {
            if (key !== 'version' && key !== 'engine') {
              this.feeProfiles.set(key, profile as InternalFeeProfile);
            }
          }
          
          this.logger.log(`✅ ${this.feeProfiles.size} masraf profili yüklendi`);
          return;
        }
      }

      this.logger.warn('Masraf profili bulunamadı, varsayılan değerler kullanılacak');
      this.loadDefaultFeeProfiles();
    } catch (error) {
      this.logger.error('Masraf profilleri yüklenemedi:', error);
      this.loadDefaultFeeProfiles();
    }
  }

  private loadDefaultFeeProfiles(): void {
    this.feeProfiles.set('ILAMSIZ_OPENING', {
      applies_to_case_types: ['ILAMSIZ', 'KIRA', 'TAHLIYE'],
      tariff_year: 2025,
      fixed_fee_items: [
        { code: 'application_fee', item_type: 'FEE', label: 'Başvurma Harcı', auto_add: true },
        { code: 'poa_copy_fee', item_type: 'FEE', label: 'Vekalet Suret Harcı', auto_add: true },
        { code: 'bar_stamp_fee', item_type: 'STAMP', label: 'Vekalet Pulu', auto_add: true },
      ],
      rate_fee_items: [
        { code: 'ilamsiz_pesin_harc', item_type: 'FEE', label: 'Peşin Harç', auto_add: true, formula: { base: 'principal_plus_interest', rate_from_tariff: 'ilamsiz_pesin_harc' } },
      ],
      postage_policy: { default: 'NORMAL', allow: ['UETS', 'NORMAL', 'FAST'], auto_add: true, per_debtor: true },
    });

    this.feeProfiles.set('KAMBIYO_OPENING', {
      applies_to_case_types: ['KAMBIYO'],
      tariff_year: 2025,
      fixed_fee_items: [
        { code: 'application_fee', item_type: 'FEE', label: 'Başvurma Harcı', auto_add: true },
        { code: 'poa_copy_fee', item_type: 'FEE', label: 'Vekalet Suret Harcı', auto_add: true },
        { code: 'bar_stamp_fee', item_type: 'STAMP', label: 'Vekalet Pulu', auto_add: true },
      ],
      rate_fee_items: [
        { code: 'kambiyo_pesin_harc', item_type: 'FEE', label: 'Peşin Harç', auto_add: true, formula: { base: 'principal_plus_interest', rate_from_tariff: 'kambiyo_pesin_harc' } },
      ],
      postage_policy: { default: 'NORMAL', allow: ['UETS', 'NORMAL', 'FAST'], auto_add: true, per_debtor: true },
    });

    this.feeProfiles.set('ILAMLI_OPENING', {
      applies_to_case_types: ['ILAMLI'],
      tariff_year: 2025,
      fixed_fee_items: [
        { code: 'application_fee', item_type: 'FEE', label: 'Başvurma Harcı', auto_add: true },
        { code: 'poa_copy_fee', item_type: 'FEE', label: 'Vekalet Suret Harcı', auto_add: true },
        { code: 'bar_stamp_fee', item_type: 'STAMP', label: 'Vekalet Pulu', auto_add: true },
      ],
      rate_fee_items: [],
      postage_policy: { default: 'UETS', allow: ['UETS', 'NORMAL', 'FAST'], auto_add: true, per_debtor: true },
    });
  }

  // ============================================
  // ANA FONKSİYONLAR
  // ============================================

  /**
   * Takip türüne göre açılış masraflarını hesapla
   */
  calculateOpeningFees(
    caseType: string,
    principalAmount: number,
    accruedInterest: number = 0,
    debtorCount: number = 1,
    postageType: string = 'NORMAL',
    tariffYear?: number,
  ): GeneratedFeeItem[] {
    const tariff = this.getTariff(tariffYear);
    if (!tariff) {
      this.logger.warn('Tarife bulunamadı');
      return [];
    }

    const items: GeneratedFeeItem[] = [];
    const profile = this.findProfileForCaseType(caseType);
    
    if (!profile) {
      this.logger.warn(`Masraf profili bulunamadı: ${caseType}`);
      return items;
    }

    // 1. Sabit harçlar
    for (const feeItem of profile.fixed_fee_items) {
      if (!feeItem.auto_add) continue;
      
      const tariffFee = tariff.fixedFees[feeItem.code];
      if (tariffFee && tariffFee.appliesTo.includes(caseType)) {
        items.push({
          type: feeItem.item_type,
          label: feeItem.label,
          amount: tariffFee.amount,
          currency: 'TRY',
          isAutoGenerated: true,
          tariffCode: feeItem.code,
        });
      }
    }

    // 2. Nispi harçlar
    for (const feeItem of profile.rate_fee_items) {
      if (!feeItem.auto_add) continue;
      
      const tariffFee = tariff.rateFees[feeItem.code];
      if (tariffFee && tariffFee.appliesTo.includes(caseType)) {
        const base = principalAmount + accruedInterest;
        let amount = base * tariffFee.rate;
        
        if (tariffFee.minAmount && amount < tariffFee.minAmount) {
          amount = tariffFee.minAmount;
        }
        if (tariffFee.maxAmount && amount > tariffFee.maxAmount) {
          amount = tariffFee.maxAmount;
        }
        
        items.push({
          type: feeItem.item_type,
          label: feeItem.label,
          amount: Math.round(amount * 100) / 100,
          currency: 'TRY',
          description: `%${(tariffFee.rate * 100).toFixed(2)} oranında`,
          isAutoGenerated: true,
          tariffCode: feeItem.code,
        });
      }
    }

    // 3. Tebligat gideri
    if (profile.postage_policy.auto_add) {
      const postage = tariff.postage[postageType] || tariff.postage[profile.postage_policy.default];
      if (postage && postage.amount) {
        const count = profile.postage_policy.per_debtor ? debtorCount : 1;
        items.push({
          type: 'POSTAGE',
          label: postage.label,
          amount: postage.amount * count,
          currency: 'TRY',
          description: count > 1 ? `${count} borçlu için` : undefined,
          isAutoGenerated: true,
          tariffCode: postageType,
        });
      }
    }

    return items;
  }

  private findProfileForCaseType(caseType: string): InternalFeeProfile | null {
    for (const [, profile] of this.feeProfiles) {
      if (profile.applies_to_case_types.includes(caseType)) {
        return profile;
      }
    }
    return null;
  }

  /**
   * Faiz oranını getir
   * @deprecated Use interest-engine/RateProviderService instead
   */
  getInterestRate(
    currency: string,
    interestType: string,
    date?: Date,
    tariffYear?: number,
  ): number {
    this.logger.warn('fee-engine.getInterestRate() is deprecated. Use interest-engine instead.');
    
    const tariff = this.getTariff(tariffYear);
    if (!tariff) return 24;
    
    const currencyRates = tariff.interestRates[currency];
    if (!currencyRates) return 24;
    
    const typeRates = currencyRates[interestType];
    if (!typeRates || typeRates.length === 0) return 24;
    
    const dateStr = (date || new Date()).toISOString().split('T')[0];
    let applicableRate = typeRates[0].rate;
    
    for (const entry of typeRates) {
      if (entry.startDate <= dateStr) {
        applicableRate = entry.rate;
      }
    }
    
    return applicableRate;
  }

  /**
   * Tebligat ücretini getir
   */
  getPostageAmount(postageType: string, tariffYear?: number): number {
    const tariff = this.getTariff(tariffYear);
    if (!tariff) return 0;
    
    const postage = tariff.postage[postageType];
    return postage?.amount || 0;
  }

  /**
   * Ceza/tazminat hesapla
   */
  calculatePenalty(
    penaltyType: string,
    principalAmount: number,
    customRate?: number,
    tariffYear?: number,
  ): number {
    const tariff = this.getTariff(tariffYear);
    if (!tariff) return 0;
    
    const penalty = tariff.penalties[penaltyType];
    if (!penalty) return 0;
    
    const rate = customRate ?? penalty.defaultRate;
    const effectiveRate = penalty.maxRate ? Math.min(rate, penalty.maxRate) : rate;
    
    return Math.round(principalAmount * effectiveRate * 100) / 100;
  }

  /**
   * Mevcut tarife yılını getir
   */
  getCurrentTariffYear(): number {
    return this.currentYear;
  }

  /**
   * Tüm tebligat türlerini getir
   */
  getPostageTypes(tariffYear?: number): Array<{ code: string; label: string; amount: number | null }> {
    const tariff = this.getTariff(tariffYear);
    if (!tariff) return [];
    
    return Object.entries(tariff.postage).map(([code, data]) => ({
      code,
      label: data.label,
      amount: data.amount,
    }));
  }

  /**
   * Profil için izin verilen tebligat türlerini getir
   */
  getAllowedPostageTypes(caseType: string): string[] {
    const profile = this.findProfileForCaseType(caseType);
    return profile?.postage_policy.allow || ['NORMAL'];
  }

  /**
   * Toplam masraf hesapla
   */
  calculateTotalFees(items: GeneratedFeeItem[]): number {
    return items.reduce((sum, item) => sum + item.amount, 0);
  }

  // ============================================
  // PREVIEW CALCULATION (Phase 3.1 - Tek Kaynak)
  // ============================================

  /**
   * Preview hesaplama - aynı matematik, daha az bürokrasi
   * 
   * calculateOpeningFees() ile AYNI:
   * - Tariff lookup
   * - Fee calculation
   * - Breakdown
   * 
   * calculateOpeningFees() ile FARKLI:
   * - NO audit log
   * - Simplified response format
   * 
   * @see docs/single-source-of-truth-architecture.md - Phase 3.1
   */
  previewCalculation(params: {
    principalAmount: number;
    accruedInterest?: number;
    caseType?: string;
    debtorCount?: number;
    postageType?: string;
    tariffYear?: number;
  }): FeePreviewResult {
    const {
      principalAmount,
      accruedInterest = 0,
      caseType = 'ILAMSIZ',
      debtorCount = 1,
      postageType = 'NORMAL',
      tariffYear,
    } = params;

    // 1. Get tariff
    const tariff = this.getTariff(tariffYear);
    if (!tariff) {
      return {
        success: false,
        error: {
          code: 'TARIFF_NOT_FOUND',
          message: `Tariff not found for year: ${tariffYear || this.currentYear}`,
        },
      };
    }

    // 2. Calculate fees using real engine
    const feeItems = this.calculateOpeningFees(
      caseType,
      principalAmount,
      accruedInterest,
      debtorCount,
      postageType,
      tariffYear,
    );

    // 3. Build breakdown
    const breakdown = this.buildPreviewBreakdown(feeItems);

    // 4. Calculate attorney fee
    const estimatedAttorneyFee = this.calculateAttorneyFeePreview(
      principalAmount + accruedInterest
    );

    // 5. Total fees
    const estimatedFees = this.calculateTotalFees(feeItems);

    return {
      success: true,
      data: {
        estimatedFees,
        estimatedAttorneyFee,
        tariffYear: tariff.year,
        breakdown,
        itemCount: feeItems.length,
      },
      versions: {
        tariffVersion: `${tariff.year}.${tariff.version}`,
        tariffYear: tariff.year,
      },
    };
  }

  /**
   * Preview için breakdown oluştur
   */
  private buildPreviewBreakdown(items: GeneratedFeeItem[]): FeePreviewBreakdown {
    const findAmount = (code: string): number => {
      const item = items.find(i => i.tariffCode === code);
      return item?.amount || 0;
    };

    return {
      basvurmaHarci: findAmount('application_fee'),
      vekaletHarci: findAmount('poa_copy_fee'),
      pesinHarc: findAmount('ilamsiz_pesin_harc') || findAmount('kambiyo_pesin_harc'),
      dosyaGideri: 50.00, // Sabit dosya gideri
      tebligatGideri: findAmount('NORMAL') || findAmount('UETS') || findAmount('FAST'),
      vekaletPulu: findAmount('bar_stamp_fee'),
    };
  }

  /**
   * Vekalet ücreti hesaplama (2025 tarife)
   * GERÇEK tarife değerleri
   */
  private calculateAttorneyFeePreview(takipTutari: number): number {
    // 2025 Avukatlık Asgari Ücret Tarifesi - İcra Takipleri
    const tarifeler = [
      { min: 0, max: 55000, fixed: 11000, rate: 0 },
      { min: 55000, max: 130000, fixed: 11000, rate: 0.14 },
      { min: 130000, max: 390000, fixed: 21500, rate: 0.12 },
      { min: 390000, max: 780000, fixed: 52700, rate: 0.08 },
      { min: 780000, max: 1950000, fixed: 83900, rate: 0.04 },
      { min: 1950000, max: Infinity, fixed: 130700, rate: 0.01 },
    ];
    const minimum = 11000;

    for (const tarife of tarifeler) {
      if (takipTutari <= tarife.max) {
        const ucret = tarife.fixed + ((takipTutari - tarife.min) * tarife.rate);
        return Math.max(ucret, minimum);
      }
    }

    const sonTarife = tarifeler[tarifeler.length - 1];
    return sonTarife.fixed + ((takipTutari - sonTarife.min) * sonTarife.rate);
  }
}

// ============================================
// PREVIEW RESULT TYPES
// ============================================

export interface FeePreviewBreakdown {
  basvurmaHarci: number;
  vekaletHarci: number;
  pesinHarc: number;
  dosyaGideri: number;
  tebligatGideri: number;
  vekaletPulu: number;
}

export interface FeePreviewResult {
  success: boolean;
  data?: {
    estimatedFees: number;
    estimatedAttorneyFee: number;
    tariffYear: number;
    breakdown: FeePreviewBreakdown;
    itemCount: number;
  };
  error?: {
    code: string;
    message: string;
  };
  versions?: {
    tariffVersion: string;
    tariffYear: number;
  };
}
