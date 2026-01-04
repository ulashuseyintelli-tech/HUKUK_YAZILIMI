/**
 * CASE LOCK SERVICE (v22)
 * 
 * Case-level concurrency guard.
 * Write job'lar aynı case üzerinde aynı anda çalışmaz.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CaseLockResult {
  acquired: boolean;
  lockId?: string;
  reason?: string;
  heldBy?: string;
}

@Injectable()
export class CaseLockService {
  private readonly logger = new Logger(CaseLockService.name);
  private readonly LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private prisma: PrismaService) {}

  /**
   * Try to acquire a lock for a case
   */
  async acquireLock(
    caseId: string,
    tenantId: string,
    jobId: string,
    lockType: string = 'WRITE',
  ): Promise<CaseLockResult> {
    // Check for existing active lock
    const existingLock = await this.prisma.caseRunLock.findFirst({
      where: {
        caseId,
        tenantId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingLock) {
      return {
        acquired: false,
        reason: `Case is locked by job ${existingLock.jobId}`,
        heldBy: existingLock.jobId,
      };
    }

    // Create new lock
    const expiresAt = new Date(Date.now() + this.LOCK_TIMEOUT_MS);
    const lock = await this.prisma.caseRunLock.create({
      data: {
        caseId,
        tenantId,
        jobId,
        lockType,
        isActive: true,
        expiresAt,
      },
    });

    this.logger.debug(`Lock acquired for case ${caseId} by job ${jobId}`);

    return {
      acquired: true,
      lockId: lock.id,
    };
  }

  /**
   * Release a lock
   */
  async releaseLock(lockId: string): Promise<void> {
    await this.prisma.caseRunLock.update({
      where: { id: lockId },
      data: {
        isActive: false,
        releasedAt: new Date(),
      },
    });

    this.logger.debug(`Lock ${lockId} released`);
  }

  /**
   * Release lock by job ID
   */
  async releaseLockByJob(jobId: string, tenantId: string): Promise<void> {
    await this.prisma.caseRunLock.updateMany({
      where: {
        jobId,
        tenantId,
        isActive: true,
      },
      data: {
        isActive: false,
        releasedAt: new Date(),
      },
    });
  }

  /**
   * Check if a case is locked
   */
  async isLocked(caseId: string, tenantId: string): Promise<{ locked: boolean; heldBy?: string }> {
    const lock = await this.prisma.caseRunLock.findFirst({
      where: {
        caseId,
        tenantId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
    });

    return {
      locked: !!lock,
      heldBy: lock?.jobId,
    };
  }

  /**
   * Clean up expired locks
   */
  async cleanupExpiredLocks(tenantId: string): Promise<number> {
    const result = await this.prisma.caseRunLock.updateMany({
      where: {
        tenantId,
        isActive: true,
        expiresAt: { lt: new Date() },
      },
      data: {
        isActive: false,
        releasedAt: new Date(),
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired locks for tenant ${tenantId}`);
    }

    return result.count;
  }

  /**
   * Extend lock timeout
   */
  async extendLock(lockId: string, additionalMs?: number): Promise<void> {
    const extension = additionalMs || this.LOCK_TIMEOUT_MS;
    const newExpiry = new Date(Date.now() + extension);

    await this.prisma.caseRunLock.update({
      where: { id: lockId },
      data: { expiresAt: newExpiry },
    });
  }
}
