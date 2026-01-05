/**
 * JOB LEASING SERVICE (v38)
 * 
 * Multi-worker ölçekleme için job leasing.
 * Aynı işi iki worker'ın kapmasını engeller.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface LeasedJob {
  id: string;
  jobId: string;
  recipeId: string;
  caseId: string;
  priority: number;
  leasedUntil: Date;
  leasedBy: string;
}

@Injectable()
export class JobLeasingService {
  private readonly logger = new Logger(JobLeasingService.name);
  
  // Default lease TTL in seconds
  private readonly DEFAULT_LEASE_TTL = 60;

  constructor(private prisma: PrismaService) {}

  /**
   * Acquire a job lease
   * Uses SELECT FOR UPDATE SKIP LOCKED pattern
   */
  async acquireLease(
    tenantId: string,
    workerId: string,
    leaseTtlSeconds = this.DEFAULT_LEASE_TTL,
  ): Promise<LeasedJob | null> {
    const prismaAny = this.prisma as any;
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseTtlSeconds * 1000);

    try {
      // Use raw query for SELECT FOR UPDATE SKIP LOCKED
      // This is PostgreSQL specific
      const result = await this.prisma.$queryRaw<any[]>`
        UPDATE "IcrabotJobRun"
        SET 
          "leasedUntil" = ${leaseUntil},
          "leasedBy" = ${workerId},
          "status" = 'RUNNING',
          "startedAt" = ${now}
        WHERE id = (
          SELECT id FROM "IcrabotJobRun"
          WHERE "tenantId" = ${tenantId}
            AND "status" = 'QUEUED'
            AND ("leasedUntil" IS NULL OR "leasedUntil" < ${now})
          ORDER BY "priority" ASC, "createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, "jobId", "recipeId", "caseId", "priority", "leasedUntil", "leasedBy"
      `;

      if (result && result.length > 0) {
        const job = result[0];
        this.logger.log(`Job ${job.jobId} leased by worker ${workerId}`);
        return {
          id: job.id,
          jobId: job.jobId,
          recipeId: job.recipeId,
          caseId: job.caseId,
          priority: job.priority,
          leasedUntil: job.leasedUntil,
          leasedBy: job.leasedBy,
        };
      }

      return null;
    } catch (e) {
      // Fallback to simple query if raw query fails
      this.logger.warn('Raw query failed, using fallback');
      return this.acquireLeaseFallback(tenantId, workerId, leaseTtlSeconds);
    }
  }

  /**
   * Fallback lease acquisition (not atomic, but works without raw queries)
   */
  private async acquireLeaseFallback(
    tenantId: string,
    workerId: string,
    leaseTtlSeconds: number,
  ): Promise<LeasedJob | null> {
    const prismaAny = this.prisma as any;
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseTtlSeconds * 1000);

    try {
      // Find a queued job with expired or no lease
      const job = await prismaAny.icrabotJobRun?.findFirst({
        where: {
          tenantId,
          status: 'QUEUED',
          OR: [
            { leasedUntil: null },
            { leasedUntil: { lt: now } },
          ],
        },
        orderBy: [
          { priority: 'asc' },
          { createdAt: 'asc' },
        ],
      });

      if (!job) return null;

      // Try to update the job (may fail if another worker got it)
      const updated = await prismaAny.icrabotJobRun?.updateMany({
        where: {
          id: job.id,
          status: 'QUEUED',
          OR: [
            { leasedUntil: null },
            { leasedUntil: { lt: now } },
          ],
        },
        data: {
          leasedUntil: leaseUntil,
          leasedBy: workerId,
          status: 'RUNNING',
          startedAt: now,
        },
      });

      if (updated?.count > 0) {
        this.logger.log(`Job ${job.jobId} leased by worker ${workerId} (fallback)`);
        return {
          id: job.id,
          jobId: job.jobId,
          recipeId: job.recipeId,
          caseId: job.caseId,
          priority: job.priority,
          leasedUntil: leaseUntil,
          leasedBy: workerId,
        };
      }

      return null;
    } catch (e) {
      this.logger.error('Failed to acquire lease', e);
      return null;
    }
  }

  /**
   * Release a job lease (mark as done or failed)
   */
  async releaseLease(
    jobId: string,
    workerId: string,
    status: 'DONE' | 'FAILED',
    errorCode?: string,
    errorMessage?: string,
  ): Promise<boolean> {
    const prismaAny = this.prisma as any;

    try {
      const result = await prismaAny.icrabotJobRun?.updateMany({
        where: {
          jobId,
          leasedBy: workerId,
        },
        data: {
          status,
          leasedUntil: null,
          leasedBy: null,
          finishedAt: new Date(),
          lastErrorCode: status === 'FAILED' ? errorCode : null,
          lastErrorMessage: status === 'FAILED' ? errorMessage : null,
        },
      });

      if (result?.count > 0) {
        this.logger.log(`Job ${jobId} released by worker ${workerId} with status ${status}`);
        return true;
      }

      return false;
    } catch (e) {
      this.logger.error('Failed to release lease', e);
      return false;
    }
  }

  /**
   * Extend a job lease
   */
  async extendLease(
    jobId: string,
    workerId: string,
    extensionSeconds = this.DEFAULT_LEASE_TTL,
  ): Promise<boolean> {
    const prismaAny = this.prisma as any;
    const newLeaseUntil = new Date(Date.now() + extensionSeconds * 1000);

    try {
      const result = await prismaAny.icrabotJobRun?.updateMany({
        where: {
          jobId,
          leasedBy: workerId,
          status: 'RUNNING',
        },
        data: {
          leasedUntil: newLeaseUntil,
        },
      });

      return result?.count > 0;
    } catch (e) {
      return false;
    }
  }

  /**
   * Clean up expired leases (return jobs to QUEUED)
   */
  async cleanupExpiredLeases(tenantId: string): Promise<number> {
    const prismaAny = this.prisma as any;
    const now = new Date();

    try {
      const result = await prismaAny.icrabotJobRun?.updateMany({
        where: {
          tenantId,
          status: 'RUNNING',
          leasedUntil: { lt: now },
        },
        data: {
          status: 'QUEUED',
          leasedUntil: null,
          leasedBy: null,
          startedAt: null,
        },
      });

      const count = result?.count || 0;
      if (count > 0) {
        this.logger.log(`Cleaned up ${count} expired leases`);
      }
      return count;
    } catch (e) {
      return 0;
    }
  }
}
