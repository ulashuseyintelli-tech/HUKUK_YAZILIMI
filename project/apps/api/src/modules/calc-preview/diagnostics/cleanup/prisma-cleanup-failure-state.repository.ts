/**
 * Prisma Cleanup Failure State Repository
 * 
 * Phase 11 - Task 6: Failure Policy
 * 
 * Implements atomic consecutive failure tracking using Prisma UPSERT.
 * 
 * Key Design:
 * - UPSERT for atomic increment (no race conditions)
 * - Single record per tenant (unique constraint)
 * - Reset on success (counter = 0)
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  ICleanupFailureStateRepository,
  TenantFailureState,
} from './cleanup.types';

@Injectable()
export class PrismaCleanupFailureStateRepository
  implements ICleanupFailureStateRepository
{
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Increment failure counter atomically (UPSERT)
   * 
   * Uses Prisma upsert to handle both insert and update atomically.
   * 
   * @param tenantId Tenant ID
   * @param errorCode Error code from failure
   * @returns Updated failure count
   */
  async incrementFailure(tenantId: string, errorCode: string): Promise<number> {
    const result = await this.prisma.cleanupFailureState.upsert({
      where: { tenantId },
      create: {
        tenantId,
        consecutiveFailures: 1,
        lastFailedAt: new Date(),
        lastErrorCode: errorCode,
      },
      update: {
        consecutiveFailures: { increment: 1 },
        lastFailedAt: new Date(),
        lastErrorCode: errorCode,
      },
    });

    return result.consecutiveFailures;
  }

  /**
   * Reset failure counter to 0
   * 
   * Uses upsert to handle case where no record exists yet.
   * 
   * @param tenantId Tenant ID
   */
  async resetFailure(tenantId: string): Promise<void> {
    await this.prisma.cleanupFailureState.upsert({
      where: { tenantId },
      create: {
        tenantId,
        consecutiveFailures: 0,
        lastFailedAt: null,
        lastErrorCode: null,
      },
      update: {
        consecutiveFailures: 0,
        lastFailedAt: null,
        lastErrorCode: null,
      },
    });
  }

  /**
   * Get failure state for a tenant
   * 
   * @param tenantId Tenant ID
   * @returns Failure state or null if no record exists
   */
  async getFailureState(tenantId: string): Promise<TenantFailureState | null> {
    const record = await this.prisma.cleanupFailureState.findUnique({
      where: { tenantId },
    });

    if (!record) {
      return null;
    }

    return {
      tenantId: record.tenantId,
      consecutiveFailures: record.consecutiveFailures,
      lastFailedAt: record.lastFailedAt,
      lastErrorCode: record.lastErrorCode,
    };
  }
}
