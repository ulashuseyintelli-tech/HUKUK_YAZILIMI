import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InterestCalculationRequest,
  InterestCalculationResult,
  InterestAuditLog,
  InterestSegment,
  InterestTypeCode,
} from './types';

@Injectable()
export class InterestAuditLogService {
  private readonly logger = new Logger(InterestAuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log a calculation for audit trail
   */
  async logCalculation(
    caseId: string,
    tenantId: string,
    request: InterestCalculationRequest,
    result: InterestCalculationResult,
    userId?: string,
  ): Promise<string> {
    // Extract rate version hashes from segments
    const rateHashes = [...new Set(result.segments.map((s) => s.rateId))];

    const log = await this.prisma.interestCalculationLog.create({
      data: {
        tenantId,
        caseId,
        asOfDate: new Date(result.asOfDate),
        requestJson: request as any,
        resultJson: result as any,
        totalInterest: result.totalInterest,
        totalDue: result.totalDue,
        rateHashes,
        createdBy: userId,
        segments: {
          create: result.segments.map((seg) => ({
            principalItemId: seg.principalItemId,
            periodStart: new Date(seg.periodStart),
            periodEnd: new Date(seg.periodEnd),
            days: seg.days,
            rate: seg.rate,
            rateId: seg.rateId,
            principal: seg.principal,
            segmentInterest: seg.segmentInterest,
          })),
        },
      },
    });

    this.logger.log(`Interest calculation logged: ${log.id} for case ${caseId}`);

    return log.id;
  }

  /**
   * Get a specific calculation log
   */
  async getCalculationLog(
    logId: string,
    tenantId: string,
  ): Promise<InterestAuditLog | null> {
    const log = await this.prisma.interestCalculationLog.findFirst({
      where: { id: logId, tenantId },
      include: { segments: true },
    });

    if (!log) return null;

    return this.mapToAuditLog(log);
  }

  /**
   * Get all calculation logs for a case
   */
  async getLogsForCase(
    caseId: string,
    tenantId: string,
  ): Promise<InterestAuditLog[]> {
    const logs = await this.prisma.interestCalculationLog.findMany({
      where: { caseId, tenantId },
      include: { segments: true },
      orderBy: { calculatedAt: 'desc' },
    });

    return logs.map((log) => this.mapToAuditLog(log));
  }

  /**
   * Find calculations affected by a rate change
   */
  async findAffectedByRateChange(
    interestType: InterestTypeCode,
    rateChangeDate: string,
    tenantId: string,
  ): Promise<{ caseId: string; logId: string }[]> {
    // Find logs that used rates around the change date
    const logs = await this.prisma.interestCalculationLog.findMany({
      where: {
        tenantId,
        asOfDate: { gte: new Date(rateChangeDate) },
        flaggedForReview: false,
      },
      select: { id: true, caseId: true },
    });

    return logs.map((log) => ({
      caseId: log.caseId,
      logId: log.id,
    }));
  }

  /**
   * Flag logs for manual review
   */
  async flagForReview(
    logIds: string[],
    reason: string,
    tenantId: string,
  ): Promise<void> {
    await this.prisma.interestCalculationLog.updateMany({
      where: {
        id: { in: logIds },
        tenantId,
      },
      data: {
        flaggedForReview: true,
        reviewReason: reason,
      },
    });

    this.logger.log(`Flagged ${logIds.length} logs for review: ${reason}`);
  }

  /**
   * Get flagged logs for review
   */
  async getFlaggedLogs(tenantId: string): Promise<InterestAuditLog[]> {
    const logs = await this.prisma.interestCalculationLog.findMany({
      where: { tenantId, flaggedForReview: true },
      include: { segments: true },
      orderBy: { calculatedAt: 'desc' },
    });

    return logs.map((log) => this.mapToAuditLog(log));
  }

  /**
   * Clear review flag
   */
  async clearReviewFlag(logId: string, tenantId: string): Promise<void> {
    await this.prisma.interestCalculationLog.update({
      where: { id: logId },
      data: {
        flaggedForReview: false,
        reviewReason: null,
      },
    });
  }

  /**
   * Map database model to audit log interface
   */
  private mapToAuditLog(log: any): InterestAuditLog {
    return {
      id: log.id,
      caseId: log.caseId,
      tenantId: log.tenantId,
      calculatedAt: log.calculatedAt.toISOString(),
      asOfDate: log.asOfDate.toISOString().split('T')[0],
      request: log.requestJson as InterestCalculationRequest,
      result: log.resultJson as InterestCalculationResult,
      segments: log.segments.map((seg: any) => ({
        principalItemId: seg.principalItemId,
        periodStart: seg.periodStart.toISOString().split('T')[0],
        periodEnd: seg.periodEnd.toISOString().split('T')[0],
        days: seg.days,
        rate: Number(seg.rate),
        rateId: seg.rateId,
        rateSource: '', // Not stored in segment
        principal: Number(seg.principal),
        segmentInterest: Number(seg.segmentInterest),
      })),
      rateVersionHashes: log.rateHashes,
      createdBy: log.createdBy || undefined,
    };
  }
}
