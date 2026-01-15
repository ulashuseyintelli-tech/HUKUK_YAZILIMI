/**
 * Prisma Audit Service
 * 
 * Production-ready audit service using Prisma ORM
 * Uses existing tables: InterestCalculationLog, InterestSegmentLog, RateSchedule
 * 
 * Requirements: 7.1-7.6, 20.1-20.7
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Segment, AllocationStep } from '../types/domain.types';
import { RateEntry } from '../rates/rate-entry.entity';
import { CalculationMode } from '../types/common.types';
import { Decimal } from '@prisma/client/runtime/library';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateRunInput {
  tenantId: string;
  caseId: string;
  mode: CalculationMode;
  inputHash: string;
  request: Record<string, unknown>;
  createdBy?: string;
}

export interface FinalizeRunInput {
  totalInterest: number;
  totalDue: number;
  rateHashes: string[];
  flaggedForReview?: boolean;
  reviewReason?: string;
}

export interface AuditEvent {
  type: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  evidence?: Record<string, unknown>;
}

export interface CalculationRunRecord {
  id: string;
  tenantId: string;
  caseId: string;
  mode: string;
  inputHash: string;
  totalInterest: number | null;
  totalDue: number | null;
  flaggedForReview: boolean;
  reviewReason: string | null;
  calculatedAt: Date;
  createdBy: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRISMA AUDIT SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class PrismaAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new calculation run
   */
  async createRun(input: CreateRunInput): Promise<string> {
    const log = await this.prisma.interestCalculationLog.create({
      data: {
        tenantId: input.tenantId,
        caseId: input.caseId,
        asOfDate: new Date(),
        requestJson: input.request as any,
        resultJson: {} as any,
        totalInterest: new Decimal(0),
        totalDue: new Decimal(0),
        rateHashes: [],
        flaggedForReview: false,
        createdBy: input.createdBy,
      },
    });
    return log.id;
  }

  /**
   * Write segments for a calculation run
   */
  async writeSegments(runId: string, segments: Segment[]): Promise<void> {
    const segmentData = segments.map(s => ({
      calculationLogId: runId,
      principalItemId: s.claimBucketId,
      periodStart: new Date(s.periodStart),
      periodEnd: new Date(s.periodEnd),
      days: s.days,
      rate: new Decimal(s.rate),
      rateId: s.rateId || 'unknown',
      principal: new Decimal(s.principal),
      segmentInterest: new Decimal(s.segmentInterest),
    }));

    await this.prisma.interestSegmentLog.createMany({
      data: segmentData,
    });
  }

  /**
   * Finalize a calculation run with results
   */
  async finalizeRun(runId: string, input: FinalizeRunInput, resultJson: Record<string, unknown>): Promise<void> {
    await this.prisma.interestCalculationLog.update({
      where: { id: runId },
      data: {
        totalInterest: new Decimal(input.totalInterest),
        totalDue: new Decimal(input.totalDue),
        rateHashes: input.rateHashes,
        resultJson: resultJson as any,
        flaggedForReview: input.flaggedForReview ?? false,
        reviewReason: input.reviewReason,
      },
    });
  }

  /**
   * Get a calculation run by ID
   */
  async getRun(runId: string): Promise<CalculationRunRecord | null> {
    const log = await this.prisma.interestCalculationLog.findUnique({
      where: { id: runId },
    });

    if (!log) return null;

    return {
      id: log.id,
      tenantId: log.tenantId,
      caseId: log.caseId,
      mode: 'PRODUCTION', // Mode not stored in current schema
      inputHash: '', // Not stored in current schema
      totalInterest: log.totalInterest?.toNumber() ?? null,
      totalDue: log.totalDue?.toNumber() ?? null,
      flaggedForReview: log.flaggedForReview,
      reviewReason: log.reviewReason,
      calculatedAt: log.calculatedAt,
      createdBy: log.createdBy,
    };
  }

  /**
   * Get segments for a calculation run
   */
  async getSegments(runId: string): Promise<Segment[]> {
    const segments = await this.prisma.interestSegmentLog.findMany({
      where: { calculationLogId: runId },
    });

    return segments.map(s => ({
      claimBucketId: s.principalItemId,
      periodStart: s.periodStart.toISOString().split('T')[0],
      periodEnd: s.periodEnd.toISOString().split('T')[0],
      days: s.days,
      rate: s.rate.toNumber(),
      rateId: s.rateId,
      rateSource: s.rateId,
      principal: s.principal.toNumber(),
      segmentInterest: s.segmentInterest.toNumber(),
    }));
  }

  /**
   * Get all runs for a case
   */
  async getRunsForCase(caseId: string, tenantId: string): Promise<CalculationRunRecord[]> {
    const logs = await this.prisma.interestCalculationLog.findMany({
      where: { caseId, tenantId },
      orderBy: { calculatedAt: 'desc' },
    });

    return logs.map(log => ({
      id: log.id,
      tenantId: log.tenantId,
      caseId: log.caseId,
      mode: 'PRODUCTION',
      inputHash: '',
      totalInterest: log.totalInterest?.toNumber() ?? null,
      totalDue: log.totalDue?.toNumber() ?? null,
      flaggedForReview: log.flaggedForReview,
      reviewReason: log.reviewReason,
      calculatedAt: log.calculatedAt,
      createdBy: log.createdBy,
    }));
  }

  /**
   * Flag a run for review
   */
  async flagForReview(runId: string, reason: string): Promise<void> {
    await this.prisma.interestCalculationLog.update({
      where: { id: runId },
      data: {
        flaggedForReview: true,
        reviewReason: reason,
      },
    });
  }

  /**
   * Get flagged runs for tenant
   */
  async getFlaggedRuns(tenantId: string): Promise<CalculationRunRecord[]> {
    const logs = await this.prisma.interestCalculationLog.findMany({
      where: { tenantId, flaggedForReview: true },
      orderBy: { calculatedAt: 'desc' },
    });

    return logs.map(log => ({
      id: log.id,
      tenantId: log.tenantId,
      caseId: log.caseId,
      mode: 'PRODUCTION',
      inputHash: '',
      totalInterest: log.totalInterest?.toNumber() ?? null,
      totalDue: log.totalDue?.toNumber() ?? null,
      flaggedForReview: log.flaggedForReview,
      reviewReason: log.reviewReason,
      calculatedAt: log.calculatedAt,
      createdBy: log.createdBy,
    }));
  }

  /**
   * Delete old runs (retention policy)
   */
  async deleteOldRuns(tenantId: string, beforeDate: Date): Promise<number> {
    // First delete segments
    await this.prisma.interestSegmentLog.deleteMany({
      where: {
        calculationLog: {
          tenantId,
          calculatedAt: { lt: beforeDate },
        },
      },
    });

    // Then delete logs
    const result = await this.prisma.interestCalculationLog.deleteMany({
      where: {
        tenantId,
        calculatedAt: { lt: beforeDate },
      },
    });

    return result.count;
  }
}
