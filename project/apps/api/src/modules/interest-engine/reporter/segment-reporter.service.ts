/**
 * Task 10.2 - Segment Report Generator
 * 
 * periodStart, periodEnd, days, rate, rateSource, segmentInterest
 * Mahkemeye sunulabilir segment tablosu
 */

import { Injectable } from '@nestjs/common';
import { Segment, AllocationStep, AllocationCategory } from '../types/domain.types';
import { formatMoney, formatDate, formatPercent } from './format-utils';

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENT REPORT ROW
// ═══════════════════════════════════════════════════════════════════════════

export interface SegmentReportRow {
  periodStart: string;
  periodEnd: string;
  days: number;
  rate: string;
  rateSource: string;
  principal: string;
  interest: string;
  phase?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATION REPORT ROW
// ═══════════════════════════════════════════════════════════════════════════

export interface AllocationReportRow {
  paymentDate: string;
  paymentAmount: string;
  category: string;
  amountBefore: string;
  amountAllocated: string;
  amountAfter: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENT REPORTER SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class SegmentReporterService {
  /**
   * Generate segment report rows
   */
  generateSegmentRows(segments: Segment[]): SegmentReportRow[] {
    return segments.map(segment => ({
      periodStart: formatDate(segment.periodStart),
      periodEnd: formatDate(segment.periodEnd),
      days: segment.days,
      rate: formatPercent(segment.rate),
      rateSource: segment.rateSource,
      principal: formatMoney(segment.principal),
      interest: formatMoney(segment.segmentInterest),
      phase: segment.phase === 'PRE_ENFORCEMENT' ? 'Takip Öncesi' : 
             segment.phase === 'POST_ENFORCEMENT' ? 'Takip Sonrası' : undefined,
    }));
  }

  /**
   * Generate segment table as text
   */
  generateSegmentTable(segments: Segment[]): string {
    const rows = this.generateSegmentRows(segments);
    const lines: string[] = [];

    // Header
    lines.push('FAİZ HESAPLAMA TABLOSU');
    lines.push('='.repeat(100));
    lines.push(
      this.padRight('Dönem Başı', 12) +
      this.padRight('Dönem Sonu', 12) +
      this.padRight('Gün', 6) +
      this.padRight('Oran', 10) +
      this.padRight('Anapara', 15) +
      this.padRight('Faiz', 15) +
      'Kaynak'
    );
    lines.push('-'.repeat(100));

    // Rows
    for (const row of rows) {
      lines.push(
        this.padRight(row.periodStart, 12) +
        this.padRight(row.periodEnd, 12) +
        this.padRight(row.days.toString(), 6) +
        this.padRight(row.rate, 10) +
        this.padRight(row.principal, 15) +
        this.padRight(row.interest, 15) +
        row.rateSource
      );
    }

    // Summary
    lines.push('-'.repeat(100));
    const totalDays = segments.reduce((sum, s) => sum + s.days, 0);
    const totalInterest = segments.reduce((sum, s) => sum + s.segmentInterest, 0);
    lines.push(
      this.padRight('TOPLAM', 12) +
      this.padRight('', 12) +
      this.padRight(totalDays.toString(), 6) +
      this.padRight('', 10) +
      this.padRight('', 15) +
      formatMoney(totalInterest)
    );

    return lines.join('\n');
  }

  /**
   * Generate allocation report rows
   */
  generateAllocationRows(steps: AllocationStep[]): AllocationReportRow[] {
    const rows: AllocationReportRow[] = [];

    for (const step of steps) {
      for (const alloc of step.allocations) {
        if (alloc.amountAllocated > 0) {
          rows.push({
            paymentDate: formatDate(step.paymentDate),
            paymentAmount: formatMoney(step.paymentAmount),
            category: alloc.label,
            amountBefore: formatMoney(alloc.amountBefore),
            amountAllocated: formatMoney(alloc.amountAllocated),
            amountAfter: formatMoney(alloc.amountAfter),
          });
        }
      }
    }

    return rows;
  }

  /**
   * Generate allocation table as text
   */
  generateAllocationTable(steps: AllocationStep[]): string {
    const rows = this.generateAllocationRows(steps);
    if (rows.length === 0) return '';

    const lines: string[] = [];

    // Header
    lines.push('');
    lines.push('ÖDEME MAHSUP TABLOSU (TBK m.100)');
    lines.push('='.repeat(100));
    lines.push(
      this.padRight('Ödeme Tarihi', 14) +
      this.padRight('Ödeme Tutarı', 15) +
      this.padRight('Kalem', 20) +
      this.padRight('Önceki', 15) +
      this.padRight('Mahsup', 15) +
      'Kalan'
    );
    lines.push('-'.repeat(100));

    // Rows
    for (const row of rows) {
      lines.push(
        this.padRight(row.paymentDate, 14) +
        this.padRight(row.paymentAmount, 15) +
        this.padRight(row.category, 20) +
        this.padRight(row.amountBefore, 15) +
        this.padRight(row.amountAllocated, 15) +
        row.amountAfter
      );
    }

    return lines.join('\n');
  }

  /**
   * Generate phase summary (PRE/POST enforcement)
   */
  generatePhaseSummary(segments: Segment[]): string {
    const preSegments = segments.filter(s => s.phase === 'PRE_ENFORCEMENT');
    const postSegments = segments.filter(s => s.phase === 'POST_ENFORCEMENT');

    if (preSegments.length === 0 && postSegments.length === 0) {
      return '';
    }

    const lines: string[] = [];
    lines.push('');
    lines.push('DÖNEM ÖZET');
    lines.push('-'.repeat(50));

    if (preSegments.length > 0) {
      const preTotal = preSegments.reduce((sum, s) => sum + s.segmentInterest, 0);
      const preDays = preSegments.reduce((sum, s) => sum + s.days, 0);
      lines.push(`Takip Öncesi: ${preDays} gün, ${formatMoney(preTotal)} faiz`);
    }

    if (postSegments.length > 0) {
      const postTotal = postSegments.reduce((sum, s) => sum + s.segmentInterest, 0);
      const postDays = postSegments.reduce((sum, s) => sum + s.days, 0);
      lines.push(`Takip Sonrası: ${postDays} gün, ${formatMoney(postTotal)} faiz`);
    }

    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private padRight(str: string, length: number): string {
    return str.padEnd(length);
  }
}
