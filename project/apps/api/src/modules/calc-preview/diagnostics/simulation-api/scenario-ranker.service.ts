/**
 * Scenario Ranker Service
 *
 * Sprint 3 - Task 4.1
 *
 * Pareto dominance ranking with 3-level tie-break and tradeoff text.
 * Deterministic: same (scenarios, seed) → byte-for-byte same output.
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

import { Injectable } from '@nestjs/common';
import {
  ScenarioResult,
  RankedScenario,
  RankedResult,
  TradeoffExplanation,
} from './scenario-ranker.types';

@Injectable()
export class ScenarioRankerService {
  /**
   * Rank scenarios using Pareto dominance.
   *
   * @param scenarios - Input scenarios
   * @param _seed - Reserved for future stochastic tie-break (unused in Sprint 3)
   */
  rank(scenarios: ScenarioResult[], _seed: number): RankedResult {
    if (scenarios.length === 0) {
      return { scenarios: [], fronts: [], tradeoffs: [] };
    }

    const fronts = this.computeFronts(scenarios);
    const ranked: RankedScenario[] = [];
    const tradeoffs: TradeoffExplanation[] = [];

    for (let fi = 0; fi < fronts.length; fi++) {
      const sorted = this.sortFront(fronts[fi]);
      for (let ri = 0; ri < sorted.length; ri++) {
        ranked.push({ ...sorted[ri], frontIndex: fi, rankInFront: ri });
      }
      // Tradeoff text for adjacent pairs within front
      for (let i = 0; i < sorted.length - 1; i++) {
        tradeoffs.push(this.buildTradeoff(sorted[i], sorted[i + 1]));
      }
      fronts[fi] = sorted.map((s, ri) => ({ ...s, frontIndex: fi, rankInFront: ri }));
    }

    return { scenarios: ranked, fronts: fronts as RankedScenario[][], tradeoffs };
  }

  // --------------------------------------------------------------------------
  // Pareto front computation (iterative front extraction)
  // --------------------------------------------------------------------------

  private computeFronts(scenarios: ScenarioResult[]): ScenarioResult[][] {
    let remaining = [...scenarios];
    const fronts: ScenarioResult[][] = [];

    while (remaining.length > 0) {
      const front: ScenarioResult[] = [];
      for (const s of remaining) {
        const dominated = remaining.some(
          (other) =>
            other !== s &&
            other.riskScore <= s.riskScore &&
            other.costScore <= s.costScore &&
            (other.riskScore < s.riskScore || other.costScore < s.costScore),
        );
        if (!dominated) front.push(s);
      }
      fronts.push(front);
      const frontSet = new Set(front);
      remaining = remaining.filter((s) => !frontSet.has(s));
    }

    return fronts;
  }

  // --------------------------------------------------------------------------
  // Tie-break: riskScore ASC → costScore ASC → scenarioId lexicographic
  // --------------------------------------------------------------------------

  private sortFront(front: ScenarioResult[]): ScenarioResult[] {
    return [...front].sort((a, b) => {
      if (a.riskScore !== b.riskScore) return a.riskScore - b.riskScore;
      if (a.costScore !== b.costScore) return a.costScore - b.costScore;
      return a.scenarioId.localeCompare(b.scenarioId);
    });
  }

  // --------------------------------------------------------------------------
  // Tradeoff text (deterministic template)
  // --------------------------------------------------------------------------

  private buildTradeoff(a: ScenarioResult, b: ScenarioResult): TradeoffExplanation {
    const riskDiff = this.pctDiff(a.riskScore, b.riskScore);
    const costDiff = this.pctDiff(a.costScore, b.costScore);
    const riskDir = a.riskScore <= b.riskScore ? 'düşük' : 'yüksek';
    const costDir = a.costScore <= b.costScore ? 'düşük' : 'yüksek';

    return {
      scenarioA: a.scenarioId,
      scenarioB: b.scenarioId,
      text: `${a.scenarioId}, ${b.scenarioId}'ye göre %${riskDiff} ${riskDir} risk taşır ve %${costDiff} ${costDir} maliyetlidir`,
    };
  }

  private pctDiff(a: number, b: number): number {
    if (b === 0) return a === 0 ? 0 : 100;
    return Math.round(Math.abs(a - b) / Math.abs(b) * 100);
  }
}
