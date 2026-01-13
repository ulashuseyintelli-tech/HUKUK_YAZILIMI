/**
 * Task 13.4 - CalculationTrace JSON Export
 * 
 * exportTrace(recordId) → TraceExport JSON
 * Tek fonksiyon, debuggable output
 */

import { Injectable } from '@nestjs/common';
import { AuditWriterService } from '../audit/audit-writer.service';
import { CalculationRecord } from '../audit/calculation-record.entity';
import { CalculationTrace, RateEntrySnapshot } from '../audit/calculation-trace.entity';
import { Segment, AllocationStep } from '../types/domain.types';
import { CalculationRequest } from '../types/calculation.types';

// ═══════════════════════════════════════════════════════════════════════════
// TRACE EXPORT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface TraceExport {
  version: string;
  exportedAt: string;
  inputHash: string;
  
  // Full trace
  request: CalculationRequest;
  result: {
    totalInterest: number;
    totalDue: number;
    segmentCount: number;
    warningCount: number;
  };
  segments: Segment[];
  allocations?: AllocationStep[];
  ratesUsed: RateEntrySnapshot[];
  
  // Debug info
  timeline?: string[];
  
  // Metadata
  recordId: string;
  calculatedAt: string;
  calculatedBy?: string;
  mode: string;
  
  // Versions
  versions: {
    rateTableVersion: string;
    engineVersion: string;
    ruleVersion?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TRACE EXPORTER SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class TraceExporterService {
  constructor(private readonly auditWriter: AuditWriterService) {}

  /**
   * Export trace for a calculation record
   * 
   * @param recordId - Calculation record ID
   * @returns TraceExport JSON or null if not found
   */
  async exportTrace(recordId: string): Promise<TraceExport | null> {
    // Get record
    const record = await this.auditWriter.getRecord(recordId);
    if (!record) {
      return null;
    }

    // Get trace
    const trace = await this.auditWriter.getTrace(recordId);
    if (!trace) {
      // Return minimal export without trace details
      return this.buildMinimalExport(record);
    }

    return this.buildFullExport(record, trace);
  }

  /**
   * Export trace as formatted JSON string
   */
  async exportTraceAsJson(recordId: string, pretty: boolean = true): Promise<string | null> {
    const trace = await this.exportTrace(recordId);
    if (!trace) {
      return null;
    }

    return pretty 
      ? JSON.stringify(trace, null, 2)
      : JSON.stringify(trace);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private buildMinimalExport(record: CalculationRecord): TraceExport {
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      inputHash: record.inputHash,
      request: record.request as unknown as CalculationRequest,
      result: {
        totalInterest: record.totalInterest,
        totalDue: record.totalDue,
        segmentCount: record.segmentCount,
        warningCount: record.warningCount,
      },
      segments: [],
      ratesUsed: [],
      recordId: record.id,
      calculatedAt: record.calculatedAt,
      calculatedBy: record.calculatedBy,
      mode: record.mode,
      versions: {
        rateTableVersion: record.rateTableVersion,
        engineVersion: record.engineVersion,
        ruleVersion: record.ruleVersion,
      },
    };
  }

  private buildFullExport(record: CalculationRecord, trace: CalculationTrace): TraceExport {
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      inputHash: record.inputHash,
      request: record.request as unknown as CalculationRequest,
      result: {
        totalInterest: record.totalInterest,
        totalDue: record.totalDue,
        segmentCount: record.segmentCount,
        warningCount: record.warningCount,
      },
      segments: trace.segments,
      allocations: trace.allocations,
      ratesUsed: trace.ratesUsed,
      timeline: trace.timeline,
      recordId: record.id,
      calculatedAt: record.calculatedAt,
      calculatedBy: record.calculatedBy,
      mode: record.mode,
      versions: {
        rateTableVersion: record.rateTableVersion,
        engineVersion: record.engineVersion,
        ruleVersion: record.ruleVersion,
      },
    };
  }
}
