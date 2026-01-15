/**
 * Task 4.2 - Rate Provider Service
 *
 * Faiz oranı sağlayıcı servisi
 * Cache + TTL + Version tracking + Prisma support
 * Requirements: 1.1-1.4, 10.2, 10.3
 */

import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { InterestTypeCode } from '../types/domain.types';
import { generateRateEntryHash, generateRateTableVersion } from './rate-version-hash';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface RateEntry {
  id: string;
  interestType: InterestTypeCode;
  annualRate: number;
  validFrom: string; // ISO date
  validTo: string | null; // ISO date or null for open-ended
  sourceId: string;
  sourceName: string;
  publishedAt: string;
  currency: string;
}

export interface RateQueryOptions {
  interestType: InterestTypeCode;
  startDate: string;
  endDate: string;
  currency?: string;
  tenantId?: string;
}

export interface RateAtDateResult {
  rate: RateEntry | null;
  isInferred: boolean;
  inferredFrom?: string;
}

export interface RateTableVersion {
  hash: string;
  generatedAt: string;
  rateCount: number;
  latestPublishedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ═══════════════════════════════════════════════════════════════════════════
// RATE PROVIDER SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class RateProviderService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private cacheTTL: number = DEFAULT_CACHE_TTL_MS;

  // In-memory rate store (fallback when Prisma not available)
  private rates: RateEntry[] = [];
  
  // Use Prisma when available
  private usePrisma: boolean = false;

  constructor(@Optional() private readonly prisma?: PrismaService) {
    this.usePrisma = !!prisma;
  }

  /**
   * Enable/disable Prisma mode
   */
  setPrismaMode(enabled: boolean): void {
    this.usePrisma = enabled && !!this.prisma;
  }

  /**
   * Set cache TTL
   */
  setCacheTTL(ttlMs: number): void {
    this.cacheTTL = ttlMs;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Load rates (for testing or initialization)
   */
  loadRates(rates: RateEntry[]): void {
    this.rates = [...rates];
    this.clearCache();
  }

  /**
   * Get rates for a period
   */
  async getRatesForPeriod(options: RateQueryOptions): Promise<RateEntry[]> {
    const cacheKey = `rates:${options.interestType}:${options.startDate}:${options.endDate}:${options.currency || 'TRY'}:${options.tenantId || 'default'}`;

    // Check cache
    const cached = this.getFromCache<RateEntry[]>(cacheKey);
    if (cached) {
      return cached;
    }

    let result: RateEntry[];

    if (this.usePrisma && this.prisma && options.tenantId) {
      // Fetch from Prisma
      result = await this.fetchRatesFromPrisma(options);
    } else {
      // Use in-memory store
      result = this.filterInMemoryRates(options);
    }

    // Cache result
    this.setCache(cacheKey, result);

    return result;
  }

  /**
   * Fetch rates from Prisma database
   */
  private async fetchRatesFromPrisma(options: RateQueryOptions): Promise<RateEntry[]> {
    if (!this.prisma || !options.tenantId) {
      return [];
    }

    const rates = await this.prisma.rateSchedule.findMany({
      where: {
        tenantId: options.tenantId,
        interestType: options.interestType,
        validFrom: { lte: new Date(options.endDate) },
        OR: [
          { validTo: null },
          { validTo: { gt: new Date(options.startDate) } },
        ],
      },
      orderBy: { validFrom: 'asc' },
    });

    return rates.map(r => ({
      id: r.id,
      interestType: r.interestType as InterestTypeCode,
      annualRate: r.annualRate.toNumber(),
      validFrom: r.validFrom.toISOString().split('T')[0],
      validTo: r.validTo?.toISOString().split('T')[0] ?? null,
      sourceId: r.versionHash,
      sourceName: r.source,
      publishedAt: r.createdAt.toISOString(),
      currency: 'TRY', // Default, could be extended
    }));
  }

  /**
   * Filter in-memory rates
   */
  private filterInMemoryRates(options: RateQueryOptions): RateEntry[] {
    const result = this.rates.filter((rate) => {
      // Match interest type
      if (rate.interestType !== options.interestType) return false;

      // Match currency
      if (options.currency && rate.currency !== options.currency) return false;

      // Check date overlap
      const rateStart = rate.validFrom;
      const rateEnd = rate.validTo || '9999-12-31';

      // Rate period must overlap with query period
      return rateStart < options.endDate && rateEnd > options.startDate;
    });

    // Sort by validFrom
    result.sort((a, b) => a.validFrom.localeCompare(b.validFrom));

    return result;
  }

  /**
   * Get rate at a specific date (sync version for backward compatibility)
   */
  getRateAtDate(
    interestType: InterestTypeCode,
    date: string,
    currency: string = 'TRY',
  ): RateAtDateResult {
    const cacheKey = `rate:${interestType}:${date}:${currency}`;

    // Check cache
    const cached = this.getFromCache<RateAtDateResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // Find exact match (in-memory only for sync)
    const exactMatch = this.rates.find((rate) => {
      if (rate.interestType !== interestType) return false;
      if (rate.currency !== currency) return false;

      const rateEnd = rate.validTo || '9999-12-31';
      return rate.validFrom <= date && rateEnd > date;
    });

    if (exactMatch) {
      const result: RateAtDateResult = { rate: exactMatch, isInferred: false };
      this.setCache(cacheKey, result);
      return result;
    }

    // Try to infer from nearest rate
    const nearestBefore = this.rates
      .filter(
        (r) =>
          r.interestType === interestType &&
          r.currency === currency &&
          r.validFrom <= date,
      )
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];

    if (nearestBefore) {
      const result: RateAtDateResult = {
        rate: { ...nearestBefore, validTo: null },
        isInferred: true,
        inferredFrom: nearestBefore.validFrom,
      };
      this.setCache(cacheKey, result);
      return result;
    }

    const result: RateAtDateResult = { rate: null, isInferred: false };
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get rate table version hash
   */
  getRateTableVersion(interestType?: InterestTypeCode): RateTableVersion {
    const relevantRates = interestType
      ? this.rates.filter((r) => r.interestType === interestType)
      : this.rates;

    if (relevantRates.length === 0) {
      return {
        hash: 'EMPTY',
        generatedAt: new Date().toISOString(),
        rateCount: 0,
        latestPublishedAt: '',
      };
    }

    const hash = generateRateTableVersion(relevantRates as any);
    const latestPublishedAt = relevantRates
      .map((r) => r.publishedAt)
      .sort()
      .reverse()[0];

    return {
      hash,
      generatedAt: new Date().toISOString(),
      rateCount: relevantRates.length,
      latestPublishedAt,
    };
  }

  /**
   * Get all rates (for debugging)
   */
  getAllRates(): RateEntry[] {
    return [...this.rates];
  }

  /**
   * Add a rate entry
   */
  addRate(rate: RateEntry): void {
    this.rates.push(rate);
    this.clearCache();
  }

  /**
   * Add rate to Prisma database
   */
  async addRateToPrisma(
    tenantId: string,
    rate: Omit<RateEntry, 'id' | 'sourceId' | 'publishedAt'>,
    sourceRef?: string,
  ): Promise<string> {
    if (!this.prisma) {
      throw new Error('Prisma not available');
    }

    const versionHash = generateRateEntryHash({ 
      interestType: rate.interestType, 
      validFrom: rate.validFrom, 
      annualRate: rate.annualRate, 
      source: rate.sourceName 
    });

    const created = await this.prisma.rateSchedule.create({
      data: {
        tenantId,
        interestType: rate.interestType,
        validFrom: new Date(rate.validFrom),
        validTo: rate.validTo ? new Date(rate.validTo) : null,
        annualRate: rate.annualRate,
        source: rate.sourceName,
        sourceRef,
        versionHash,
      },
    });

    this.clearCache();
    return created.id;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; ttlMs: number; usePrisma: boolean } {
    return {
      size: this.cache.size,
      ttlMs: this.cacheTTL,
      usePrisma: this.usePrisma,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE CACHE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.cacheTTL,
    });
  }
}
