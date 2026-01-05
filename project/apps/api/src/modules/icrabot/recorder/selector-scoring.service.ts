/**
 * SELECTOR SCORING SERVICE (v35)
 * 
 * Selector stability score hesaplama.
 * Heuristic: id/name > css > text > class
 * 
 * Score range: 0.0 - 1.0
 */

import { Injectable } from '@nestjs/common';

export interface ScoredSelector {
  selector: string;
  score: number;
}

@Injectable()
export class SelectorScoringService {
  /**
   * Calculate stability score for a selector
   * Higher score = more stable selector
   */
  scoreSelector(selector: string): number {
    const s = selector || '';
    let score = 0.0;

    // Base score by selector type
    if (s.startsWith('css=#')) {
      // ID selector - most stable
      score += 0.9;
    } else if (s.includes("name='") || s.includes('name=')) {
      // Name attribute - very stable
      score += 0.8;
    } else if (s.startsWith('css=')) {
      // Generic CSS selector
      score += 0.6;
    } else if (s.startsWith('text=')) {
      // Text selector - less stable (text can change)
      score += 0.45;
    } else {
      // Unknown/other
      score += 0.3;
    }

    // Penalize very generic selectors
    if (s.includes('tbody tr') || s.trim() === 'div') {
      score -= 0.15;
    }

    // Bonus for attribute constraints
    if (s.includes('[') && s.includes(']')) {
      score += 0.1;
    }

    // Clamp to 0.0 - 1.0
    return Math.max(0.0, Math.min(1.0, score));
  }

  /**
   * Rank candidates by stability score (descending)
   */
  rankCandidates(candidates: string[]): ScoredSelector[] {
    const scored = candidates
      .filter((c) => c)
      .map((c) => ({
        selector: c,
        score: this.scoreSelector(c),
      }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  /**
   * Get best selector from candidates
   */
  getBestSelector(candidates: string[]): ScoredSelector | null {
    const ranked = this.rankCandidates(candidates);
    return ranked.length > 0 ? ranked[0] : null;
  }
}
