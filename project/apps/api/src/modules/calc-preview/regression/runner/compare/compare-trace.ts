/**
 * Phase 5.2 - Trace Comparator
 * 
 * TraceBundle'ları karşılaştırır ve assertion'ları kontrol eder
 */

import { TraceBundle } from '../../../trace';
import { ComparisonDiff, GoldenScenario, AssertionFailure, TraceAssertions } from '../regression.types';
import { normalizeTrace, checkNoPII } from '../normalizers/normalize-trace';
import { classifyDiff, DEFAULT_TOLERANCES, getMaxSeverity } from './diff-classifier';

// ============================================================================
// COMPARATOR
// ============================================================================

export interface TraceComparisonOutput {
  diffs: ComparisonDiff[];
  assertionFailures: AssertionFailure[];
  passed: boolean;
}

/**
 * İki TraceBundle'ı karşılaştır
 */
export function compareTraces(
  expected: TraceBundle | null,
  actual: TraceBundle,
  scenario: GoldenScenario,
): TraceComparisonOutput {
  const diffs: ComparisonDiff[] = [];
  const assertionFailures: AssertionFailure[] = [];
  
  // Baseline yoksa sadece assertion'ları kontrol et
  if (expected) {
    const normalizedExpected = normalizeTrace(expected);
    const normalizedActual = normalizeTrace(actual);
    
    // Deep diff (sadece kritik alanlar)
    diffs.push(...diffCriticalTraceFields(normalizedExpected, normalizedActual));
  }
  
  // Trace assertions
  assertionFailures.push(...checkTraceAssertions(actual, scenario.expect.traceAssertions));
  
  // Passed if no CRITICAL/MAJOR diffs and no assertion failures
  const maxSeverity = getMaxSeverity(diffs);
  const passed = 
    (maxSeverity === 'NOISE' || maxSeverity === 'MINOR') && 
    assertionFailures.length === 0;
  
  return {
    diffs,
    assertionFailures,
    passed,
  };
}

/**
 * Kritik trace alanlarını karşılaştır
 */
function diffCriticalTraceFields(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): ComparisonDiff[] {
  const diffs: ComparisonDiff[] = [];
  
  // Result status
  const expectedStatus = (expected.result as Record<string, unknown>)?.status;
  const actualStatus = (actual.result as Record<string, unknown>)?.status;
  if (expectedStatus !== actualStatus) {
    const diff = classifyDiff('result.status', expectedStatus, actualStatus, DEFAULT_TOLERANCES);
    if (diff) diffs.push(diff);
  }
  
  // Policy outcome
  const expectedPolicy = (expected.policy as Record<string, unknown>)?.softCheck;
  const actualPolicy = (actual.policy as Record<string, unknown>)?.softCheck;
  if (expectedPolicy && actualPolicy) {
    const expectedOutcome = (expectedPolicy as Record<string, unknown>)?.outcome;
    const actualOutcome = (actualPolicy as Record<string, unknown>)?.outcome;
    if (expectedOutcome !== actualOutcome) {
      const diff = classifyDiff('policy.softCheck.outcome', expectedOutcome, actualOutcome, DEFAULT_TOLERANCES);
      if (diff) diffs.push(diff);
    }
  }
  
  // Circuit breaker states
  const expectedBreaker = expected.circuitBreaker as Record<string, unknown>;
  const actualBreaker = actual.circuitBreaker as Record<string, unknown>;
  if (expectedBreaker?.byDependency && actualBreaker?.byDependency) {
    const expectedDeps = expectedBreaker.byDependency as Record<string, unknown>;
    const actualDeps = actualBreaker.byDependency as Record<string, unknown>;
    
    for (const dep of Object.keys(expectedDeps)) {
      const expectedState = (expectedDeps[dep] as Record<string, unknown>)?.state;
      const actualState = (actualDeps[dep] as Record<string, unknown>)?.state;
      if (expectedState !== actualState) {
        const diff = classifyDiff(
          `circuitBreaker.byDependency.${dep}.state`,
          expectedState,
          actualState,
          DEFAULT_TOLERANCES,
        );
        if (diff) diffs.push(diff);
      }
    }
  }
  
  // Dependency outcomes
  const expectedDeps = expected.dependencies as unknown[];
  const actualDeps = actual.dependencies as unknown[];
  if (expectedDeps && actualDeps) {
    for (const expDep of expectedDeps) {
      const expDepObj = expDep as Record<string, unknown>;
      const actDep = actualDeps.find(
        d => (d as Record<string, unknown>).name === expDepObj.name
      ) as Record<string, unknown> | undefined;
      
      if (actDep && expDepObj.outcome !== actDep.outcome) {
        const diff = classifyDiff(
          `dependencies.${expDepObj.name}.outcome`,
          expDepObj.outcome,
          actDep.outcome,
          DEFAULT_TOLERANCES,
        );
        if (diff) diffs.push(diff);
      }
    }
  }
  
  return diffs;
}

/**
 * Trace assertion'larını kontrol et
 */
function checkTraceAssertions(
  trace: TraceBundle,
  assertions: TraceAssertions,
): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  
  // PII check
  if (assertions.noPII) {
    const piiCheck = checkNoPII(trace);
    if (!piiCheck.valid) {
      failures.push({
        type: 'trace',
        path: 'input.normalizedSummary',
        expected: 'no PII',
        actual: piiCheck.violations.join(', '),
        message: `PII found in trace: ${piiCheck.violations.join(', ')}`,
      });
    }
  }
  
  // Max duration check
  if (assertions.maxDurationMs) {
    const duration = trace.meta?.durationMs || 0;
    if (duration > assertions.maxDurationMs) {
      failures.push({
        type: 'trace',
        path: 'meta.durationMs',
        expected: `<= ${assertions.maxDurationMs}`,
        actual: duration,
        message: `Duration ${duration}ms exceeds max ${assertions.maxDurationMs}ms`,
      });
    }
  }
  
  // Breaker never open check
  if (assertions.breakerNeverOpen && assertions.breakerNeverOpen.length > 0) {
    const byDependency = trace.circuitBreaker?.byDependency || {};
    
    for (const dep of assertions.breakerNeverOpen) {
      const state = (byDependency as Record<string, { state: string }>)[dep]?.state;
      if (state === 'OPEN') {
        failures.push({
          type: 'trace',
          path: `circuitBreaker.byDependency.${dep}.state`,
          expected: 'not OPEN',
          actual: 'OPEN',
          message: `Circuit breaker for ${dep} should not be OPEN`,
        });
      }
    }
  }
  
  // Cache hit rate check
  if (assertions.cacheNamespaceHitRateMin) {
    const byNamespace = trace.cache?.byNamespace || {};
    
    for (const [namespace, minRate] of Object.entries(assertions.cacheNamespaceHitRateMin)) {
      const nsStats = (byNamespace as Record<string, { hit: number; miss: number }>)[namespace];
      if (nsStats) {
        const total = nsStats.hit + nsStats.miss;
        const hitRate = total > 0 ? nsStats.hit / total : 0;
        
        if (hitRate < minRate) {
          failures.push({
            type: 'trace',
            path: `cache.byNamespace.${namespace}`,
            expected: `hit rate >= ${minRate}`,
            actual: hitRate,
            message: `Cache hit rate for ${namespace} is ${hitRate.toFixed(2)}, expected >= ${minRate}`,
          });
        }
      }
    }
  }
  
  // No fallback check
  if (assertions.noFallback) {
    const hasFallback = trace.dependencies?.some(d => d.outcome === 'FALLBACK');
    if (hasFallback) {
      failures.push({
        type: 'trace',
        path: 'dependencies',
        expected: 'no FALLBACK',
        actual: 'has FALLBACK',
        message: 'Dependency fallback occurred but was not expected',
      });
    }
  }
  
  // Must have evidence check (when fallback)
  if (assertions.mustHaveEvidence) {
    const fallbackDeps = trace.dependencies?.filter(d => d.outcome === 'FALLBACK') || [];
    for (const dep of fallbackDeps) {
      if (!dep.evidence) {
        failures.push({
          type: 'trace',
          path: `dependencies.${dep.name}.evidence`,
          expected: 'evidence object',
          actual: 'undefined',
          message: `Fallback for ${dep.name} missing evidence`,
        });
      }
    }
  }
  
  return failures;
}
