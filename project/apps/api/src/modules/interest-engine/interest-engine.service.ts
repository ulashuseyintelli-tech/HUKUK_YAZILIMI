import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RateScheduleService } from './rate-schedule.service';
import { PaymentAllocationService } from './payment-allocation.service';
import { PolicyGateService } from './policy-gate.service';
import { InterestAuditLogService } from './audit-log.service';
import {
  InterestCalculationRequest,
  InterestCalculationResult,
  InterestSegment,
  PrincipalItem,
  Payment,
  RateEntry,
  InterestTypeCode,
  DebtState,
  PolicyWarning,
} from './types';
import {
  CaseType,
  StartDateEvent,
  DebtNature,
  getInterestStrategy,
  resolveInterestTypeByDebtNature,
  InterestStrategy,
} from './interest-strategy.config';

@Injectable()
export class InterestEngineService {
  private readonly logger = new Logger(InterestEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateSchedule: RateScheduleService,
    private readonly paymentAllocation: PaymentAllocationService,
    private readonly policyGate: PolicyGateService,
    private readonly auditLog: InterestAuditLogService,
  ) {}

  /**
   * Calculate interest for given principal items
   */
  async calculateInterest(
    request: InterestCalculationRequest,
    tenantId: string,
    userId?: string,
  ): Promise<InterestCalculationResult> {
    const startTime = Date.now();
    const policyWarnings: PolicyWarning[] = [];

    // 1. Policy Gate Validation
    if (!request.options?.skipPolicyGate) {
      const validation = await this.policyGate.validate(request, tenantId);
      policyWarnings.push(...validation.warnings);

      if (!validation.canProceed) {
        throw new BadRequestException({
          code: 'POLICY_VALIDATION_FAILED',
          message: 'Faiz hesaplama doğrulaması başarısız',
          warnings: validation.warnings,
        });
      }
    }

    // 2. Calculate segments for each principal item
    const allSegments: InterestSegment[] = [];
    let totalInterest = 0;
    let totalPrincipal = 0;

    for (const item of request.principalItems) {
      const segments = await this.calculateItemSegments(
        item, 
        request.asOfDate, 
        tenantId,
        request.enforcementDate,
      );
      allSegments.push(...segments);

      const itemInterest = segments.reduce((sum, s) => sum + s.segmentInterest, 0);
      totalInterest += itemInterest;
      totalPrincipal += item.amount;
    }

    // 2.5 Calculate pre/post enforcement interest totals
    const preEnforcementInterest = allSegments
      .filter(s => s.phase === 'PRE_ENFORCEMENT')
      .reduce((sum, s) => sum + s.segmentInterest, 0);
    
    const postEnforcementInterest = allSegments
      .filter(s => s.phase === 'POST_ENFORCEMENT')
      .reduce((sum, s) => sum + s.segmentInterest, 0);

    // 3. Handle payments with TBK 100 allocation
    let paymentAllocations;
    if (request.payments && request.payments.length > 0) {
      const debtState: DebtState = {
        principal: totalPrincipal,
        accruedInterest: totalInterest,
        costs: 0, // Would come from case
        ancillaries: 0, // Would come from case
      };

      paymentAllocations = this.paymentAllocation.allocateMultiplePayments(
        request.payments,
        debtState,
        (principal, fromDate, toDate) => {
          // Simple interest calculation for inter-payment periods
          const days = this.calculateDays(fromDate, toDate);
          // Use average rate for simplicity
          const avgRate = totalInterest / totalPrincipal / this.calculateDays(
            request.principalItems[0].startDate,
            request.asOfDate,
          ) * 365;
          return (principal * avgRate * days) / 365;
        },
      );

      // Adjust totals based on payments
      const lastAllocation = paymentAllocations[paymentAllocations.length - 1];
      totalPrincipal = lastAllocation.newPrincipal;
      totalInterest = Math.max(0, totalInterest - 
        paymentAllocations.reduce((sum, a) => sum + a.allocations[0].amountAllocated, 0));
    }

    // 4. Generate legal text
    const legalText = this.generateLegalText(
      request.principalItems[0]?.interestType || InterestTypeCode.LEGAL_3095,
      allSegments,
    );

    // 5. Build result
    const result: InterestCalculationResult = {
      caseId: request.caseId,
      calculatedAt: new Date().toISOString(),
      asOfDate: request.asOfDate,
      segments: allSegments,
      totalInterest: this.round(totalInterest),
      totalDue: this.round(totalPrincipal + totalInterest),
      paymentAllocations,
      policyWarnings,
      auditLogId: '', // Will be set after logging
      legalText,
      // Takip öncesi/sonrası faiz ayrımı
      preEnforcementInterest: request.enforcementDate ? this.round(preEnforcementInterest) : undefined,
      postEnforcementInterest: request.enforcementDate ? this.round(postEnforcementInterest) : undefined,
      enforcementDate: request.enforcementDate,
    };

    // 6. Log calculation
    const auditLogId = await this.auditLog.logCalculation(
      request.caseId,
      tenantId,
      request,
      result,
      userId,
    );
    result.auditLogId = auditLogId;

    const elapsed = Date.now() - startTime;
    this.logger.log(
      `Interest calculated for case ${request.caseId}: ` +
      `${this.round(totalInterest)} TL in ${elapsed}ms`,
    );

    return result;
  }

  /**
   * Recalculate interest for an existing case
   * Takip tipine göre otomatik faiz stratejisi seçer
   */
  async recalculateForCase(
    caseId: string,
    asOfDate: string,
    tenantId: string,
    userId?: string,
  ): Promise<InterestCalculationResult> {
    // Get case with dues and claim items
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      include: {
        dues: true,
        collections: true,
        claimItems: true, // Yeni alacak kalemleri tablosu
      },
    });

    if (!caseData) {
      throw new BadRequestException('Dosya bulunamadı');
    }

    // Determine case type and get strategy
    const caseType = this.mapCaseTypeToCaseTypeEnum(caseData.type, caseData.subType);
    const strategy = getInterestStrategy(caseType);
    
    this.logger.debug(`Case ${caseId}: type=${caseType}, strategy=${JSON.stringify(strategy)}`);

    // Convert dues to principal items with strategy-based interest type
    let principalItems: PrincipalItem[] = caseData.dues
      .filter((d) => {
        // Filter by type and accruesInterest flag
        const isRelevantType = d.type === 'PRINCIPAL' || d.isPrimary;
        // Check accruesInterest flag (default true for backwards compatibility)
        const shouldAccrueInterest = d.accruesInterest !== false;
        return isRelevantType && shouldAccrueInterest;
      })
      .map((d) => {
        // Determine interest type based on strategy
        let interestType: InterestTypeCode;
        if (strategy.defaultInterestType === 'AUTO_BY_DEBT_NATURE') {
          // Determine debt nature from case metadata or default to commercial
          const debtNature = strategy.assumeCommercial ? DebtNature.COMMERCIAL : DebtNature.CIVIL;
          interestType = resolveInterestTypeByDebtNature(debtNature);
        } else {
          interestType = strategy.defaultInterestType;
        }

        // Override with explicit interest type if set on due
        if (d.interestType) {
          interestType = this.mapInterestType(d.interestType);
        }

        // Determine start date based on strategy
        const startDate = this.determineStartDate(d, caseData, strategy);

        return {
          id: d.id,
          amount: Number(d.amount),
          currency: (d.currency || 'TRY') as any,
          startDate,
          interestType,
          dayCountBasis: strategy.dayCountBasis,
          // For çek cases, pass ibraz tarihi
          ibrazTarihi: caseData.subType === 'CEK' ? (caseData as any).ibrazTarihi?.toISOString().split('T')[0] : undefined,
          vadeTarihi: d.dueDate?.toISOString().split('T')[0],
        };
      });

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK: Eğer dues tablosunda veri yoksa, claimItems veya principalAmount kullan
    // ═══════════════════════════════════════════════════════════════════════════
    if (principalItems.length === 0) {
      this.logger.debug(`Case ${caseId}: No dues found, checking claimItems and principalAmount`);
      
      // Önce claimItems tablosunu kontrol et (yeni sistem)
      const claimItems = (caseData as any).claimItems || [];
      if (claimItems.length > 0) {
        principalItems = claimItems
          .filter((ci: any) => ci.demandedAmount > 0)
          .map((ci: any) => {
            // Determine interest type from claimItem or strategy
            let interestType: InterestTypeCode;
            if (ci.interestType) {
              interestType = this.mapInterestType(ci.interestType);
            } else if (strategy.defaultInterestType === 'AUTO_BY_DEBT_NATURE') {
              const debtNature = strategy.assumeCommercial ? DebtNature.COMMERCIAL : DebtNature.CIVIL;
              interestType = resolveInterestTypeByDebtNature(debtNature);
            } else {
              interestType = strategy.defaultInterestType;
            }

            // Start date: ibrazTarihi > vadeTarihi > caseDate
            const startDate = ci.ibrazTarihi?.toISOString().split('T')[0] ||
                              ci.vadeTarihi?.toISOString().split('T')[0] ||
                              caseData.caseDate?.toISOString().split('T')[0] ||
                              asOfDate;

            return {
              id: ci.id,
              amount: Number(ci.demandedAmount),
              currency: (ci.currency || 'TRY') as any,
              startDate,
              interestType,
              dayCountBasis: strategy.dayCountBasis,
              ibrazTarihi: ci.ibrazTarihi?.toISOString().split('T')[0],
              vadeTarihi: ci.vadeTarihi?.toISOString().split('T')[0],
            };
          });
        this.logger.debug(`Case ${caseId}: Using ${principalItems.length} claimItems`);
      }
      
      // Hala boşsa, principalAmount'tan oluştur (eski sistem fallback)
      if (principalItems.length === 0 && caseData.principalAmount && Number(caseData.principalAmount) > 0) {
        // Determine interest type based on strategy
        let interestType: InterestTypeCode;
        if (strategy.defaultInterestType === 'AUTO_BY_DEBT_NATURE') {
          const debtNature = strategy.assumeCommercial ? DebtNature.COMMERCIAL : DebtNature.CIVIL;
          interestType = resolveInterestTypeByDebtNature(debtNature);
        } else {
          interestType = strategy.defaultInterestType;
        }

        // Start date: caseDate (takip tarihi) veya asOfDate
        const startDate = caseData.caseDate?.toISOString().split('T')[0] || asOfDate;

        principalItems = [{
          id: `${caseId}-principal`,
          amount: Number(caseData.principalAmount),
          currency: (caseData.currency || 'TRY') as any,
          startDate,
          interestType,
          dayCountBasis: strategy.dayCountBasis,
        }];
        this.logger.debug(`Case ${caseId}: Using principalAmount fallback: ${caseData.principalAmount}`);
      }
    }

    // Hala boşsa hata ver
    if (principalItems.length === 0) {
      throw new BadRequestException({
        code: 'NO_PRINCIPAL_ITEMS',
        message: 'Faiz hesaplaması için alacak kalemi bulunamadı. Lütfen alacak kalemlerini ekleyin.',
      });
    }

    // Convert collections to payments
    const payments: Payment[] = caseData.collections.map((c) => ({
      id: c.id,
      date: c.date.toISOString().split('T')[0],
      amount: Number(c.amount),
      currency: 'TRY' as any,
      source: c.type,
    }));

    const request: InterestCalculationRequest = {
      caseId,
      principalItems,
      payments,
      asOfDate,
      enforcementDate: caseData.caseDate?.toISOString().split('T')[0], // Takip tarihi
      options: {
        includeKarsilisizCekTazminati: strategy.specialRules?.includeKarsilisizCekTazminati,
      },
    };

    return this.calculateInterest(request, tenantId, userId);
  }

  /**
   * Determine start date based on strategy and available data
   */
  private determineStartDate(
    due: any,
    caseData: any,
    strategy: InterestStrategy,
  ): string {
    // If explicit interest start date is set, use it
    if (due.interestStartDate) {
      return due.interestStartDate.toISOString().split('T')[0];
    }

    // Apply strategy-based start date
    switch (strategy.defaultStartEvent) {
      case StartDateEvent.PRESENTATION_DATE:
        // İbraz tarihi (çek için)
        if (caseData.ibrazTarihi) {
          return caseData.ibrazTarihi.toISOString().split('T')[0];
        }
        break;
      
      case StartDateEvent.DRAW_DATE:
        // Keşide tarihi (çek için)
        if (caseData.kesideTarihi) {
          return caseData.kesideTarihi.toISOString().split('T')[0];
        }
        break;
      
      case StartDateEvent.JUDGMENT_DATE:
        // İlam tarihi
        if (caseData.judgmentDate) {
          return caseData.judgmentDate.toISOString().split('T')[0];
        }
        break;
      
      case StartDateEvent.FOLLOWUP_DATE:
        // Takip tarihi
        if (caseData.caseDate) {
          return caseData.caseDate.toISOString().split('T')[0];
        }
        break;
      
      case StartDateEvent.DUE_DATE:
      default:
        // Vade tarihi
        if (due.dueDate) {
          return due.dueDate.toISOString().split('T')[0];
        }
        break;
    }

    // Fallback to due date or case date
    return due.dueDate?.toISOString().split('T')[0] || 
           caseData.caseDate.toISOString().split('T')[0];
  }

  /**
   * Map database case type to CaseType enum
   */
  private mapCaseTypeToCaseTypeEnum(type: string, subType?: string | null): CaseType {
    // Kambiyo takipleri
    if (type === 'KAMBIYO' || type === 'ENFORCEMENT_NEGOTIABLE') {
      if (subType === 'CEK' || subType === 'CHECK') return CaseType.KAMBIYO_CEK;
      if (subType === 'BONO' || subType === 'PROMISSORY_NOTE') return CaseType.KAMBIYO_BONO;
      if (subType === 'POLICE' || subType === 'BILL_OF_EXCHANGE') return CaseType.KAMBIYO_POLICE;
      return CaseType.KAMBIYO_BONO; // Default to bono
    }

    // İlamsız takipler
    if (type === 'ILAMSIZ' || type === 'ENFORCEMENT_WITHOUT_JUDGMENT') {
      if (subType === 'KIRA' || subType === 'RENT') return CaseType.ILAMSIZ_KIRA;
      if (subType === 'NAFAKA' || subType === 'ALIMONY') return CaseType.ILAMSIZ_NAFAKA;
      return CaseType.ILAMSIZ_GENEL;
    }

    // İlamlı takipler
    if (type === 'ILAMLI' || type === 'ENFORCEMENT_WITH_JUDGMENT') {
      return CaseType.ILAMLI;
    }

    // Özel takipler
    if (type === 'IPOTEK' || type === 'MORTGAGE') return CaseType.IPOTEK;
    if (type === 'REHIN' || type === 'PLEDGE') return CaseType.REHIN;

    // TTK 1530
    if (type === 'TTK_1530' || subType === 'SUPPLY_DELAY') return CaseType.TTK_1530_SUPPLY;

    // Default
    return CaseType.ILAMSIZ_GENEL;
  }

  /**
   * Get calculation history for a case
   */
  async getCalculationHistory(
    caseId: string,
    tenantId: string,
  ): Promise<InterestCalculationResult[]> {
    const logs = await this.auditLog.getLogsForCase(caseId, tenantId);
    return logs.map((log) => log.result);
  }

  /**
   * Calculate segments for a single principal item
   * Takip tarihi varsa segmentleri PRE/POST olarak işaretler
   */
  private async calculateItemSegments(
    item: PrincipalItem,
    asOfDate: string,
    tenantId: string,
    enforcementDate?: string,
  ): Promise<InterestSegment[]> {
    const segments: InterestSegment[] = [];
    
    // Determine actual start date (ibraz tarihi for çek)
    const startDate = item.ibrazTarihi || item.startDate;
    const basis = item.dayCountBasis || 365;

    // ═══════════════════════════════════════════════════════════════════════════
    // SABİT ORAN HESAPLAMASI (COMMERCIAL_FIXED, CONTRACTUAL)
    // ═══════════════════════════════════════════════════════════════════════════
    if (
      (item.interestType === InterestTypeCode.COMMERCIAL_FIXED ||
       item.interestType === InterestTypeCode.CONTRACTUAL) &&
      item.fixedRate !== undefined
    ) {
      const days = this.calculateDays(startDate, asOfDate);
      if (days <= 0) return segments;

      const segmentInterest = this.calculateSegmentInterest(
        item.amount,
        item.fixedRate,
        days,
        basis,
      );

      segments.push({
        principalItemId: item.id,
        periodStart: startDate,
        periodEnd: asOfDate,
        days,
        rate: item.fixedRate,
        rateId: 'FIXED',
        rateSource: item.interestType === InterestTypeCode.CONTRACTUAL 
          ? 'Sözleşme (Akdi Faiz)' 
          : 'Sabit Oran',
        principal: item.amount,
        segmentInterest: this.round(segmentInterest),
        phase: this.determinePhase(startDate, asOfDate, enforcementDate),
      });

      return segments;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DEĞİŞEN ORAN HESAPLAMASI (TCMB Tablosu - Segmentli)
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Get rates for the period
    const rateResult = await this.rateSchedule.getRatesForPeriod(
      item.interestType,
      startDate,
      asOfDate,
      tenantId,
    );

    if (rateResult.rates.length === 0) {
      this.logger.warn(`No rates found for ${item.interestType} from ${startDate} to ${asOfDate}`);
      return segments;
    }

    // Generate timeline with rate change dates
    const timeline = this.generateTimeline(
      startDate,
      asOfDate,
      rateResult.rates,
      enforcementDate,
    );

    this.logger.debug(
      `Calculating segments for ${item.id}: ${startDate} → ${asOfDate}, ` +
      `${rateResult.rates.length} rates, ${timeline.length} timeline points`
    );

    // Calculate each segment
    const currentPrincipal = item.amount;

    for (let i = 0; i < timeline.length - 1; i++) {
      const periodStart = timeline[i];
      const periodEnd = timeline[i + 1];
      
      // Find applicable rate
      const rate = this.findRateForDate(periodStart, rateResult.rates);
      if (!rate) {
        this.logger.warn(`No rate found for date ${periodStart}`);
        continue;
      }

      const days = this.calculateDays(periodStart, periodEnd);
      if (days <= 0) continue;

      const segmentInterest = this.calculateSegmentInterest(
        currentPrincipal,
        rate.annualRate,
        days,
        basis,
      );

      this.logger.debug(
        `Segment ${i + 1}: ${periodStart} → ${periodEnd} | ${days} gün | ` +
        `%${(rate.annualRate * 100).toFixed(2)} | ${this.round(segmentInterest)} TL`
      );

      segments.push({
        principalItemId: item.id,
        periodStart,
        periodEnd,
        days,
        rate: rate.annualRate,
        rateId: rate.id,
        rateSource: `${rate.source} ${rate.sourceReference || ''}`.trim(),
        principal: currentPrincipal,
        segmentInterest: this.round(segmentInterest),
        phase: this.determinePhase(periodStart, periodEnd, enforcementDate),
      });
    }

    return segments;
  }

  /**
   * Determine segment phase based on enforcement date
   */
  private determinePhase(
    periodStart: string,
    periodEnd: string,
    enforcementDate?: string,
  ): 'PRE_ENFORCEMENT' | 'POST_ENFORCEMENT' | undefined {
    if (!enforcementDate) return undefined;
    
    // Segment tamamen takip tarihinden önce
    if (periodEnd <= enforcementDate) {
      return 'PRE_ENFORCEMENT';
    }
    // Segment tamamen takip tarihinden sonra
    if (periodStart >= enforcementDate) {
      return 'POST_ENFORCEMENT';
    }
    // Segment takip tarihini kapsıyor - bu durumda POST olarak işaretle
    // (timeline zaten enforcementDate'te bölünmüş olmalı)
    return 'POST_ENFORCEMENT';
  }

  /**
   * Generate timeline of critical dates based on rate changes
   * 
   * Algoritma:
   * 1. Başlangıç ve bitiş tarihlerini ekle
   * 2. Her oran değişikliği (validFrom) bir segment sınırı oluşturur
   * 3. Takip tarihi (enforcementDate) varsa onu da ekle
   * 4. Tarihleri sırala ve döndür
   */
  private generateTimeline(
    startDate: string,
    endDate: string,
    rates: RateEntry[],
    enforcementDate?: string,
  ): string[] {
    const dates = new Set<string>();
    dates.add(startDate);
    dates.add(endDate);

    // Takip tarihi varsa ve dönem içindeyse ekle (PRE/POST ayrımı için)
    if (enforcementDate && enforcementDate > startDate && enforcementDate < endDate) {
      dates.add(enforcementDate);
    }

    // Her oranın validFrom tarihi bir segment sınırı
    // Örnek: 05.10.2025 başlangıç, 05.01.2026 bitiş
    // Oranlar: 2025-10-18 (%41.75), 2025-11-22 (%40.75), 2025-12-20 (%39.75)
    // Timeline: [2025-10-05, 2025-10-18, 2025-11-22, 2025-12-20, 2026-01-05]
    for (const rate of rates) {
      // Oran başlangıç tarihi dönem içindeyse ekle
      if (rate.validFrom > startDate && rate.validFrom <= endDate) {
        dates.add(rate.validFrom);
      }
    }

    const sortedDates = Array.from(dates).sort();
    
    this.logger.debug(
      `Timeline generated: ${sortedDates.join(' → ')} (${sortedDates.length} points, ${rates.length} rates)` +
      (enforcementDate ? ` [enforcement: ${enforcementDate}]` : '')
    );

    return sortedDates;
  }

  /**
   * Find rate applicable at a specific date
   * Oran, validFrom <= date olan en son oran
   */
  private findRateForDate(date: string, rates: RateEntry[]): RateEntry | null {
    // Tarihe göre sırala (en yeniden en eskiye)
    const sortedRates = [...rates].sort((a, b) => 
      new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime()
    );
    
    // date >= validFrom olan ilk (en yeni) oranı bul
    for (const rate of sortedRates) {
      if (date >= rate.validFrom) {
        return rate;
      }
    }
    
    // Hiç oran bulunamazsa en eski oranı döndür
    return rates.length > 0 ? rates[0] : null;
  }

  /**
   * Calculate interest for a single segment
   * Formula: principal * annual_rate * days / basis
   */
  private calculateSegmentInterest(
    principal: number,
    annualRate: number,
    days: number,
    basis: number,
  ): number {
    return (principal * annualRate * days) / basis;
  }

  /**
   * Calculate days between two dates (start inclusive, end exclusive)
   */
  private calculateDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Generate legal text for the calculation
   */
  private generateLegalText(
    interestType: InterestTypeCode,
    segments: InterestSegment[],
  ): string {
    const typeText = this.getInterestTypeText(interestType);
    const hasMultipleRates = new Set(segments.map((s) => s.rate)).size > 1;

    let text = `${typeText} uyarınca hesaplanan faiz`;

    if (hasMultipleRates) {
      text += ` (dönemsel oran değişiklikleri dikkate alınarak)`;
    }

    // Add rate info
    if (segments.length > 0) {
      const rates = [...new Set(segments.map((s) => `%${(s.rate * 100).toFixed(2)}`))];
      text += `. Uygulanan oranlar: ${rates.join(', ')}`;
    }

    return text;
  }

  /**
   * Get human-readable interest type text
   */
  private getInterestTypeText(interestType: InterestTypeCode): string {
    const texts: Record<InterestTypeCode, string> = {
      [InterestTypeCode.LEGAL_3095]: '3095 sayılı Kanun m.1 (yasal faiz - %9/%24)',
      [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]: '3095 sayılı Kanun m.2/2 (ticari temerrüt faizi - TCMB avans)',
      [InterestTypeCode.COMMERCIAL_FIXED]: '3095 sayılı Kanun m.2/2 (ticari faiz - sabit oran)',
      [InterestTypeCode.TTK_1530]: 'TTK m.1530 (geç ödeme faizi)',
      [InterestTypeCode.CONTRACTUAL]: 'Sözleşmesel faiz (akdi faiz)',
      [InterestTypeCode.MEVDUAT_TL_BANKALARCA]: 'Bankalarca uygulanan mevduat faizi (TL)',
      [InterestTypeCode.MEVDUAT_USD_BANKALARCA]: 'Bankalarca uygulanan mevduat faizi (USD)',
      [InterestTypeCode.MEVDUAT_EUR_BANKALARCA]: 'Bankalarca uygulanan mevduat faizi (EUR)',
      [InterestTypeCode.MEVDUAT_TL_KAMU]: 'Kamu bankalarınca uygulanan mevduat faizi (TL)',
      [InterestTypeCode.MEVDUAT_USD_KAMU]: 'Kamu bankalarınca uygulanan mevduat faizi (USD)',
      [InterestTypeCode.MEVDUAT_EUR_KAMU]: 'Kamu bankalarınca uygulanan mevduat faizi (EUR)',
    };
    return texts[interestType] || interestType;
  }

  /**
   * Map database interest type to engine type
   */
  private mapInterestType(dbType: string | null): InterestTypeCode {
    const mapping: Record<string, InterestTypeCode> = {
      'YASAL': InterestTypeCode.LEGAL_3095,
      'TICARI': InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, // Default: değişen oran
      'TICARI_DEGISEN': InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
      'TICARI_SABIT': InterestTypeCode.COMMERCIAL_FIXED,
      'AVANS': InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
      'TEMERRUT': InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
      'AKDI': InterestTypeCode.CONTRACTUAL,
    };
    return mapping[dbType || ''] || InterestTypeCode.LEGAL_3095;
  }

  /**
   * Round to 2 decimal places
   */
  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
