/**
 * WEEKLY EXPORT SERVICE (v37)
 * 
 * Haftalık özet raporu oluşturma.
 * MVP: Stub implementasyon, sonraki adım PDF + mail.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface WeeklySummaryResponse {
  generatedAt: Date;
  tenantId: string;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalCases: number;
    activeCases: number;
    newCases: number;
    closedCases: number;
    totalJobs: number;
    successfulJobs: number;
    failedJobs: number;
  };
  highlights: string[];
  nextSteps: string[];
}

@Injectable()
export class WeeklyExportService {
  private readonly logger = new Logger(WeeklyExportService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Build weekly summary
   */
  async buildWeeklySummary(tenantId: string): Promise<WeeklySummaryResponse> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const prismaAny = this.prisma as any;

    // Get case counts
    const totalCases = await this.prisma.case.count({
      where: { tenantId },
    });

    const activeCases = await this.prisma.case.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    const newCases = await this.prisma.case.count({
      where: {
        tenantId,
        createdAt: { gte: weekAgo },
      },
    });

    const closedCases = await this.prisma.case.count({
      where: {
        tenantId,
        status: 'CLOSED',
        updatedAt: { gte: weekAgo },
      },
    });

    // Get job counts (if model exists)
    let totalJobs = 0;
    let successfulJobs = 0;
    let failedJobs = 0;

    try {
      totalJobs = await prismaAny.icrabotJobRun.count({
        where: {
          tenantId,
          createdAt: { gte: weekAgo },
        },
      });

      successfulJobs = await prismaAny.icrabotJobRun.count({
        where: {
          tenantId,
          status: 'DONE',
          createdAt: { gte: weekAgo },
        },
      });

      failedJobs = await prismaAny.icrabotJobRun.count({
        where: {
          tenantId,
          status: 'FAILED',
          createdAt: { gte: weekAgo },
        },
      });
    } catch (e) {
      this.logger.warn('Could not fetch job counts');
    }

    // Build highlights
    const highlights: string[] = [];
    if (newCases > 0) {
      highlights.push(`${newCases} yeni dosya açıldı`);
    }
    if (closedCases > 0) {
      highlights.push(`${closedCases} dosya kapatıldı`);
    }
    if (successfulJobs > 0) {
      highlights.push(`${successfulJobs} otomasyon işi başarıyla tamamlandı`);
    }
    if (failedJobs > 0) {
      highlights.push(`${failedJobs} otomasyon işi başarısız oldu`);
    }

    this.logger.log(`Weekly summary generated for tenant ${tenantId}`);

    return {
      generatedAt: now,
      tenantId,
      period: {
        start: weekAgo,
        end: now,
      },
      summary: {
        totalCases,
        activeCases,
        newCases,
        closedCases,
        totalJobs,
        successfulJobs,
        failedJobs,
      },
      highlights,
      nextSteps: [
        'PDF generation',
        'Mail dispatch',
        'Detailed analytics',
      ],
    };
  }
}
