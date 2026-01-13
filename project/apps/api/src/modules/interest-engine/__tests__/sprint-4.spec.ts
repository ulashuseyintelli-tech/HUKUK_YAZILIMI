/**
 * Sprint-4: Reporter + Audit Tests
 * 
 * Task 10.5: Unit tests for Reporter
 * Task 11.9: Unit tests for Audit Writer
 */

import { 
  INTEREST_TYPE_LEGAL_TEXTS,
  buildLegalText,
  PREVIEW_DISCLAIMER,
  TBK100_ALLOCATION_TEXT,
  CLAIM_PRIORITY_TEXTS,
} from '../reporter/legal-text-templates';
import { 
  formatMoney, 
  formatDate, 
  formatPercent,
  formatDateRange,
  formatTimestamp,
} from '../reporter/format-utils';
import { SegmentReporterService } from '../reporter/segment-reporter.service';
import { LegalReportRendererService, LegalReportInput } from '../reporter/legal-report-renderer.service';
import { AuditWriterService } from '../audit/audit-writer.service';
import { 
  CalculationRecord,
  CALCULATION_RECORD_RETENTION,
  calculateRecordRetentionExpiry,
} from '../audit/calculation-record.entity';
import {
  CALCULATION_TRACE_RETENTION,
  calculateTraceRetentionExpiry,
} from '../audit/calculation-trace.entity';
import {
  PREVIEW_RECORD_RETENTION,
  calculatePreviewExpiry,
  createPreviewRecord,
} from '../audit/preview-record.entity';
import { InterestTypeCode, Segment, AllocationStep } from '../types/domain.types';
import { CalculationMode, RoundingMode, RoundingScope, SameDayPaymentRule } from '../types/common.types';
import { ClaimPriorityRule } from '../allocation/claim-priority.service';

describe('Sprint-4: Reporter + Audit', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function createSegment(
    claimBucketId: string,
    periodStart: string,
    periodEnd: string,
    days: number,
    rate: number,
    segmentInterest: number,
    phase?: 'PRE_ENFORCEMENT' | 'POST_ENFORCEMENT',
  ): Segment {
    return {
      claimBucketId,
      periodStart,
      periodEnd,
      days,
      rate,
      rateId: 'rate-1',
      rateSource: 'TCMB 20.12.2025',
      principal: 100000,
      segmentInterest,
      phase,
    };
  }

  function createAllocationStep(
    paymentId: string,
    paymentDate: string,
    paymentAmount: number,
    category: string,
    amountBefore: number,
    amountAllocated: number,
  ): AllocationStep {
    return {
      paymentId,
      paymentDate,
      paymentAmount,
      allocations: [{
        category: category as any,
        label: category === 'INTEREST' ? 'İşlemiş Faiz' : 
               category === 'PRINCIPAL' ? 'Anapara' : category,
        amountBefore,
        amountAllocated,
        amountAfter: amountBefore - amountAllocated,
      }],
      remainingPayment: 0,
      newPrincipal: 100000 - (category === 'PRINCIPAL' ? amountAllocated : 0),
      claimBucketId: 'claim-1',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 10.1: LEGAL TEXT TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 10.1: Legal Text Templates', () => {
    it('should have legal text for all interest types', () => {
      const interestTypes = Object.values(InterestTypeCode);
      
      for (const type of interestTypes) {
        expect(INTEREST_TYPE_LEGAL_TEXTS[type]).toBeDefined();
        expect(INTEREST_TYPE_LEGAL_TEXTS[type].length).toBeGreaterThan(10);
      }
    });

    it('should include law references in legal texts', () => {
      expect(INTEREST_TYPE_LEGAL_TEXTS[InterestTypeCode.LEGAL_3095]).toContain('3095');
      expect(INTEREST_TYPE_LEGAL_TEXTS[InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]).toContain('3095');
      expect(INTEREST_TYPE_LEGAL_TEXTS[InterestTypeCode.TTK_1530]).toContain('6102');
    });

    it('should build legal text with all parameters', () => {
      const text = buildLegalText({
        interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
        dayCountBasis: 365,
        roundingMode: RoundingMode.HALF_UP,
        roundingScope: RoundingScope.PER_SEGMENT,
        sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
        rates: [{ rate: 0.4225, source: 'TCMB' }],
        mode: CalculationMode.PRODUCTION,
      });

      expect(text).toContain('3095');
      expect(text).toContain('%42.25');
      expect(text).toContain('365');
    });

    it('should include disclaimer for PREVIEW mode', () => {
      const text = buildLegalText({
        interestType: InterestTypeCode.LEGAL_3095,
        dayCountBasis: 365,
        roundingMode: RoundingMode.HALF_UP,
        roundingScope: RoundingScope.TOTAL_ONLY,
        rates: [{ rate: 0.24, source: 'RG' }],
        mode: CalculationMode.PREVIEW,
      });

      expect(text).toContain('önizleme');
    });

    it('should not include disclaimer for PRODUCTION mode', () => {
      const text = buildLegalText({
        interestType: InterestTypeCode.LEGAL_3095,
        dayCountBasis: 365,
        roundingMode: RoundingMode.HALF_UP,
        roundingScope: RoundingScope.TOTAL_ONLY,
        rates: [{ rate: 0.24, source: 'RG' }],
        mode: CalculationMode.PRODUCTION,
      });

      expect(text).not.toContain('önizleme');
    });

    it('should have TBK 100 allocation text', () => {
      expect(TBK100_ALLOCATION_TEXT).toContain('6098');
      expect(TBK100_ALLOCATION_TEXT).toContain('faiz');
      expect(TBK100_ALLOCATION_TEXT).toContain('anapara');
    });

    it('should have claim priority texts', () => {
      expect(CLAIM_PRIORITY_TEXTS.OLDEST_DUE_FIRST).toContain('eski');
      expect(CLAIM_PRIORITY_TEXTS.HIGHEST_RATE_FIRST).toContain('yüksek');
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // FORMAT UTILS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Format Utils', () => {
    it('should format money with Turkish locale', () => {
      expect(formatMoney(1234.56)).toContain('1.234,56');
      expect(formatMoney(1234.56)).toContain('₺');
    });

    it('should format date to Turkish format', () => {
      expect(formatDate('2025-01-15')).toBe('15.01.2025');
      expect(formatDate('2025-12-31')).toBe('31.12.2025');
    });

    it('should format percent correctly', () => {
      expect(formatPercent(0.4225)).toBe('%42.25');
      expect(formatPercent(0.50)).toBe('%50.00');
    });

    it('should format date range', () => {
      expect(formatDateRange('2025-01-01', '2025-01-31')).toBe('01.01.2025 - 31.01.2025');
    });

    it('should format timestamp', () => {
      const timestamp = formatTimestamp(new Date('2025-01-15T10:30:00Z'));
      expect(timestamp).toContain('2025');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 10.2: SEGMENT REPORTER
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 10.2: SegmentReporterService', () => {
    let segmentReporter: SegmentReporterService;

    beforeEach(() => {
      segmentReporter = new SegmentReporterService();
    });

    it('should generate segment rows', () => {
      const segments = [
        createSegment('c1', '2025-01-01', '2025-01-15', 14, 0.4225, 1621.92),
        createSegment('c1', '2025-01-15', '2025-02-01', 17, 0.3975, 1851.37),
      ];

      const rows = segmentReporter.generateSegmentRows(segments);

      expect(rows.length).toBe(2);
      expect(rows[0].periodStart).toBe('01.01.2025');
      expect(rows[0].days).toBe(14);
      expect(rows[0].rate).toBe('%42.25');
    });

    it('should generate segment table', () => {
      const segments = [
        createSegment('c1', '2025-01-01', '2025-01-15', 14, 0.4225, 1621.92),
      ];

      const table = segmentReporter.generateSegmentTable(segments);

      expect(table).toContain('FAİZ HESAPLAMA TABLOSU');
      expect(table).toContain('01.01.2025');
      expect(table).toContain('TOPLAM');
    });

    it('should generate allocation rows', () => {
      const steps = [
        createAllocationStep('p1', '2025-02-01', 5000, 'INTEREST', 3000, 3000),
        createAllocationStep('p1', '2025-02-01', 5000, 'PRINCIPAL', 100000, 2000),
      ];

      const rows = segmentReporter.generateAllocationRows(steps);

      expect(rows.length).toBe(2);
      expect(rows[0].category).toBe('İşlemiş Faiz');
      expect(rows[1].category).toBe('Anapara');
    });

    it('should generate phase summary', () => {
      const segments = [
        createSegment('c1', '2025-01-01', '2025-01-15', 14, 0.4225, 1621.92, 'PRE_ENFORCEMENT'),
        createSegment('c1', '2025-01-15', '2025-02-01', 17, 0.3975, 1851.37, 'POST_ENFORCEMENT'),
      ];

      const summary = segmentReporter.generatePhaseSummary(segments);

      expect(summary).toContain('Takip Öncesi');
      expect(summary).toContain('Takip Sonrası');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 10.3 + 10.4: LEGAL REPORT RENDERER
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 10.3 + 10.4: LegalReportRendererService', () => {
    let renderer: LegalReportRendererService;
    let segmentReporter: SegmentReporterService;

    beforeEach(() => {
      segmentReporter = new SegmentReporterService();
      renderer = new LegalReportRendererService(segmentReporter);
    });

    function createReportInput(mode: CalculationMode): LegalReportInput {
      return {
        caseId: '2025/12345',
        calculatedAt: '2025-01-15T10:30:00Z',
        asOfDate: '2025-01-15',
        totalInterest: 3473.29,
        totalDue: 103473.29,
        segments: [
          createSegment('c1', '2025-01-01', '2025-01-15', 14, 0.4225, 1621.92),
          createSegment('c1', '2025-01-15', '2025-02-01', 17, 0.3975, 1851.37),
        ],
        mode,
        parameters: {
          interestType: 'Ticari Temerrüt Faizi (TCMB Avans)',
          dayCountBasis: 365,
          roundingMode: RoundingMode.HALF_UP,
          roundingScope: RoundingScope.PER_SEGMENT,
          sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
        },
        versions: {
          rateTableVersion: 'v2025.01.15',
          engineVersion: '1.0.0',
        },
        warningCount: 0,
      };
    }

    it('should render complete legal report', () => {
      const input = createReportInput(CalculationMode.PRODUCTION);
      const report = renderer.renderLegalReport(input);

      expect(report).toContain('FAİZ HESAPLAMA RAPORU');
      expect(report).toContain('2025/12345');
      expect(report).toContain('FAİZ ÖZETİ');
      expect(report).toContain('HESAPLAMA PARAMETRELERİ');
      expect(report).toContain('SÜRÜM BİLGİLERİ');
    });

    it('should include disclaimer for PREVIEW mode', () => {
      const input = createReportInput(CalculationMode.PREVIEW);
      const report = renderer.renderLegalReport(input);

      expect(report).toContain('ÖNİZLEME');
      expect(report).toContain('RESMİ HESAPLAMA DEĞİLDİR');
    });

    it('should not include disclaimer for PRODUCTION mode', () => {
      const input = createReportInput(CalculationMode.PRODUCTION);
      const report = renderer.renderLegalReport(input);

      expect(report).not.toContain('RESMİ HESAPLAMA DEĞİLDİR');
    });

    it('should not include disclaimer for LEGAL_REPORT mode', () => {
      const input = createReportInput(CalculationMode.LEGAL_REPORT);
      const report = renderer.renderLegalReport(input);

      expect(report).not.toContain('RESMİ HESAPLAMA DEĞİLDİR');
      expect(report).toContain('Mahkeme Raporu');
    });

    it('should include allocation section when payments exist', () => {
      const input = createReportInput(CalculationMode.PRODUCTION);
      input.allocations = [
        createAllocationStep('p1', '2025-02-01', 5000, 'INTEREST', 3000, 3000),
      ];
      input.parameters.claimPriorityRule = ClaimPriorityRule.OLDEST_DUE_FIRST;

      const report = renderer.renderLegalReport(input);

      expect(report).toContain('TBK');
      expect(report).toContain('ÖDEME MAHSUP');
    });

    it('should include version information', () => {
      const input = createReportInput(CalculationMode.PRODUCTION);
      const report = renderer.renderLegalReport(input);

      expect(report).toContain('v2025.01.15');
      expect(report).toContain('1.0.0');
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 11.1: CALCULATION RECORD ENTITY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 11.1: CalculationRecord Entity', () => {
    it('should have correct retention policy', () => {
      expect(CALCULATION_RECORD_RETENTION.activeDays).toBe(90);
      expect(CALCULATION_RECORD_RETENTION.archiveDays).toBe(3650);
      expect(CALCULATION_RECORD_RETENTION.totalDays).toBe(3740);
    });

    it('should calculate retention expiry correctly', () => {
      const now = new Date('2025-01-15');
      const expiry = calculateRecordRetentionExpiry(now);
      
      const expectedExpiry = new Date('2025-04-15'); // 90 days later
      expect(expiry.toISOString().split('T')[0]).toBe(expectedExpiry.toISOString().split('T')[0]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 11.2: CALCULATION TRACE ENTITY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 11.2: CalculationTrace Entity', () => {
    it('should have correct retention policy', () => {
      expect(CALCULATION_TRACE_RETENTION.activeDays).toBe(30);
      expect(CALCULATION_TRACE_RETENTION.archiveDays).toBe(730);
      expect(CALCULATION_TRACE_RETENTION.summaryRetained).toBe(true);
    });

    it('should calculate trace retention expiry correctly', () => {
      const now = new Date('2025-01-15');
      const expiry = calculateTraceRetentionExpiry(now);
      
      const expectedExpiry = new Date('2025-02-14'); // 30 days later
      expect(expiry.toISOString().split('T')[0]).toBe(expectedExpiry.toISOString().split('T')[0]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 11.3: PREVIEW RECORD ENTITY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 11.3: PreviewRecord Entity', () => {
    it('should have correct retention policy', () => {
      expect(PREVIEW_RECORD_RETENTION.activeDays).toBe(30);
      expect(PREVIEW_RECORD_RETENTION.archiveDays).toBe(0);
      expect(PREVIEW_RECORD_RETENTION.summaryRetained).toBe(false);
    });

    it('should calculate preview expiry correctly', () => {
      const now = new Date('2025-01-15');
      const expiry = calculatePreviewExpiry(now);
      
      const expectedExpiry = new Date('2025-02-14'); // 30 days later
      expect(expiry.toISOString().split('T')[0]).toBe(expectedExpiry.toISOString().split('T')[0]);
    });

    it('should create preview record with defaults', () => {
      const input = {
        tenantId: 'tenant-1',
        caseId: '2025/12345',
        inputHash: 'a'.repeat(64),
        request: {},
        totalInterest: 1000,
        segments: [],
        hasRateGaps: false,
      };

      const preview = createPreviewRecord(input);

      expect(preview.isPreview).toBe(true);
      expect(preview.nonAuthoritative).toBe(true);
      expect(preview.disclaimer).toContain('ÖNİZLEME');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 11.4: AUDIT WRITER SERVICE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 11.4: AuditWriterService', () => {
    let auditWriter: AuditWriterService;

    beforeEach(() => {
      auditWriter = new AuditWriterService();
      auditWriter.clearAll();
    });

    it('should write and retrieve calculation record', async () => {
      const recordId = await auditWriter.writeRecord({
        caseId: '2025/12345',
        inputHash: 'a'.repeat(64),
        request: { test: true },
        totalInterest: 1000,
        totalDue: 101000,
        segmentCount: 2,
        warningCount: 0,
        rateTableVersion: 'v1',
        engineVersion: '1.0.0',
        mode: CalculationMode.PRODUCTION,
        calculatedAt: new Date().toISOString(),
      }, 'tenant-1', 'user-1');

      const record = await auditWriter.getRecord(recordId);

      expect(record).not.toBeNull();
      expect(record!.caseId).toBe('2025/12345');
      expect(record!.tenantId).toBe('tenant-1');
      expect(record!.calculatedBy).toBe('user-1');
    });

    it('should write and retrieve calculation trace', async () => {
      const recordId = await auditWriter.writeRecord({
        caseId: '2025/12345',
        inputHash: 'a'.repeat(64),
        request: {},
        totalInterest: 1000,
        totalDue: 101000,
        segmentCount: 1,
        warningCount: 0,
        rateTableVersion: 'v1',
        engineVersion: '1.0.0',
        mode: CalculationMode.PRODUCTION,
        calculatedAt: new Date().toISOString(),
      }, 'tenant-1');

      const segments = [createSegment('c1', '2025-01-01', '2025-01-15', 14, 0.4225, 1000)];
      await auditWriter.writeTrace(recordId, segments, undefined, []);

      const trace = await auditWriter.getTrace(recordId);

      expect(trace).not.toBeNull();
      expect(trace!.segments.length).toBe(1);
    });

    it('should write and retrieve preview record', async () => {
      const previewId = await auditWriter.writePreview({
        caseId: '2025/12345',
        inputHash: 'a'.repeat(64),
        request: {},
        totalInterest: 1000,
        segments: [],
        hasRateGaps: true,
        gapDetails: [{ from: '2025-01-01', to: '2025-01-05', days: 4 }],
      }, 'tenant-1', 'user-1');

      const preview = await auditWriter.getPreview(previewId);

      expect(preview).not.toBeNull();
      expect(preview!.isPreview).toBe(true);
      expect(preview!.hasRateGaps).toBe(true);
    });

    it('should get records for case', async () => {
      await auditWriter.writeRecord({
        caseId: '2025/12345',
        inputHash: 'a'.repeat(64),
        request: {},
        totalInterest: 1000,
        totalDue: 101000,
        segmentCount: 1,
        warningCount: 0,
        rateTableVersion: 'v1',
        engineVersion: '1.0.0',
        mode: CalculationMode.PRODUCTION,
        calculatedAt: new Date().toISOString(),
      }, 'tenant-1');

      await auditWriter.writeRecord({
        caseId: '2025/12345',
        inputHash: 'b'.repeat(64),
        request: {},
        totalInterest: 2000,
        totalDue: 102000,
        segmentCount: 2,
        warningCount: 0,
        rateTableVersion: 'v2',
        engineVersion: '1.0.0',
        mode: CalculationMode.PRODUCTION,
        calculatedAt: new Date().toISOString(),
      }, 'tenant-1');

      const records = await auditWriter.getRecordsForCase('2025/12345', 'tenant-1');

      expect(records.length).toBe(2);
    });

    it('should find record by input hash', async () => {
      const inputHash = 'x'.repeat(64);
      
      await auditWriter.writeRecord({
        caseId: '2025/12345',
        inputHash,
        request: {},
        totalInterest: 1000,
        totalDue: 101000,
        segmentCount: 1,
        warningCount: 0,
        rateTableVersion: 'v1',
        engineVersion: '1.0.0',
        mode: CalculationMode.PRODUCTION,
        calculatedAt: new Date().toISOString(),
      }, 'tenant-1');

      const found = await auditWriter.findByInputHash(inputHash, 'tenant-1');

      expect(found).not.toBeNull();
      expect(found!.inputHash).toBe(inputHash);
    });

    it('should archive record', async () => {
      const recordId = await auditWriter.writeRecord({
        caseId: '2025/12345',
        inputHash: 'a'.repeat(64),
        request: {},
        totalInterest: 1000,
        totalDue: 101000,
        segmentCount: 1,
        warningCount: 0,
        rateTableVersion: 'v1',
        engineVersion: '1.0.0',
        mode: CalculationMode.PRODUCTION,
        calculatedAt: new Date().toISOString(),
      }, 'tenant-1');

      await auditWriter.archiveRecord(recordId);

      const record = await auditWriter.getRecord(recordId);
      expect(record!.isArchived).toBe(true);
    });
  });
});
