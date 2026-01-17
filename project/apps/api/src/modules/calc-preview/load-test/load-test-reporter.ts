/**
 * Phase 5.5 - Load Test Reporter
 * 
 * Report generation:
 * - JSON (CI artifact)
 * - Console (human readable)
 * - HTML (dashboard)
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.5
 */

import { LoadTestResult, TestSummary } from './load-test.types';

// ============================================================================
// CONSOLE REPORTER
// ============================================================================

export function generateConsoleReport(result: LoadTestResult): string {
  const lines: string[] = [];
  const { summary } = result;
  
  // Header
  lines.push('');
  lines.push('═'.repeat(70));
  lines.push(`  LOAD TEST REPORT: ${result.testName}`);
  lines.push('═'.repeat(70));
  lines.push('');
  
  // Status
  const statusIcon = result.status === 'PASSED' ? '✅' : result.status === 'FAILED' ? '❌' : '⚠️';
  lines.push(`  Status: ${statusIcon} ${result.status}`);
  lines.push(`  Test ID: ${result.testId}`);
  lines.push(`  Duration: ${(result.durationMs / 1000 / 60).toFixed(1)} minutes`);
  lines.push(`  Started: ${result.startedAt}`);
  lines.push(`  Ended: ${result.endedAt}`);
  lines.push('');
  
  // Request Summary
  lines.push('─'.repeat(70));
  lines.push('  REQUEST SUMMARY');
  lines.push('─'.repeat(70));
  lines.push(`  Total Requests:     ${summary.totalRequests.toLocaleString()}`);
  lines.push(`  Successful:         ${summary.successfulRequests.toLocaleString()} (${(summary.successRate * 100).toFixed(1)}%)`);
  lines.push(`  Failed:             ${summary.failedRequests.toLocaleString()} (${(summary.errorRate * 100).toFixed(1)}%)`);
  lines.push(`  Fallback:           ${summary.fallbackRequests.toLocaleString()} (${(summary.fallbackRate * 100).toFixed(1)}%)`);
  lines.push(`  Rate Limited:       ${summary.rateLimitedRequests.toLocaleString()}`);
  lines.push(`  Actual RPS:         ${summary.actualRps.toFixed(1)}`);
  lines.push(`  Cache Hit Rate:     ${(summary.cacheHitRate * 100).toFixed(1)}%`);
  lines.push('');
  
  // Latency
  lines.push('─'.repeat(70));
  lines.push('  LATENCY (ms)');
  lines.push('─'.repeat(70));
  lines.push(`  p50:    ${summary.latency.p50.toFixed(0)}ms`);
  lines.push(`  p95:    ${summary.latency.p95.toFixed(0)}ms`);
  lines.push(`  p99:    ${summary.latency.p99.toFixed(0)}ms`);
  lines.push(`  max:    ${summary.latency.max.toFixed(0)}ms`);
  lines.push(`  min:    ${summary.latency.min.toFixed(0)}ms`);
  lines.push(`  avg:    ${summary.latency.avg.toFixed(0)}ms`);
  lines.push('');
  
  // Memory
  lines.push('─'.repeat(70));
  lines.push('  MEMORY');
  lines.push('─'.repeat(70));
  lines.push(`  Start Heap:   ${summary.memory.startHeapMB.toFixed(1)} MB`);
  lines.push(`  End Heap:     ${summary.memory.endHeapMB.toFixed(1)} MB`);
  lines.push(`  Peak Heap:    ${summary.memory.peakHeapMB.toFixed(1)} MB`);
  lines.push(`  Growth:       ${summary.memory.growthPercent.toFixed(1)}%`);
  lines.push('');
  
  // Circuit Breaker
  lines.push('─'.repeat(70));
  lines.push('  CIRCUIT BREAKER');
  lines.push('─'.repeat(70));
  lines.push(`  Open Events:      ${summary.breaker.openEvents}`);
  lines.push(`  Recovery Events:  ${summary.breaker.recoveryEvents}`);
  lines.push(`  Total Flaps:      ${summary.breaker.totalFlaps}`);
  lines.push(`  Flaps/Hour:       ${summary.breaker.flapsPerHour.toFixed(1)}`);
  lines.push('');
  
  // SLO Violations
  if (result.sloViolations.length > 0) {
    lines.push('─'.repeat(70));
    lines.push('  SLO VIOLATIONS');
    lines.push('─'.repeat(70));
    for (const violation of result.sloViolations.slice(0, 10)) {
      lines.push(`  ⚠️ ${violation.metric}: ${violation.actual} (threshold: ${violation.threshold})`);
    }
    if (result.sloViolations.length > 10) {
      lines.push(`  ... and ${result.sloViolations.length - 10} more`);
    }
    lines.push('');
  }
  
  // Failure Reasons
  if (result.failureReasons.length > 0) {
    lines.push('─'.repeat(70));
    lines.push('  FAILURE REASONS');
    lines.push('─'.repeat(70));
    for (const reason of result.failureReasons) {
      lines.push(`  ❌ ${reason}`);
    }
    lines.push('');
  }
  
  // Footer
  lines.push('═'.repeat(70));
  lines.push('');
  
  return lines.join('\n');
}

// ============================================================================
// JSON REPORTER
// ============================================================================

export function generateJsonReport(result: LoadTestResult): string {
  return JSON.stringify(result, null, 2);
}

// ============================================================================
// HTML REPORTER
// ============================================================================

export function generateHtmlReport(result: LoadTestResult): string {
  const { summary, timeSeries } = result;
  
  const statusColor = result.status === 'PASSED' ? '#22c55e' : result.status === 'FAILED' ? '#ef4444' : '#f59e0b';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Load Test Report - ${result.testName}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: white; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: 600; color: white; background: ${statusColor}; }
    .meta { color: #6b7280; font-size: 14px; margin-top: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 20px; }
    .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h3 { font-size: 14px; color: #6b7280; text-transform: uppercase; margin-bottom: 16px; }
    .metric { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
    .metric:last-child { border-bottom: none; }
    .metric-label { color: #374151; }
    .metric-value { font-weight: 600; color: #111827; }
    .chart-container { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .chart-container h3 { font-size: 14px; color: #6b7280; text-transform: uppercase; margin-bottom: 16px; }
    .failures { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .failures h3 { color: #991b1b; margin-bottom: 12px; }
    .failures ul { list-style: none; }
    .failures li { color: #991b1b; padding: 4px 0; }
    .failures li::before { content: "❌ "; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${result.testName}</h1>
      <span class="status">${result.status}</span>
      <div class="meta">
        <div>Test ID: ${result.testId}</div>
        <div>Duration: ${(result.durationMs / 1000 / 60).toFixed(1)} minutes</div>
        <div>Started: ${result.startedAt}</div>
      </div>
    </div>
    
    ${result.failureReasons.length > 0 ? `
    <div class="failures">
      <h3>Failure Reasons</h3>
      <ul>
        ${result.failureReasons.map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    
    <div class="grid">
      <div class="card">
        <h3>Request Summary</h3>
        <div class="metric"><span class="metric-label">Total Requests</span><span class="metric-value">${summary.totalRequests.toLocaleString()}</span></div>
        <div class="metric"><span class="metric-label">Success Rate</span><span class="metric-value">${(summary.successRate * 100).toFixed(1)}%</span></div>
        <div class="metric"><span class="metric-label">Error Rate</span><span class="metric-value">${(summary.errorRate * 100).toFixed(1)}%</span></div>
        <div class="metric"><span class="metric-label">Fallback Rate</span><span class="metric-value">${(summary.fallbackRate * 100).toFixed(1)}%</span></div>
        <div class="metric"><span class="metric-label">Actual RPS</span><span class="metric-value">${summary.actualRps.toFixed(1)}</span></div>
        <div class="metric"><span class="metric-label">Cache Hit Rate</span><span class="metric-value">${(summary.cacheHitRate * 100).toFixed(1)}%</span></div>
      </div>
      
      <div class="card">
        <h3>Latency (ms)</h3>
        <div class="metric"><span class="metric-label">p50</span><span class="metric-value">${summary.latency.p50.toFixed(0)}ms</span></div>
        <div class="metric"><span class="metric-label">p95</span><span class="metric-value">${summary.latency.p95.toFixed(0)}ms</span></div>
        <div class="metric"><span class="metric-label">p99</span><span class="metric-value">${summary.latency.p99.toFixed(0)}ms</span></div>
        <div class="metric"><span class="metric-label">Max</span><span class="metric-value">${summary.latency.max.toFixed(0)}ms</span></div>
        <div class="metric"><span class="metric-label">Avg</span><span class="metric-value">${summary.latency.avg.toFixed(0)}ms</span></div>
      </div>
      
      <div class="card">
        <h3>Memory</h3>
        <div class="metric"><span class="metric-label">Start Heap</span><span class="metric-value">${summary.memory.startHeapMB.toFixed(1)} MB</span></div>
        <div class="metric"><span class="metric-label">End Heap</span><span class="metric-value">${summary.memory.endHeapMB.toFixed(1)} MB</span></div>
        <div class="metric"><span class="metric-label">Peak Heap</span><span class="metric-value">${summary.memory.peakHeapMB.toFixed(1)} MB</span></div>
        <div class="metric"><span class="metric-label">Growth</span><span class="metric-value">${summary.memory.growthPercent.toFixed(1)}%</span></div>
      </div>
      
      <div class="card">
        <h3>Circuit Breaker</h3>
        <div class="metric"><span class="metric-label">Open Events</span><span class="metric-value">${summary.breaker.openEvents}</span></div>
        <div class="metric"><span class="metric-label">Recovery Events</span><span class="metric-value">${summary.breaker.recoveryEvents}</span></div>
        <div class="metric"><span class="metric-label">Total Flaps</span><span class="metric-value">${summary.breaker.totalFlaps}</span></div>
        <div class="metric"><span class="metric-label">Flaps/Hour</span><span class="metric-value">${summary.breaker.flapsPerHour.toFixed(1)}</span></div>
      </div>
    </div>
    
    <div class="chart-container">
      <h3>Latency Over Time</h3>
      <canvas id="latencyChart"></canvas>
    </div>
    
    <div class="chart-container">
      <h3>RPS & Success Rate</h3>
      <canvas id="rpsChart"></canvas>
    </div>
    
    <div class="chart-container">
      <h3>Memory Usage</h3>
      <canvas id="memoryChart"></canvas>
    </div>
  </div>
  
  <script>
    const timestamps = ${JSON.stringify(timeSeries.timestamps.map(t => new Date(t).toLocaleTimeString()))};
    
    // Latency Chart
    new Chart(document.getElementById('latencyChart'), {
      type: 'line',
      data: {
        labels: timestamps,
        datasets: [
          { label: 'p95', data: ${JSON.stringify(timeSeries.p95Latency)}, borderColor: '#f59e0b', fill: false },
          { label: 'p99', data: ${JSON.stringify(timeSeries.p99Latency)}, borderColor: '#ef4444', fill: false },
        ]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, title: { display: true, text: 'ms' } } } }
    });
    
    // RPS Chart
    new Chart(document.getElementById('rpsChart'), {
      type: 'line',
      data: {
        labels: timestamps,
        datasets: [
          { label: 'RPS', data: ${JSON.stringify(timeSeries.rps)}, borderColor: '#3b82f6', fill: false, yAxisID: 'y' },
          { label: 'Success Rate', data: ${JSON.stringify(timeSeries.successRate.map(r => r * 100))}, borderColor: '#22c55e', fill: false, yAxisID: 'y1' },
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: { type: 'linear', position: 'left', title: { display: true, text: 'RPS' } },
          y1: { type: 'linear', position: 'right', min: 0, max: 100, title: { display: true, text: '%' } }
        }
      }
    });
    
    // Memory Chart
    new Chart(document.getElementById('memoryChart'), {
      type: 'line',
      data: {
        labels: timestamps,
        datasets: [
          { label: 'Heap Used (MB)', data: ${JSON.stringify(timeSeries.heapUsedMB)}, borderColor: '#8b5cf6', fill: true, backgroundColor: 'rgba(139, 92, 246, 0.1)' },
        ]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, title: { display: true, text: 'MB' } } } }
    });
  </script>
</body>
</html>`;
}
