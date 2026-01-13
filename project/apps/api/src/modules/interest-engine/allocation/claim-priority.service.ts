/**
 * Task 8.2 - Claim Priority Service (Soft Policy Tie-breaker)
 * 
 * SOFT RULE: Policy sadece aynı sınıf içinde tie-breaker belirler.
 * TBK 100 HARD RULE her zaman galip.
 * 
 * claimPriorityRule:
 * - OLDEST_DUE_FIRST: startDate ascending
 * - HIGHEST_RATE_FIRST: rate descending
 * - CUSTOM: priority field ascending
 */

import { Injectable } from '@nestjs/common';
import { ClaimBucket, Segment } from '../types/domain.types';

// ═══════════════════════════════════════════════════════════════════════════
// CLAIM PRIORITY RULE
// ═══════════════════════════════════════════════════════════════════════════

export enum ClaimPriorityRule {
  OLDEST_DUE_FIRST = 'OLDEST_DUE_FIRST',
  HIGHEST_RATE_FIRST = 'HIGHEST_RATE_FIRST',
  CUSTOM = 'CUSTOM',
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAIM WITH COMPUTED VALUES
// ═══════════════════════════════════════════════════════════════════════════

export interface ClaimWithInterest {
  claim: ClaimBucket;
  accruedInterest: number;
  effectiveRate: number; // Weighted average rate
  segments: Segment[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAIM PRIORITY SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class ClaimPriorityService {
  /**
   * Sort claims according to priority rule
   * 
   * This is a SOFT RULE - only determines order within same TBK 100 class.
   * TBK 100 HARD RULE (interest → costs → ancillaries → principal) is NOT affected.
   * 
   * @param claims - Claims with computed interest
   * @param rule - Priority rule
   */
  sortClaims(
    claims: ClaimWithInterest[],
    rule: ClaimPriorityRule,
  ): ClaimWithInterest[] {
    const sorted = [...claims];

    switch (rule) {
      case ClaimPriorityRule.OLDEST_DUE_FIRST:
        return this.sortByOldestDueFirst(sorted);

      case ClaimPriorityRule.HIGHEST_RATE_FIRST:
        return this.sortByHighestRateFirst(sorted);

      case ClaimPriorityRule.CUSTOM:
        return this.sortByCustomPriority(sorted);

      default:
        return sorted;
    }
  }

  /**
   * Sort claims by startDate ascending (oldest first)
   */
  sortByOldestDueFirst(claims: ClaimWithInterest[]): ClaimWithInterest[] {
    return claims.sort((a, b) => {
      const dateA = a.claim.ibrazTarihi || a.claim.startDate;
      const dateB = b.claim.ibrazTarihi || b.claim.startDate;
      
      // Primary: startDate ascending
      const dateCompare = dateA.localeCompare(dateB);
      if (dateCompare !== 0) return dateCompare;
      
      // Secondary: amount descending (larger debts first for same date)
      return b.claim.amount - a.claim.amount;
    });
  }

  /**
   * Sort claims by effective rate descending (highest rate first)
   */
  sortByHighestRateFirst(claims: ClaimWithInterest[]): ClaimWithInterest[] {
    return claims.sort((a, b) => {
      // Primary: effectiveRate descending
      const rateCompare = b.effectiveRate - a.effectiveRate;
      if (Math.abs(rateCompare) > 0.0001) return rateCompare;
      
      // Secondary: startDate ascending (older first for same rate)
      const dateA = a.claim.ibrazTarihi || a.claim.startDate;
      const dateB = b.claim.ibrazTarihi || b.claim.startDate;
      return dateA.localeCompare(dateB);
    });
  }

  /**
   * Sort claims by custom priority field ascending
   */
  sortByCustomPriority(claims: ClaimWithInterest[]): ClaimWithInterest[] {
    return claims.sort((a, b) => {
      const priorityA = a.claim.priority ?? Number.MAX_SAFE_INTEGER;
      const priorityB = b.claim.priority ?? Number.MAX_SAFE_INTEGER;
      
      // Primary: priority ascending (lower number = higher priority)
      const priorityCompare = priorityA - priorityB;
      if (priorityCompare !== 0) return priorityCompare;
      
      // Secondary: startDate ascending
      const dateA = a.claim.ibrazTarihi || a.claim.startDate;
      const dateB = b.claim.ibrazTarihi || b.claim.startDate;
      return dateA.localeCompare(dateB);
    });
  }

  /**
   * Calculate effective rate for a claim (weighted average)
   */
  calculateEffectiveRate(segments: Segment[]): number {
    if (segments.length === 0) return 0;

    let totalDays = 0;
    let weightedRateSum = 0;

    for (const segment of segments) {
      totalDays += segment.days;
      weightedRateSum += segment.rate * segment.days;
    }

    return totalDays > 0 ? weightedRateSum / totalDays : 0;
  }

  /**
   * Create ClaimWithInterest from claim and segments
   */
  createClaimWithInterest(
    claim: ClaimBucket,
    segments: Segment[],
  ): ClaimWithInterest {
    const accruedInterest = segments.reduce(
      (sum, s) => sum + s.segmentInterest,
      0,
    );

    return {
      claim,
      accruedInterest,
      effectiveRate: this.calculateEffectiveRate(segments),
      segments,
    };
  }

  /**
   * Get claim IDs in priority order
   */
  getClaimIdsInOrder(
    claims: ClaimWithInterest[],
    rule: ClaimPriorityRule,
  ): string[] {
    const sorted = this.sortClaims(claims, rule);
    return sorted.map(c => c.claim.id);
  }

  /**
   * Validate custom priority values
   * Returns true if all claims have valid priority values
   */
  validateCustomPriorities(claims: ClaimBucket[]): boolean {
    const priorities = claims
      .map(c => c.priority)
      .filter((p): p is number => p !== undefined);

    // All claims should have priority for CUSTOM mode
    if (priorities.length !== claims.length) {
      return false;
    }

    // Check for duplicates
    const uniquePriorities = new Set(priorities);
    return uniquePriorities.size === priorities.length;
  }

  /**
   * Get priority rule description (for legal text)
   */
  getPriorityRuleDescription(rule: ClaimPriorityRule): string {
    switch (rule) {
      case ClaimPriorityRule.OLDEST_DUE_FIRST:
        return 'Alacak kalemleri vadesi en eski olandan başlayarak sıralanmıştır.';
      case ClaimPriorityRule.HIGHEST_RATE_FIRST:
        return 'Alacak kalemleri faiz oranı en yüksek olandan başlayarak sıralanmıştır.';
      case ClaimPriorityRule.CUSTOM:
        return 'Alacak kalemleri belirlenen öncelik sırasına göre sıralanmıştır.';
      default:
        return '';
    }
  }
}
