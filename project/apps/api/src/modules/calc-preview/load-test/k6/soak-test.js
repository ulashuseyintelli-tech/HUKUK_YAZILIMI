/**
 * Phase 5.5 - k6 Soak Test Script
 * 
 * 1 saat soak test - sabit yük altında dayanıklılık
 * 
 * Çalıştırma:
 *   k6 run --out json=results.json soak-test.js
 * 
 * CI'da:
 *   k6 run --out json=artifacts/soak-results.json soak-test.js
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.5
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const ENDPOINT = '/calc/preview/light';

// Test duration: 1 hour soak
export const options = {
  scenarios: {
    soak: {
      executor: 'constant-arrival-rate',
      rate: 10, // 10 requests per second
      timeUnit: '1s',
      duration: '1h',
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    // SLO Thresholds
    'http_req_duration': ['p(95)<200', 'p(99)<500'],
    'http_req_failed': ['rate<0.01'],
    'fallback_rate': ['rate<0.02'],
    'success_rate': ['rate>0.99'],
    
    // Memory leak detection (custom)
    'memory_growth': ['value<20'], // Max 20% growth
    
    // Breaker flapping
    'breaker_flaps': ['count<5'],
  },
};

// ============================================================================
// CUSTOM METRICS
// ============================================================================

// Request metrics
const successRate = new Rate('success_rate');
const fallbackRate = new Rate('fallback_rate');
const cacheHitRate = new Rate('cache_hit_rate');
const rateLimitedRate = new Rate('rate_limited_rate');

// Latency by status
const latencyFull = new Trend('latency_full');
const latencyPartial = new Trend('latency_partial');
const latencyUnavailable = new Trend('latency_unavailable');

// Breaker metrics
const breakerFlaps = new Counter('breaker_flaps');
const breakerOpenEvents = new Counter('breaker_open_events');

// Memory metrics (from /calc/metrics endpoint)
const memoryGrowth = new Gauge('memory_growth');

// Error breakdown
const errorsByDomain = new Counter('errors_by_domain');

// ============================================================================
// TEST DATA
// ============================================================================

const TENANTS = [
  { id: 't_demo', weight: 0.6 },
  { id: 't_premium', weight: 0.3 },
  { id: 't_test', weight: 0.1 },
];

const PRINCIPALS = [10000, 50000, 100000, 500000, 1000000];
const INTEREST_TYPES = ['TCMB_AVANS', 'YASAL_FAIZ', 'TEMERRUT'];
const CASE_TYPES = ['ICRA_TAKIP', 'ILAMSIZ_ICRA', 'ILAMLI_ICRA'];

function selectTenant() {
  const rand = Math.random();
  let cumulative = 0;
  for (const tenant of TENANTS) {
    cumulative += tenant.weight;
    if (rand <= cumulative) return tenant.id;
  }
  return TENANTS[0].id;
}

function generatePayload(tenantId) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - randomIntBetween(1, 12));
  
  return {
    tenantId,
    payload: {
      principalAmount: randomItem(PRINCIPALS),
      currency: 'TRY',
      interestType: randomItem(INTEREST_TYPES),
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      caseType: randomItem(CASE_TYPES),
      debtorCount: randomIntBetween(1, 3),
    },
  };
}

// ============================================================================
// SETUP
// ============================================================================

let initialMemory = null;

export function setup() {
  // Get initial metrics
  const metricsRes = http.get(`${BASE_URL}/calc/metrics`);
  if (metricsRes.status === 200) {
    const metrics = JSON.parse(metricsRes.body);
    initialMemory = metrics.memory?.heapUsedMB || 0;
  }
  
  console.log('='.repeat(60));
  console.log('  SOAK TEST STARTING');
  console.log('='.repeat(60));
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Duration: 1 hour`);
  console.log(`  Target RPS: 10`);
  console.log(`  Initial Memory: ${initialMemory?.toFixed(1) || 'N/A'} MB`);
  console.log('='.repeat(60));
  
  return { initialMemory };
}

// ============================================================================
// MAIN TEST
// ============================================================================

export default function(data) {
  const tenantId = selectTenant();
  const payload = generatePayload(tenantId);
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      'X-Force-Trace': 'true',
    },
    timeout: '10s',
  };
  
  group('preview_request', function() {
    const res = http.post(
      `${BASE_URL}${ENDPOINT}`,
      JSON.stringify(payload),
      params
    );
    
    // Basic checks
    const isSuccess = check(res, {
      'status is 200': (r) => r.status === 200,
      'response has body': (r) => r.body && r.body.length > 0,
    });
    
    // Handle rate limiting
    if (res.status === 429) {
      rateLimitedRate.add(1);
      successRate.add(0);
      return;
    }
    
    rateLimitedRate.add(0);
    
    // Parse response
    if (res.status === 200) {
      try {
        const body = JSON.parse(res.body);
        
        // Track status
        if (body.status === 'FULL') {
          successRate.add(1);
          fallbackRate.add(0);
          latencyFull.add(res.timings.duration);
        } else if (body.status === 'PARTIAL') {
          successRate.add(1);
          fallbackRate.add(1);
          latencyPartial.add(res.timings.duration);
        } else {
          successRate.add(0);
          fallbackRate.add(1);
          latencyUnavailable.add(res.timings.duration);
        }
        
        // Track cache
        cacheHitRate.add(body.cached ? 1 : 0);
        
        // Track errors
        if (body.errors && body.errors.length > 0) {
          for (const err of body.errors) {
            errorsByDomain.add(1, { domain: err.domain || 'unknown' });
          }
        }
        
      } catch (e) {
        successRate.add(0);
      }
    } else {
      successRate.add(0);
    }
  });
  
  // Periodically check metrics endpoint
  if (__ITER % 100 === 0) {
    group('metrics_check', function() {
      const metricsRes = http.get(`${BASE_URL}/calc/metrics`);
      
      if (metricsRes.status === 200) {
        try {
          const metrics = JSON.parse(metricsRes.body);
          
          // Check memory growth
          if (data.initialMemory && metrics.memory?.heapUsedMB) {
            const growth = ((metrics.memory.heapUsedMB - data.initialMemory) / data.initialMemory) * 100;
            memoryGrowth.add(growth);
          }
          
        } catch (e) {
          // Ignore parse errors
        }
      }
    });
  }
  
  // Periodically check circuit breaker status
  if (__ITER % 50 === 0) {
    group('breaker_check', function() {
      const breakerRes = http.get(`${BASE_URL}/calc/circuit-breaker/status`);
      
      if (breakerRes.status === 200) {
        try {
          const statuses = JSON.parse(breakerRes.body);
          
          for (const [dep, status] of Object.entries(statuses)) {
            if (status.state === 'OPEN') {
              breakerOpenEvents.add(1, { dependency: dep });
            }
          }
          
        } catch (e) {
          // Ignore parse errors
        }
      }
    });
  }
  
  // Small sleep to prevent overwhelming
  sleep(0.01);
}

// ============================================================================
// TEARDOWN
// ============================================================================

export function teardown(data) {
  // Get final metrics
  const metricsRes = http.get(`${BASE_URL}/calc/metrics`);
  let finalMemory = null;
  
  if (metricsRes.status === 200) {
    try {
      const metrics = JSON.parse(metricsRes.body);
      finalMemory = metrics.memory?.heapUsedMB;
    } catch (e) {}
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('  SOAK TEST COMPLETED');
  console.log('='.repeat(60));
  
  if (data.initialMemory && finalMemory) {
    const growth = ((finalMemory - data.initialMemory) / data.initialMemory) * 100;
    console.log(`  Initial Memory: ${data.initialMemory.toFixed(1)} MB`);
    console.log(`  Final Memory:   ${finalMemory.toFixed(1)} MB`);
    console.log(`  Memory Growth:  ${growth.toFixed(1)}%`);
    
    if (growth > 20) {
      console.log('  ⚠️  WARNING: Memory growth exceeds 20% - potential leak!');
    } else {
      console.log('  ✅ Memory growth within acceptable limits');
    }
  }
  
  console.log('='.repeat(60));
}

// ============================================================================
// HANDLE SUMMARY
// ============================================================================

export function handleSummary(data) {
  const summary = {
    testName: 'Soak Test (1 Hour)',
    timestamp: new Date().toISOString(),
    duration: data.state.testRunDurationMs,
    
    // Request summary
    requests: {
      total: data.metrics.http_reqs?.values?.count || 0,
      rate: data.metrics.http_reqs?.values?.rate || 0,
    },
    
    // Latency
    latency: {
      p50: data.metrics.http_req_duration?.values?.['p(50)'] || 0,
      p95: data.metrics.http_req_duration?.values?.['p(95)'] || 0,
      p99: data.metrics.http_req_duration?.values?.['p(99)'] || 0,
      avg: data.metrics.http_req_duration?.values?.avg || 0,
      max: data.metrics.http_req_duration?.values?.max || 0,
    },
    
    // Rates
    successRate: data.metrics.success_rate?.values?.rate || 0,
    fallbackRate: data.metrics.fallback_rate?.values?.rate || 0,
    cacheHitRate: data.metrics.cache_hit_rate?.values?.rate || 0,
    errorRate: data.metrics.http_req_failed?.values?.rate || 0,
    
    // Thresholds
    thresholds: Object.entries(data.metrics).reduce((acc, [key, metric]) => {
      if (metric.thresholds) {
        acc[key] = {
          passed: Object.values(metric.thresholds).every(t => t.ok),
          details: metric.thresholds,
        };
      }
      return acc;
    }, {}),
    
    // Overall status
    status: data.root_group?.checks?.every(c => c.passes > 0) ? 'PASSED' : 'FAILED',
  };
  
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'artifacts/soak-test-summary.json': JSON.stringify(summary, null, 2),
  };
}

function textSummary(data, options) {
  // Simple text summary
  const lines = [];
  lines.push('');
  lines.push('═'.repeat(60));
  lines.push('  SOAK TEST SUMMARY');
  lines.push('═'.repeat(60));
  lines.push('');
  
  // Requests
  const reqs = data.metrics.http_reqs?.values;
  if (reqs) {
    lines.push(`  Total Requests: ${reqs.count?.toLocaleString() || 0}`);
    lines.push(`  Request Rate:   ${reqs.rate?.toFixed(1) || 0} req/s`);
  }
  
  // Latency
  const dur = data.metrics.http_req_duration?.values;
  if (dur) {
    lines.push('');
    lines.push('  Latency:');
    lines.push(`    p50: ${dur['p(50)']?.toFixed(0) || 0}ms`);
    lines.push(`    p95: ${dur['p(95)']?.toFixed(0) || 0}ms`);
    lines.push(`    p99: ${dur['p(99)']?.toFixed(0) || 0}ms`);
  }
  
  // Rates
  lines.push('');
  lines.push('  Rates:');
  lines.push(`    Success:    ${((data.metrics.success_rate?.values?.rate || 0) * 100).toFixed(1)}%`);
  lines.push(`    Fallback:   ${((data.metrics.fallback_rate?.values?.rate || 0) * 100).toFixed(1)}%`);
  lines.push(`    Cache Hit:  ${((data.metrics.cache_hit_rate?.values?.rate || 0) * 100).toFixed(1)}%`);
  lines.push(`    Error:      ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(1)}%`);
  
  // Thresholds
  lines.push('');
  lines.push('  Thresholds:');
  for (const [key, metric] of Object.entries(data.metrics)) {
    if (metric.thresholds) {
      for (const [threshold, result] of Object.entries(metric.thresholds)) {
        const icon = result.ok ? '✅' : '❌';
        lines.push(`    ${icon} ${key}: ${threshold}`);
      }
    }
  }
  
  lines.push('');
  lines.push('═'.repeat(60));
  
  return lines.join('\n');
}
