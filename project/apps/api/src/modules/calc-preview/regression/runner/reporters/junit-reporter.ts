/**
 * Phase 5.2 - JUnit Reporter
 * 
 * Regression test sonuçlarını JUnit XML formatında üretir
 * CI/CD sistemlerinde test sonuçları olarak görüntülenir
 */

import { RegressionRunResult, ComparisonResult } from '../regression.types';

// ============================================================================
// JUNIT XML GENERATOR
// ============================================================================

/**
 * JUnit XML formatında rapor üret
 */
export function generateJUnitXml(result: RegressionRunResult): string {
  const lines: string[] = [];
  
  // XML header
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  
  // Test suites
  lines.push(`<testsuites name="Regression Tests" tests="${result.totalScenarios}" failures="${result.failed}" skipped="${result.skipped}" time="${(result.durationMs / 1000).toFixed(3)}">`);
  
  // Single test suite for all scenarios
  lines.push(`  <testsuite name="Golden Scenarios" tests="${result.totalScenarios}" failures="${result.failed}" skipped="${result.skipped}" time="${(result.durationMs / 1000).toFixed(3)}">`);
  
  // Individual test cases
  for (const scenario of result.results) {
    lines.push(generateTestCase(scenario));
  }
  
  lines.push('  </testsuite>');
  lines.push('</testsuites>');
  
  return lines.join('\n');
}

/**
 * Tek test case XML'i üret
 */
function generateTestCase(result: ComparisonResult): string {
  const lines: string[] = [];
  const time = (result.durationMs / 1000).toFixed(3);
  const className = 'regression.GoldenScenarios';
  const name = `${result.scenarioId} - ${result.scenarioName}`;
  
  if (result.passed) {
    // Passed test
    lines.push(`    <testcase classname="${className}" name="${escapeXml(name)}" time="${time}" />`);
  } else {
    // Failed test
    lines.push(`    <testcase classname="${className}" name="${escapeXml(name)}" time="${time}">`);
    
    // Failure message
    const failureMessage = buildFailureMessage(result);
    const failureType = result.severity;
    
    lines.push(`      <failure type="${failureType}" message="${escapeXml(failureMessage.summary)}">`);
    lines.push(escapeXml(failureMessage.details));
    lines.push('      </failure>');
    
    // System out - full diff details
    lines.push('      <system-out>');
    lines.push(escapeXml(JSON.stringify({
      diffs: result.diffs,
      assertionFailures: result.assertionFailures,
    }, null, 2)));
    lines.push('      </system-out>');
    
    lines.push('    </testcase>');
  }
  
  return lines.join('\n');
}

/**
 * Failure mesajı oluştur
 */
function buildFailureMessage(result: ComparisonResult): { summary: string; details: string } {
  const parts: string[] = [];
  
  // Summary
  const diffCounts = {
    CRITICAL: result.diffs.filter(d => d.severity === 'CRITICAL').length,
    MAJOR: result.diffs.filter(d => d.severity === 'MAJOR').length,
    MINOR: result.diffs.filter(d => d.severity === 'MINOR').length,
    NOISE: result.diffs.filter(d => d.severity === 'NOISE').length,
  };
  
  const summary = [
    diffCounts.CRITICAL > 0 ? `${diffCounts.CRITICAL} CRITICAL` : null,
    diffCounts.MAJOR > 0 ? `${diffCounts.MAJOR} MAJOR` : null,
    result.assertionFailures.length > 0 ? `${result.assertionFailures.length} assertion failures` : null,
  ].filter(Boolean).join(', ');
  
  // Details
  if (result.assertionFailures.length > 0) {
    parts.push('Assertion Failures:');
    for (const failure of result.assertionFailures) {
      parts.push(`  - [${failure.type}] ${failure.message}`);
    }
    parts.push('');
  }
  
  if (result.diffs.length > 0) {
    parts.push('Diffs:');
    
    // Show CRITICAL and MAJOR diffs
    const importantDiffs = result.diffs.filter(d => 
      d.severity === 'CRITICAL' || d.severity === 'MAJOR'
    );
    
    for (const diff of importantDiffs.slice(0, 10)) {
      parts.push(`  [${diff.severity}] ${diff.path}`);
      parts.push(`    expected: ${JSON.stringify(diff.expected)}`);
      parts.push(`    actual:   ${JSON.stringify(diff.actual)}`);
    }
    
    if (importantDiffs.length > 10) {
      parts.push(`  ... and ${importantDiffs.length - 10} more`);
    }
  }
  
  return {
    summary: summary || 'Test failed',
    details: parts.join('\n'),
  };
}

/**
 * XML escape
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
