/**
 * Phase 5.2 - Console Reporter
 * 
 * Regression test sonuçlarını konsola yazdırır
 */

import { RegressionRunResult, ComparisonResult, DiffSeverity } from '../regression.types';

// ============================================================================
// COLORS
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

const SEVERITY_COLORS: Record<DiffSeverity, string> = {
  NOISE: COLORS.gray,
  MINOR: COLORS.yellow,
  MAJOR: COLORS.magenta,
  CRITICAL: COLORS.red,
};

const SEVERITY_ICONS: Record<DiffSeverity, string> = {
  NOISE: '○',
  MINOR: '◐',
  MAJOR: '●',
  CRITICAL: '✖',
};

// ============================================================================
// REPORTER
// ============================================================================

/**
 * Regression sonuçlarını konsola yazdır
 */
export function reportToConsole(result: RegressionRunResult): void {
  console.log('\n');
  console.log(`${COLORS.bold}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bold}                    REGRESSION TEST RESULTS                     ${COLORS.reset}`);
  console.log(`${COLORS.bold}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log('\n');
  
  // Summary
  const passedColor = result.failed === 0 ? COLORS.green : COLORS.red;
  console.log(`${COLORS.bold}Summary:${COLORS.reset}`);
  console.log(`  Total:   ${result.totalScenarios}`);
  console.log(`  ${COLORS.green}Passed:  ${result.passed}${COLORS.reset}`);
  console.log(`  ${COLORS.red}Failed:  ${result.failed}${COLORS.reset}`);
  console.log(`  ${COLORS.gray}Skipped: ${result.skipped}${COLORS.reset}`);
  console.log(`  Duration: ${result.durationMs}ms`);
  console.log('\n');
  
  // By severity
  console.log(`${COLORS.bold}By Severity:${COLORS.reset}`);
  for (const [severity, count] of Object.entries(result.bySeverity)) {
    const color = SEVERITY_COLORS[severity as DiffSeverity];
    const icon = SEVERITY_ICONS[severity as DiffSeverity];
    console.log(`  ${color}${icon} ${severity}: ${count}${COLORS.reset}`);
  }
  console.log('\n');
  
  // Individual results
  console.log(`${COLORS.bold}Scenarios:${COLORS.reset}`);
  console.log('───────────────────────────────────────────────────────────────');
  
  for (const scenario of result.results) {
    printScenarioResult(scenario);
  }
  
  console.log('\n');
  
  // Final verdict
  if (result.failed === 0) {
    console.log(`${COLORS.green}${COLORS.bold}✓ All regression tests passed!${COLORS.reset}`);
  } else {
    console.log(`${COLORS.red}${COLORS.bold}✖ ${result.failed} regression test(s) failed!${COLORS.reset}`);
  }
  
  console.log('\n');
}

/**
 * Tek senaryo sonucunu yazdır
 */
function printScenarioResult(result: ComparisonResult): void {
  const icon = result.passed ? `${COLORS.green}✓${COLORS.reset}` : `${COLORS.red}✖${COLORS.reset}`;
  const severityColor = SEVERITY_COLORS[result.severity];
  
  console.log(`\n${icon} ${COLORS.bold}${result.scenarioId}${COLORS.reset} - ${result.scenarioName}`);
  console.log(`  ${COLORS.gray}Duration: ${result.durationMs}ms | Severity: ${severityColor}${result.severity}${COLORS.reset}`);
  
  // Diffs
  if (result.diffs.length > 0) {
    console.log(`  ${COLORS.cyan}Diffs (${result.diffs.length}):${COLORS.reset}`);
    
    // Group by severity
    const bySeverity = groupBySeverity(result.diffs);
    
    for (const [severity, diffs] of Object.entries(bySeverity)) {
      if (diffs.length === 0) continue;
      
      const color = SEVERITY_COLORS[severity as DiffSeverity];
      console.log(`    ${color}${severity} (${diffs.length}):${COLORS.reset}`);
      
      // Show first 3 diffs per severity
      for (const diff of diffs.slice(0, 3)) {
        console.log(`      ${COLORS.gray}${diff.path}:${COLORS.reset}`);
        console.log(`        expected: ${JSON.stringify(diff.expected)}`);
        console.log(`        actual:   ${JSON.stringify(diff.actual)}`);
      }
      
      if (diffs.length > 3) {
        console.log(`      ${COLORS.gray}... and ${diffs.length - 3} more${COLORS.reset}`);
      }
    }
  }
  
  // Assertion failures
  if (result.assertionFailures.length > 0) {
    console.log(`  ${COLORS.red}Assertion Failures (${result.assertionFailures.length}):${COLORS.reset}`);
    
    for (const failure of result.assertionFailures) {
      console.log(`    ${COLORS.red}✖${COLORS.reset} [${failure.type}] ${failure.message}`);
    }
  }
}

/**
 * Diff'leri severity'ye göre grupla
 */
function groupBySeverity(diffs: ComparisonResult['diffs']): Record<DiffSeverity, typeof diffs> {
  const result: Record<DiffSeverity, typeof diffs> = {
    NOISE: [],
    MINOR: [],
    MAJOR: [],
    CRITICAL: [],
  };
  
  for (const diff of diffs) {
    result[diff.severity].push(diff);
  }
  
  return result;
}
