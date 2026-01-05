/**
 * SELECTOR HEALTH SERVICE (v33-v34)
 * 
 * Selector sağlık istatistikleri.
 * En çok başarısız olan selector'ları takip eder.
 * 
 * v34 Yenilikleri:
 * - Click test API (selector tıklanabilir mi test et)
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface SelectorHealthStats {
  selectorKey: string;
  count: number;
}

export interface SelectorHealthReport {
  topFail: SelectorHealthStats[];
  topOk: SelectorHealthStats[];
  failRate: number;
  totalLogs: number;
}

export interface ClickTestResult {
  ok: boolean;
  error: string | null;
  screenshotPath: string | null;
}

@Injectable()
export class SelectorHealthService {
  private readonly logger = new Logger(SelectorHealthService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get selector health report
   */
  async getHealthReport(tenantId: string, limit: number = 50): Promise<SelectorHealthReport> {
    // Top failing selectors
    const failGroups = await this.prisma.selectorHealthLog.groupBy({
      by: ['selectorKey'],
      where: { tenantId, success: false },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    // Top successful selectors
    const okGroups = await this.prisma.selectorHealthLog.groupBy({
      by: ['selectorKey'],
      where: { tenantId, success: true },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    // Total counts
    const [totalFail, totalOk] = await Promise.all([
      this.prisma.selectorHealthLog.count({ where: { tenantId, success: false } }),
      this.prisma.selectorHealthLog.count({ where: { tenantId, success: true } }),
    ]);

    const totalLogs = totalFail + totalOk;
    const failRate = totalLogs > 0 ? totalFail / totalLogs : 0;

    return {
      topFail: failGroups.map((g) => ({
        selectorKey: g.selectorKey,
        count: g._count.id,
      })),
      topOk: okGroups.map((g) => ({
        selectorKey: g.selectorKey,
        count: g._count.id,
      })),
      failRate,
      totalLogs,
    };
  }

  /**
   * Get health stats for a specific selector
   */
  async getSelectorStats(
    tenantId: string,
    selectorKey: string,
  ): Promise<{ ok: number; fail: number; failRate: number; recentErrors: string[] }> {
    const [ok, fail] = await Promise.all([
      this.prisma.selectorHealthLog.count({
        where: { tenantId, selectorKey, success: true },
      }),
      this.prisma.selectorHealthLog.count({
        where: { tenantId, selectorKey, success: false },
      }),
    ]);

    const total = ok + fail;
    const failRate = total > 0 ? fail / total : 0;

    // Get recent errors
    const recentLogs = await this.prisma.selectorHealthLog.findMany({
      where: { tenantId, selectorKey, success: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { errorMessage: true },
    });

    return {
      ok,
      fail,
      failRate,
      recentErrors: recentLogs
        .map((l) => l.errorMessage)
        .filter((e): e is string => e !== null),
    };
  }

  /**
   * Log selector health
   */
  async logHealth(
    tenantId: string,
    selectorKey: string,
    success: boolean,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.selectorHealthLog.create({
      data: {
        tenantId,
        selectorKey,
        success,
        errorMessage: errorMessage || null,
      },
    });
  }

  /**
   * Get selectors with high fail rate (for auto degraded mode)
   */
  async getHighFailRateSelectors(
    tenantId: string,
    threshold: number = 0.3,
    minSamples: number = 10,
  ): Promise<string[]> {
    // Get all selectors with their stats
    const allSelectors = await this.prisma.selectorHealthLog.groupBy({
      by: ['selectorKey'],
      where: { tenantId },
      _count: { id: true },
    });

    const highFailSelectors: string[] = [];

    for (const selector of allSelectors) {
      if (selector._count.id < minSamples) continue;

      const stats = await this.getSelectorStats(tenantId, selector.selectorKey);
      if (stats.failRate >= threshold) {
        highFailSelectors.push(selector.selectorKey);
      }
    }

    return highFailSelectors;
  }

  /**
   * Clear old logs (retention policy)
   */
  async clearOldLogs(tenantId: string, daysToKeep: number = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    const result = await this.prisma.selectorHealthLog.deleteMany({
      where: {
        tenantId,
        createdAt: { lt: cutoff },
      },
    });

    this.logger.log(`Cleared ${result.count} old selector health logs`);
    return result.count;
  }

  /**
   * Click test - Test if selector is clickable (v34)
   * 
   * MVP: Sadece log kaydı oluşturur.
   * Production'da Playwright ile gerçek click testi yapılır.
   */
  async clickTest(
    tenantId: string,
    selector: string,
    _baseUrl?: string,
  ): Promise<ClickTestResult> {
    // MVP: Simulate click test without Playwright
    // Production'da Playwright ile gerçek click testi yapılır
    const ok = true; // MVP always succeeds
    const error = null;
    const screenshotPath = null;

    // Log the test result
    await this.prisma.selectorHealthLog.create({
      data: {
        tenantId,
        selectorKey: selector,
        success: ok,
        errorMessage: error,
      },
    });

    this.logger.log(`Click test for selector: ${selector}, result: ${ok ? 'OK' : 'FAIL'}`);

    return {
      ok,
      error,
      screenshotPath,
    };
  }
}
