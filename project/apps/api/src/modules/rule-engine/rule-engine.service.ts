import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * @deprecated Bu servis CPE RuleEngine'e taşındı.
 * 
 * ⛔ BU MODÜLÜ KULLANMAYIN ⛔
 * 
 * Yeni kod için: import { RuleEngineService } from '@/modules/policy-engine/rule-engine'
 * Faiz hesaplama için: import { InterestEngineService } from '@/modules/interest-engine'
 * 
 * Migration durumu: Phase 3 sonunda SİLİNECEK
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 * @see policy-engine/rule-engine/ - Yeni implementasyon
 */

/**
 * Rule Engine Servisi
 * 
 * @deprecated CPE RuleEngine kullanın
 * 
 * İlamlı takip alt kategorilerine göre özel davranışlar:
 * - NAFAKA: Aylık alacak hesaplama, dönem takibi
 * - DOVIZ: Kur hesaplama, TCMB entegrasyonu
 * - GENEL: Standart faiz hesaplama
 */

export interface NafakaCalculation {
  periods: NafakaPeriod[];
  totalAmount: number;
  monthlyAmount: number;
  startDate: Date;
  endDate: Date;
}

export interface NafakaPeriod {
  month: string;
  year: number;
  amount: number;
  isPaid: boolean;
  dueDate: Date;
}

export interface ExchangeRateResult {
  currency: string;
  rate: number;
  date: string;
  source: string;
  tlAmount: number;
}

export interface InterestCalculation {
  principal: number;
  rate: number;
  days: number;
  interest: number;
  total: number;
  description: string;
}

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(private prisma: PrismaService) {}

  // ============================================
  // NAFAKA KURALLARI
  // ============================================

  /**
   * Nafaka dönemlerini hesapla
   * Başlangıç tarihinden bugüne kadar olan tüm ayları listeler
   */
  calculateNafakaPeriods(
    startDate: Date,
    monthlyAmount: number,
    endDate?: Date
  ): NafakaCalculation {
    const periods: NafakaPeriod[] = [];
    const start = new Date(startDate);
    const end = endDate || new Date();
    
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    
    while (current <= end) {
      periods.push({
        month: current.toLocaleDateString('tr-TR', { month: 'long' }),
        year: current.getFullYear(),
        amount: monthlyAmount,
        isPaid: false,
        dueDate: new Date(current),
      });
      current.setMonth(current.getMonth() + 1);
    }

    return {
      periods,
      totalAmount: periods.length * monthlyAmount,
      monthlyAmount,
      startDate: start,
      endDate: end,
    };
  }

  /**
   * Nafaka dosyasına yeni dönem ekle
   */
  async addNafakaPeriodToCase(caseId: string): Promise<any> {
    const caseData = await (this.prisma as any).case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        fileNumber: true,
        subCategory: true,
        monthlyNafakaAmount: true,
        nafakaStartDate: true,
      },
    });

    if (!caseData || caseData.subCategory !== 'NAFAKA') {
      throw new Error('Bu dosya nafaka dosyası değil');
    }

    const monthlyAmount = Number(caseData.monthlyNafakaAmount || 0);
    if (monthlyAmount <= 0) {
      throw new Error('Aylık nafaka tutarı belirtilmemiş');
    }

    const currentMonth = new Date();
    const period = currentMonth.toLocaleDateString('tr-TR', { 
      month: 'long', 
      year: 'numeric' 
    });

    // Yeni alacak kalemi ekle
    const due = await (this.prisma as any).due.create({
      data: {
        caseId,
        type: 'PRINCIPAL',
        description: `${period} Nafaka`,
        amount: monthlyAmount,
        dueDate: currentMonth,
      },
    });

    this.logger.log(`✅ Nafaka dönemi eklendi: ${caseData.fileNumber} - ${period}`);

    return {
      due,
      period,
      amount: monthlyAmount,
    };
  }

  /**
   * Nafaka birikmiş alacak hesapla
   */
  async calculateAccumulatedNafaka(caseId: string): Promise<NafakaCalculation | null> {
    const caseData = await (this.prisma as any).case.findUnique({
      where: { id: caseId },
      include: { dues: true },
    });

    if (!caseData || caseData.subCategory !== 'NAFAKA') {
      return null;
    }

    const monthlyAmount = Number(caseData.monthlyNafakaAmount || 0);
    const startDate = caseData.nafakaStartDate;

    if (!startDate || monthlyAmount <= 0) {
      return null;
    }

    const calculation = this.calculateNafakaPeriods(startDate, monthlyAmount);

    // Ödenen dönemleri işaretle
    const paidDues = caseData.dues?.filter((d: any) => 
      d.type === 'PRINCIPAL' && d.description?.includes('Nafaka')
    ) || [];

    // Basit eşleştirme - gerçek uygulamada daha detaylı olmalı
    calculation.periods.forEach((period, index) => {
      if (index < paidDues.length) {
        period.isPaid = true;
      }
    });

    return calculation;
  }

  // ============================================
  // DÖVİZ KURALLARI
  // ============================================

  /**
   * TCMB'den güncel kur al
   * Not: Gerçek API entegrasyonu için TCMB EVDS API kullanılmalı
   */
  async getExchangeRate(
    currency: string,
    date?: Date
  ): Promise<ExchangeRateResult> {
    // Varsayılan kurlar (gerçek API entegrasyonu yapılana kadar)
    const defaultRates: Record<string, number> = {
      USD: 34.50,
      EUR: 36.20,
      GBP: 43.80,
      CHF: 38.90,
    };

    const rate = defaultRates[currency] || 1;
    const dateStr = (date || new Date()).toLocaleDateString('tr-TR');

    this.logger.log(`💱 Kur sorgusu: ${currency} = ${rate} TL (${dateStr})`);

    return {
      currency,
      rate,
      date: dateStr,
      source: 'DEFAULT', // Gerçek API'de 'TCMB' olacak
      tlAmount: 0, // Hesaplama için kullanılacak
    };
  }

  /**
   * Döviz alacağını TL'ye çevir
   */
  async convertToTL(
    amount: number,
    currency: string,
    exchangeRateType: 'TAKIP_TARIHI' | 'ODEME_TARIHI',
    exchangeDate?: Date
  ): Promise<ExchangeRateResult> {
    let rateDate: Date;

    if (exchangeRateType === 'TAKIP_TARIHI' && exchangeDate) {
      rateDate = exchangeDate;
    } else {
      rateDate = new Date(); // Fiili ödeme tarihi = bugün
    }

    const rateResult = await this.getExchangeRate(currency, rateDate);
    rateResult.tlAmount = amount * rateResult.rate;

    this.logger.log(
      `💱 Döviz çevirimi: ${amount} ${currency} = ${rateResult.tlAmount.toFixed(2)} TL`
    );

    return rateResult;
  }

  /**
   * Döviz dosyası için kur bilgisi güncelle
   */
  async updateCaseExchangeRate(caseId: string): Promise<any> {
    const caseData = await (this.prisma as any).case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        subCategory: true,
        currency: true,
        principalAmount: true,
        exchangeRateType: true,
        exchangeDate: true,
      },
    });

    if (!caseData || caseData.subCategory !== 'DOVIZ') {
      throw new Error('Bu dosya döviz dosyası değil');
    }

    const currency = caseData.currency || 'USD';
    const amount = Number(caseData.principalAmount || 0);
    const exchangeRateType = caseData.exchangeRateType || 'ODEME_TARIHI';

    const result = await this.convertToTL(
      amount,
      currency,
      exchangeRateType,
      caseData.exchangeDate
    );

    // Metadata'ya kur bilgisini kaydet
    await (this.prisma as any).case.update({
      where: { id: caseId },
      data: {
        metadata: {
          lastExchangeRate: result.rate,
          lastExchangeDate: result.date,
          tlEquivalent: result.tlAmount,
        },
      },
    });

    return result;
  }

  // ============================================
  // FAİZ HESAPLAMA
  // ============================================

  /**
   * @deprecated Use interest-engine/InterestEngineService instead
   * 
   * Bu metod artık kullanılmamalı. Faiz hesaplama için:
   * ```typescript
   * import { InterestEngineService } from '@/modules/interest-engine';
   * const result = await interestEngine.calculate(request);
   * ```
   * 
   * @see ARCHITECTURE.md - Source of Truth Matrix
   */
  calculateLegalInterest(
    principal: number,
    startDate: Date,
    endDate?: Date,
    rate?: number
  ): InterestCalculation {
    // Deprecation warning
    this.logger.warn(
      '⚠️ rule-engine.calculateLegalInterest() is DEPRECATED. Use interest-engine instead.'
    );

    const end = endDate || new Date();
    const days = Math.floor(
      (end.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Varsayılan yasal faiz oranı
    const annualRate = rate || 24; // %24
    const dailyRate = annualRate / 365 / 100;
    
    const interest = principal * dailyRate * days;

    return {
      principal,
      rate: annualRate,
      days,
      interest: Math.round(interest * 100) / 100,
      total: principal + interest,
      description: `${days} gün için %${annualRate} yasal faiz`,
    };
  }

  /**
   * Alt kategoriye göre faiz açıklaması oluştur
   */
  generateInterestDescription(
    subCategory: string,
    currency?: string
  ): string {
    switch (subCategory) {
      case 'NAFAKA':
        return 'devam eden aylarla birlikte tahsili talebidir.';
      case 'DOVIZ':
        return `fiili ödeme tarihindeki T.C. Merkez Bankası ${currency || 'döviz'} efektif satış kuru üzerinden Türk Lirası karşılığının tahsili talebidir.`;
      case 'GENEL':
      default:
        return 'değişen oranlarda yasal faizi ile birlikte tahsili talebidir.';
    }
  }

  // ============================================
  // KARAR MOTORU
  // ============================================

  /**
   * Dosya için sonraki aksiyonu belirle
   */
  async determineNextAction(caseId: string): Promise<{
    action: string;
    reason: string;
    deadline?: Date;
  }> {
    const caseData = await (this.prisma as any).case.findUnique({
      where: { id: caseId },
      include: {
        dues: true,
        lifecycleEvents: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!caseData) {
      throw new Error('Dosya bulunamadı');
    }

    const { subCategory, workflowStage, caseStatus } = caseData;

    // Dosya kapalıysa işlem yapma
    if (caseStatus === 'KAPALI' || caseStatus === 'ARSIV') {
      return {
        action: 'NONE',
        reason: 'Dosya kapalı veya arşivde',
      };
    }

    // Alt kategoriye göre özel kurallar
    if (subCategory === 'NAFAKA') {
      return this.determineNafakaNextAction(caseData);
    }

    if (subCategory === 'DOVIZ') {
      return this.determineDovizNextAction(caseData);
    }

    // Genel akış
    return this.determineGeneralNextAction(caseData);
  }

  private determineNafakaNextAction(caseData: any): {
    action: string;
    reason: string;
    deadline?: Date;
  } {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Bu ay için nafaka eklendi mi?
    const thisMonthNafaka = caseData.dues?.find((d: any) => {
      const dueDate = new Date(d.dueDate);
      return (
        d.type === 'PRINCIPAL' &&
        d.description?.includes('Nafaka') &&
        dueDate >= firstOfMonth
      );
    });

    if (!thisMonthNafaka) {
      return {
        action: 'ADD_NAFAKA_PERIOD',
        reason: 'Bu ay için nafaka dönemi henüz eklenmedi',
        deadline: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    }

    return {
      action: 'WAIT',
      reason: 'Nafaka dönemi güncel, sonraki ay bekleniyor',
      deadline: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }

  private determineDovizNextAction(caseData: any): {
    action: string;
    reason: string;
    deadline?: Date;
  } {
    const metadata = caseData.metadata as any;
    const lastUpdate = metadata?.lastExchangeDate;

    // Kur 1 günden eski mi?
    if (!lastUpdate) {
      return {
        action: 'UPDATE_EXCHANGE_RATE',
        reason: 'Kur bilgisi henüz alınmamış',
      };
    }

    const lastUpdateDate = new Date(lastUpdate);
    const daysSinceUpdate = Math.floor(
      (Date.now() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceUpdate > 1) {
      return {
        action: 'UPDATE_EXCHANGE_RATE',
        reason: `Kur bilgisi ${daysSinceUpdate} gün önce güncellendi`,
      };
    }

    return {
      action: 'WAIT',
      reason: 'Kur bilgisi güncel',
    };
  }

  private determineGeneralNextAction(caseData: any): {
    action: string;
    reason: string;
    deadline?: Date;
  } {
    const { workflowStage, nextActionAt } = caseData;

    if (workflowStage === 'WAITING_RESPONSE' && nextActionAt) {
      const deadline = new Date(nextActionAt);
      if (deadline <= new Date()) {
        return {
          action: 'PROCEED_TO_ENFORCEMENT',
          reason: 'Ödeme emri süresi doldu',
        };
      }
      return {
        action: 'WAIT',
        reason: 'Ödeme emri süresi bekleniyor',
        deadline,
      };
    }

    return {
      action: 'REVIEW',
      reason: 'Manuel inceleme gerekli',
    };
  }

  /**
   * Dosya için özet bilgi oluştur
   */
  async getCaseSummary(caseId: string): Promise<{
    subCategory: string;
    totalDebt: number;
    currency: string;
    specialInfo: any;
  }> {
    const caseData = await (this.prisma as any).case.findUnique({
      where: { id: caseId },
      include: { dues: true },
    });

    if (!caseData) {
      throw new Error('Dosya bulunamadı');
    }

    const totalDebt = caseData.dues?.reduce(
      (sum: number, d: any) => sum + Number(d.amount),
      0
    ) || Number(caseData.principalAmount || 0);

    let specialInfo: any = {};

    if (caseData.subCategory === 'NAFAKA') {
      const nafakaCalc = await this.calculateAccumulatedNafaka(caseId);
      specialInfo = {
        type: 'nafaka',
        monthlyAmount: caseData.monthlyNafakaAmount,
        startDate: caseData.nafakaStartDate,
        periods: nafakaCalc?.periods.length || 0,
        accumulated: nafakaCalc?.totalAmount || 0,
      };
    } else if (caseData.subCategory === 'DOVIZ') {
      const exchangeResult = await this.getExchangeRate(caseData.currency || 'USD');
      specialInfo = {
        type: 'doviz',
        currency: caseData.currency,
        exchangeRate: exchangeResult.rate,
        exchangeDate: exchangeResult.date,
        tlEquivalent: totalDebt * exchangeResult.rate,
      };
    }

    return {
      subCategory: caseData.subCategory || 'GENEL',
      totalDebt,
      currency: caseData.currency || 'TRY',
      specialInfo,
    };
  }
}
