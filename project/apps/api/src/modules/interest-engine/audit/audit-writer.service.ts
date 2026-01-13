/**
 * Task 11.4 - Audit Writer Service
 * 
 * writeRecord(), writeTrace(), getRecord(), getRecordsForCase()
 * Central audit trail management
 */

import { Injectable } from '@nestjs/common';
import { 
  CalculationRecord, 
  CalculationRecordCreate,
  calculateRecordRetentionExpiry,
} from './calculation-record.entity';
import { 
  CalculationTrace, 
  CalculationTraceCreate,
  calculateTraceRetentionExpiry,
  RateEntrySnapshot,
} from './calculation-trace.entity';
import { 
  PreviewRecord, 
  PreviewRecordCreate,
  createPreviewRecord,
} from './preview-record.entity';
import { Segment, AllocationStep } from '../types/domain.types';
import { RateEntry } from '../rates/rate-entry.entity';
import { CalculationMode } from '../types/common.types';
import { generateId } from '../types/common.types';

// ═══════════════════════════════════════════════════════════════════════════
// IN-MEMORY STORAGE (Replace with Prisma in production)
// ═══════════════════════════════════════════════════════════════════════════

// Note: This is a simplified in-memory implementation for testing.
// In production, replace with Prisma database operations.

const recordStore = new Map<string, CalculationRecord>();
const traceStore = new Map<string, CalculationTrace>();
const previewStore = new Map<string, PreviewRecord>();

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT WRITER SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class AuditWriterService {
  /**
   * Write a calculation record
   */
  async writeRecord(
    input: CalculationRecordCreate,
    tenantId: string,
    userId?: string,
  ): Promise<string> {
    const now = new Date();
    const id = generateId();
    
    const record: CalculationRecord = {
      id,
      ...input,
      tenantId,
      calculatedBy: userId,
      calculatedAt: now.toISOString(),
      retentionExpiresAt: calculateRecordRetentionExpiry(now).toISOString(),
      isArchived: false,
    };

    recordStore.set(id, record);
    return id;
  }

  /**
   * Write a calculation trace
   */
  async writeTrace(
    recordId: string,
    segments: Segment[],
    allocations: AllocationStep[] | undefined,
    rates: RateEntry[],
    timeline?: string[],
  ): Promise<void> {
    const now = new Date();
    const id = generateId();

    const ratesSnapshot: RateEntrySnapshot[] = rates.map(r => ({
      id: r.id,
      interestType: r.interestType,
      validFrom: r.validFrom,
      validTo: r.validTo,
      annualRate: r.annualRate,
      source: r.source,
      sourceReference: r.sourceReference,
    }));

    const trace: CalculationTrace = {
      id,
      recordId,
      segments,
      allocations,
      ratesUsed: ratesSnapshot,
      timeline,
      retentionExpiresAt: calculateTraceRetentionExpiry(now).toISOString(),
      createdAt: now.toISOString(),
    };

    traceStore.set(recordId, trace);
  }


  /**
   * Write a preview record
   */
  async writePreview(
    input: PreviewRecordCreate,
    tenantId: string,
    userId?: string,
  ): Promise<string> {
    const now = new Date();
    const id = generateId();

    const preview: PreviewRecord = {
      id,
      ...createPreviewRecord({ ...input, tenantId, createdBy: userId }, now),
    };

    previewStore.set(id, preview);
    return id;
  }

  /**
   * Get a calculation record by ID
   */
  async getRecord(recordId: string): Promise<CalculationRecord | null> {
    return recordStore.get(recordId) || null;
  }

  /**
   * Get a calculation trace by record ID
   */
  async getTrace(recordId: string): Promise<CalculationTrace | null> {
    return traceStore.get(recordId) || null;
  }

  /**
   * Get a preview record by ID
   */
  async getPreview(previewId: string): Promise<PreviewRecord | null> {
    return previewStore.get(previewId) || null;
  }

  /**
   * Get all records for a case
   */
  async getRecordsForCase(
    caseId: string,
    tenantId: string,
  ): Promise<CalculationRecord[]> {
    const records: CalculationRecord[] = [];
    
    for (const record of recordStore.values()) {
      if (record.caseId === caseId && record.tenantId === tenantId) {
        records.push(record);
      }
    }

    return records.sort((a, b) => 
      new Date(b.calculatedAt).getTime() - new Date(a.calculatedAt).getTime()
    );
  }

  /**
   * Get all previews for a case
   */
  async getPreviewsForCase(
    caseId: string,
    tenantId: string,
  ): Promise<PreviewRecord[]> {
    const previews: PreviewRecord[] = [];
    
    for (const preview of previewStore.values()) {
      if (preview.caseId === caseId && preview.tenantId === tenantId) {
        previews.push(preview);
      }
    }

    return previews.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Check if record exists by input hash
   */
  async findByInputHash(
    inputHash: string,
    tenantId: string,
  ): Promise<CalculationRecord | null> {
    for (const record of recordStore.values()) {
      if (record.inputHash === inputHash && record.tenantId === tenantId) {
        return record;
      }
    }
    return null;
  }

  /**
   * Archive a record
   */
  async archiveRecord(recordId: string): Promise<void> {
    const record = recordStore.get(recordId);
    if (record) {
      record.isArchived = true;
      recordStore.set(recordId, record);
    }
  }

  /**
   * Delete expired previews
   */
  async cleanupExpiredPreviews(): Promise<number> {
    const now = new Date();
    let deleted = 0;

    for (const [id, preview] of previewStore.entries()) {
      if (new Date(preview.expiresAt) < now) {
        previewStore.delete(id);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Get record count for tenant
   */
  async getRecordCount(tenantId: string): Promise<number> {
    let count = 0;
    for (const record of recordStore.values()) {
      if (record.tenantId === tenantId) {
        count++;
      }
    }
    return count;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTING HELPERS (Remove in production)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Clear all stores (for testing only)
   */
  clearAll(): void {
    recordStore.clear();
    traceStore.clear();
    previewStore.clear();
  }
}
