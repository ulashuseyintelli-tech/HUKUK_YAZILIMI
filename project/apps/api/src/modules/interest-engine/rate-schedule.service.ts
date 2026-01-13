/**
 * @deprecated Use RateProviderService instead.
 * 
 * Bu servis geriye dönük uyumluluk için korunuyor.
 * Yeni kod RateProviderService kullanmalı.
 * 
 * Migration path:
 * - getRatesForPeriod() → RateProviderService.getRatesForPeriod()
 * - getCurrentRate() → RateProviderService.getRateAtDate()
 * - addRate() → RateProviderService.addRateToPrisma()
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createHash } from 'crypto';
import {
  InterestTypeCode,
  RateSourceType,
  RateEntry,
  RateQueryResult,
} from './types';

/**
 * @deprecated Use RateProviderService instead.
 */
@Injectable()
export class RateScheduleService {
  private readonly logger = new Logger(RateScheduleService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.warn(
      'RateScheduleService is deprecated. Use RateProviderService instead.',
    );
  }

  /**
   * Get rates for a specific period
   */
  async getRatesForPeriod(
    interestType: InterestTypeCode,
    startDate: string,
    endDate: string,
    tenantId: string,
  ): Promise<RateQueryResult> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const rates = await this.prisma.rateSchedule.findMany({
      where: {
        tenantId,
        interestType,
        OR: [
          // Rate starts before or during period
          { validFrom: { lte: end } },
        ],
        AND: [
          // Rate ends after start or is still current
          {
            OR: [
              { validTo: null },
              { validTo: { gte: start } },
            ],
          },
        ],
      },
      orderBy: { validFrom: 'asc' },
    });

    const mappedRates: RateEntry[] = rates.map((r) => ({
      id: r.id,
      interestType: r.interestType as InterestTypeCode,
      validFrom: r.validFrom.toISOString().split('T')[0],
      validTo: r.validTo?.toISOString().split('T')[0] || null,
      annualRate: Number(r.annualRate),
      source: r.source as RateSourceType,
      sourceReference: r.sourceRef || undefined,
      versionHash: r.versionHash,
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy || undefined,
    }));

    // Check for gaps
    const coverage = await this.checkRateCoverage(interestType, startDate, endDate, tenantId);

    return {
      rates: mappedRates,
      hasGaps: !coverage.covered,
      gaps: coverage.gaps,
    };
  }

  /**
   * Get current rate for an interest type
   */
  async getCurrentRate(
    interestType: InterestTypeCode,
    tenantId: string,
  ): Promise<RateEntry | null> {
    const now = new Date();

    const rate = await this.prisma.rateSchedule.findFirst({
      where: {
        tenantId,
        interestType,
        validFrom: { lte: now },
        OR: [
          { validTo: null },
          { validTo: { gte: now } },
        ],
      },
      orderBy: { validFrom: 'desc' },
    });

    if (!rate) return null;

    return {
      id: rate.id,
      interestType: rate.interestType as InterestTypeCode,
      validFrom: rate.validFrom.toISOString().split('T')[0],
      validTo: rate.validTo?.toISOString().split('T')[0] || null,
      annualRate: Number(rate.annualRate),
      source: rate.source as RateSourceType,
      sourceReference: rate.sourceRef || undefined,
      versionHash: rate.versionHash,
      createdAt: rate.createdAt.toISOString(),
      createdBy: rate.createdBy || undefined,
    };
  }

  /**
   * Add a new rate entry
   */
  async addRate(
    entry: {
      interestType: InterestTypeCode;
      validFrom: string;
      validTo?: string;
      annualRate: number;
      source: RateSourceType;
      sourceRef?: string;
    },
    tenantId: string,
    userId?: string,
  ): Promise<RateEntry> {
    const versionHash = this.generateVersionHash(entry);

    // Close previous rate if exists
    const previousRate = await this.prisma.rateSchedule.findFirst({
      where: {
        tenantId,
        interestType: entry.interestType,
        validTo: null,
        validFrom: { lt: new Date(entry.validFrom) },
      },
      orderBy: { validFrom: 'desc' },
    });

    if (previousRate) {
      // Set validTo to day before new rate starts
      const dayBefore = new Date(entry.validFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);

      await this.prisma.rateSchedule.update({
        where: { id: previousRate.id },
        data: { validTo: dayBefore },
      });
    }

    const created = await this.prisma.rateSchedule.create({
      data: {
        tenantId,
        interestType: entry.interestType,
        validFrom: new Date(entry.validFrom),
        validTo: entry.validTo ? new Date(entry.validTo) : null,
        annualRate: entry.annualRate,
        source: entry.source,
        sourceRef: entry.sourceRef,
        versionHash,
        createdBy: userId,
      },
    });

    this.logger.log(
      `Rate added: ${entry.interestType} ${entry.annualRate * 100}% from ${entry.validFrom}`,
    );

    return {
      id: created.id,
      interestType: created.interestType as InterestTypeCode,
      validFrom: created.validFrom.toISOString().split('T')[0],
      validTo: created.validTo?.toISOString().split('T')[0] || null,
      annualRate: Number(created.annualRate),
      source: created.source as RateSourceType,
      sourceReference: created.sourceRef || undefined,
      versionHash: created.versionHash,
      createdAt: created.createdAt.toISOString(),
      createdBy: created.createdBy || undefined,
    };
  }

  /**
   * Add rate only if it doesn't exist (idempotent)
   */
  async addRateIfNew(
    entry: {
      interestType: InterestTypeCode | string;
      validFrom: string;
      annualRate: number;
      source: RateSourceType;
      sourceRef?: string;
    },
    tenantId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.rateSchedule.findFirst({
      where: {
        tenantId,
        interestType: entry.interestType,
        validFrom: new Date(entry.validFrom),
      },
    });

    if (existing) {
      return false; // Already exists
    }

    await this.addRate(
      {
        interestType: entry.interestType as InterestTypeCode,
        validFrom: entry.validFrom,
        annualRate: entry.annualRate,
        source: entry.source,
        sourceRef: entry.sourceRef,
      },
      tenantId,
    );

    return true;
  }

  /**
   * Check if rates cover the entire period
   */
  async checkRateCoverage(
    interestType: InterestTypeCode,
    startDate: string,
    endDate: string,
    tenantId: string,
  ): Promise<{ covered: boolean; gaps: { from: string; to: string }[]; rateCount: number }> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const rates = await this.prisma.rateSchedule.findMany({
      where: {
        tenantId,
        interestType,
        validFrom: { lte: end },
        OR: [
          { validTo: null },
          { validTo: { gte: start } },
        ],
      },
      orderBy: { validFrom: 'asc' },
    });

    if (rates.length === 0) {
      return {
        covered: false,
        gaps: [{ from: startDate, to: endDate }],
        rateCount: 0,
      };
    }

    const gaps: { from: string; to: string }[] = [];
    let currentDate = start;

    for (const rate of rates) {
      const rateStart = rate.validFrom;
      const rateEnd = rate.validTo || end;

      // Check for gap before this rate
      if (rateStart > currentDate) {
        gaps.push({
          from: currentDate.toISOString().split('T')[0],
          to: new Date(rateStart.getTime() - 86400000).toISOString().split('T')[0],
        });
      }

      // Move current date to end of this rate
      if (rateEnd > currentDate) {
        currentDate = new Date(rateEnd.getTime() + 86400000);
      }
    }

    // Check for gap after last rate
    if (currentDate <= end) {
      gaps.push({
        from: currentDate.toISOString().split('T')[0],
        to: endDate,
      });
    }

    return {
      covered: gaps.length === 0,
      gaps,
      rateCount: rates.length,
    };
  }

  /**
   * Get default interest type based on case characteristics
   */
  getDefaultInterestType(
    caseType: string,
    isCommercial: boolean,
    instrumentType?: string,
  ): InterestTypeCode {
    // Çek/Senet → Ticari avans faizi
    if (instrumentType === 'CEK' || instrumentType === 'SENET') {
      return InterestTypeCode.COMMERCIAL_AVANS_3095_2_2;
    }

    // Kambiyo takipleri → Ticari avans faizi
    if (caseType === 'KAMBIYO_SENEDI' || caseType === 'KAMBIYO') {
      return InterestTypeCode.COMMERCIAL_AVANS_3095_2_2;
    }

    // Ticari alacak → TTK 1530 veya avans
    if (isCommercial) {
      return InterestTypeCode.TTK_1530;
    }

    // Default: Yasal faiz
    return InterestTypeCode.LEGAL_3095;
  }

  /**
   * Get rate applicable at a specific date
   */
  async getRateAtDate(
    interestType: InterestTypeCode,
    date: string,
    tenantId: string,
  ): Promise<RateEntry | null> {
    const targetDate = new Date(date);

    const rate = await this.prisma.rateSchedule.findFirst({
      where: {
        tenantId,
        interestType,
        validFrom: { lte: targetDate },
        OR: [
          { validTo: null },
          { validTo: { gte: targetDate } },
        ],
      },
      orderBy: { validFrom: 'desc' },
    });

    if (!rate) return null;

    return {
      id: rate.id,
      interestType: rate.interestType as InterestTypeCode,
      validFrom: rate.validFrom.toISOString().split('T')[0],
      validTo: rate.validTo?.toISOString().split('T')[0] || null,
      annualRate: Number(rate.annualRate),
      source: rate.source as RateSourceType,
      sourceReference: rate.sourceRef || undefined,
      versionHash: rate.versionHash,
      createdAt: rate.createdAt.toISOString(),
      createdBy: rate.createdBy || undefined,
    };
  }

  /**
   * Generate version hash for change detection
   */
  private generateVersionHash(entry: {
    interestType: InterestTypeCode | string;
    validFrom: string;
    annualRate: number;
    source: RateSourceType;
  }): string {
    const data = `${entry.interestType}|${entry.validFrom}|${entry.annualRate}|${entry.source}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }
}
