/**
 * Task 5.4 - Segment Builder Service
 * 
 * buildSegments() metodu
 * PRE_ENFORCEMENT / POST_ENFORCEMENT phase ayrımı
 */

import { Injectable } from '@nestjs/common';
import { ClaimBucket, Segment } from '../types/domain.types';
import { 
  DayCountBasis, 
  RoundingMode, 
  RoundingScope,
  SameDayPaymentRule,
} from '../types/common.types';
import { RateEntry } from '../rates/rate-entry.entity';
import { 
  generateTimeline, 
  getTimelineSegments, 
  findRateForDate,
  TimelineOptions,
} from './timeline-generator';
import { 
  calculateDays, 
  determinePhase,
  getDayCountRuleString,
} from './day-count-calculator';
import { 
  calculateSegmentInterest, 
  roundMoney,
  calculateTotalInterest,
} from './interest-formula';

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENT BUILD OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface SegmentBuildOptions {
  enforcementDate?: string;
  paymentDates?: string[];
  dayCountBasis: DayCountBasis;
  roundingMode: RoundingMode;
  roundingScope: RoundingScope;
  sameDayPaymentRule: SameDayPaymentRule;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENT BUILD RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface SegmentBuildResult {
  segments: Segment[];
  totalInterest: number;
  preEnforcementInterest: number;
  postEnforcementInterest: number;
  roundingDifference: number;
  timeline: string[];
}


// ═══════════════════════════════════════════════════════════════════════════
// SEGMENT BUILDER SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class SegmentBuilderService {
  /**
   * Build segments for a claim bucket
   * 
   * @param claimBucket - Alacak kalemi
   * @param asOfDate - Hesap tarihi
   * @param rates - Dönem için oranlar
   * @param options - Segment build options
   */
  buildSegments(
    claimBucket: ClaimBucket,
    asOfDate: string,
    rates: RateEntry[],
    options: SegmentBuildOptions,
  ): SegmentBuildResult {
    const startDate = claimBucket.ibrazTarihi || claimBucket.startDate;
    const endDate = asOfDate;
    const basis = claimBucket.dayCountBasis || options.dayCountBasis;

    // Handle fixed rate (COMMERCIAL_FIXED, CONTRACTUAL)
    if (claimBucket.fixedRate !== undefined) {
      return this.buildFixedRateSegment(
        claimBucket,
        startDate,
        endDate,
        basis,
        options,
      );
    }

    // Generate timeline
    const timelineOptions: TimelineOptions = {
      enforcementDate: options.enforcementDate,
      paymentDates: options.paymentDates,
      sameDayPaymentRule: options.sameDayPaymentRule,
    };

    const timeline = generateTimeline(startDate, endDate, rates, timelineOptions);
    const segmentPairs = getTimelineSegments(timeline);

    // Build segments
    const segments: Segment[] = [];
    const segmentInterests: number[] = [];

    for (const [periodStart, periodEnd] of segmentPairs) {
      const rate = findRateForDate(periodStart, rates);
      if (!rate) continue;

      const days = calculateDays(periodStart, periodEnd);
      if (days <= 0) continue;

      const interest = calculateSegmentInterest(
        claimBucket.amount,
        rate.annualRate,
        days,
        basis,
      );

      const roundedInterest = options.roundingScope === RoundingScope.PER_SEGMENT
        ? roundMoney(interest, options.roundingMode)
        : interest;

      segmentInterests.push(interest);

      segments.push({
        claimBucketId: claimBucket.id,
        periodStart,
        periodEnd,
        days,
        rate: rate.annualRate,
        rateId: rate.id,
        rateSource: `${rate.source} ${rate.sourceReference || ''}`.trim(),
        principal: claimBucket.amount,
        segmentInterest: roundedInterest,
        phase: determinePhase(periodStart, periodEnd, options.enforcementDate),
        dayCountRule: getDayCountRuleString(basis),
      });
    }

    // Calculate totals
    const { total, roundingDifference } = calculateTotalInterest(
      segmentInterests,
      options.roundingMode,
      options.roundingScope,
    );

    const preEnforcementInterest = segments
      .filter(s => s.phase === 'PRE_ENFORCEMENT')
      .reduce((sum, s) => sum + s.segmentInterest, 0);

    const postEnforcementInterest = segments
      .filter(s => s.phase === 'POST_ENFORCEMENT')
      .reduce((sum, s) => sum + s.segmentInterest, 0);

    return {
      segments,
      totalInterest: total,
      preEnforcementInterest: roundMoney(preEnforcementInterest, options.roundingMode),
      postEnforcementInterest: roundMoney(postEnforcementInterest, options.roundingMode),
      roundingDifference,
      timeline,
    };
  }

  /**
   * Build single segment for fixed rate
   */
  private buildFixedRateSegment(
    claimBucket: ClaimBucket,
    startDate: string,
    endDate: string,
    basis: DayCountBasis,
    options: SegmentBuildOptions,
  ): SegmentBuildResult {
    const days = calculateDays(startDate, endDate);
    
    if (days <= 0) {
      return {
        segments: [],
        totalInterest: 0,
        preEnforcementInterest: 0,
        postEnforcementInterest: 0,
        roundingDifference: 0,
        timeline: [startDate, endDate],
      };
    }

    const interest = calculateSegmentInterest(
      claimBucket.amount,
      claimBucket.fixedRate!,
      days,
      basis,
    );

    const roundedInterest = roundMoney(interest, options.roundingMode);
    const phase = determinePhase(startDate, endDate, options.enforcementDate);

    const segment: Segment = {
      claimBucketId: claimBucket.id,
      periodStart: startDate,
      periodEnd: endDate,
      days,
      rate: claimBucket.fixedRate!,
      rateId: 'FIXED',
      rateSource: 'Sabit Oran',
      principal: claimBucket.amount,
      segmentInterest: roundedInterest,
      phase,
      dayCountRule: getDayCountRuleString(basis),
    };

    return {
      segments: [segment],
      totalInterest: roundedInterest,
      preEnforcementInterest: phase === 'PRE_ENFORCEMENT' ? roundedInterest : 0,
      postEnforcementInterest: phase === 'POST_ENFORCEMENT' ? roundedInterest : 0,
      roundingDifference: roundMoney(roundedInterest - interest, options.roundingMode, 4),
      timeline: [startDate, endDate],
    };
  }
}
