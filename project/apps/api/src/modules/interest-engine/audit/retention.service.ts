/**
 * Task 11.5 - Retention Policy Service
 * 
 * Record: 90 gün aktif, 10 yıl arşiv
 * Trace: 30 gün aktif, 2 yıl arşiv
 * Preview: 30 gün, sonra silme
 */

import { Injectable } from '@nestjs/common';

// ═══════════════════════════════════════════════════════════════════════════
// RETENTION POLICY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface RetentionPolicy {
  activeDays: number;
  archiveDays: number;
  deleteAfterArchive: boolean;
}

export const RETENTION_POLICIES: Record<string, RetentionPolicy> = {
  CALCULATION_RECORD: {
    activeDays: 90,
    archiveDays: 3650, // 10 years
    deleteAfterArchive: false,
  },
  CALCULATION_TRACE: {
    activeDays: 30,
    archiveDays: 730, // 2 years
    deleteAfterArchive: true,
  },
  PREVIEW_RECORD: {
    activeDays: 30,
    archiveDays: 0,
    deleteAfterArchive: true,
  },
  ACCESS_LOG: {
    activeDays: 1825, // 5 years
    archiveDays: 0,
    deleteAfterArchive: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// RETENTION STATUS
// ═══════════════════════════════════════════════════════════════════════════

export type RetentionStatus = 'ACTIVE' | 'ARCHIVED' | 'PENDING_DELETE' | 'DELETED';

export interface RetentionInfo {
  status: RetentionStatus;
  createdAt: string;
  archivedAt?: string;
  deleteAt?: string;
  daysUntilArchive?: number;
  daysUntilDelete?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// RETENTION SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class RetentionService {
  /**
   * Get retention status for a record
   */
  getRetentionStatus(
    recordType: keyof typeof RETENTION_POLICIES,
    createdAt: string,
    now: Date = new Date(),
  ): RetentionInfo {
    const policy = RETENTION_POLICIES[recordType];
    const created = new Date(createdAt);
    const daysSinceCreation = this.daysBetween(created, now);

    // Check if should be deleted
    if (policy.deleteAfterArchive && daysSinceCreation > policy.activeDays + policy.archiveDays) {
      return {
        status: 'PENDING_DELETE',
        createdAt,
        deleteAt: this.addDays(created, policy.activeDays + policy.archiveDays).toISOString(),
      };
    }

    // Check if should be archived
    if (daysSinceCreation > policy.activeDays) {
      const archivedAt = this.addDays(created, policy.activeDays);
      const deleteAt = policy.deleteAfterArchive
        ? this.addDays(created, policy.activeDays + policy.archiveDays)
        : undefined;

      return {
        status: 'ARCHIVED',
        createdAt,
        archivedAt: archivedAt.toISOString(),
        deleteAt: deleteAt?.toISOString(),
        daysUntilDelete: deleteAt ? this.daysBetween(now, deleteAt) : undefined,
      };
    }

    // Still active
    const archiveAt = this.addDays(created, policy.activeDays);
    return {
      status: 'ACTIVE',
      createdAt,
      daysUntilArchive: this.daysBetween(now, archiveAt),
    };
  }

  /**
   * Get records that should be archived
   */
  getRecordsToArchive(
    recordType: keyof typeof RETENTION_POLICIES,
    records: Array<{ id: string; createdAt: string }>,
    now: Date = new Date(),
  ): string[] {
    const policy = RETENTION_POLICIES[recordType];
    const cutoffDate = this.addDays(now, -policy.activeDays);

    return records
      .filter(r => new Date(r.createdAt) < cutoffDate)
      .map(r => r.id);
  }

  /**
   * Get records that should be deleted
   */
  getRecordsToDelete(
    recordType: keyof typeof RETENTION_POLICIES,
    records: Array<{ id: string; createdAt: string }>,
    now: Date = new Date(),
  ): string[] {
    const policy = RETENTION_POLICIES[recordType];
    
    if (!policy.deleteAfterArchive) {
      return [];
    }

    const cutoffDate = this.addDays(now, -(policy.activeDays + policy.archiveDays));

    return records
      .filter(r => new Date(r.createdAt) < cutoffDate)
      .map(r => r.id);
  }

  /**
   * Check if record can be accessed (not deleted)
   */
  canAccess(
    recordType: keyof typeof RETENTION_POLICIES,
    createdAt: string,
    now: Date = new Date(),
  ): boolean {
    const status = this.getRetentionStatus(recordType, createdAt, now);
    return status.status !== 'DELETED' && status.status !== 'PENDING_DELETE';
  }

  /**
   * Get retention policy for a record type
   */
  getPolicy(recordType: keyof typeof RETENTION_POLICIES): RetentionPolicy {
    return RETENTION_POLICIES[recordType];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private daysBetween(start: Date, end: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.floor((end.getTime() - start.getTime()) / msPerDay);
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
