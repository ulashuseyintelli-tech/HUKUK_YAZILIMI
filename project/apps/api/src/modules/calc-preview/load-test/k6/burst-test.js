/**
 * Phase 5.5 - k6 Burst Test Script
 * 
 * Rate limit ve burst capacity testi
 * 
 * Çalıştırma:
 *   k6 run --out json=results.json burst-test.js
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.5
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const ENDPOINT = '/calc/preview/light';

// Burst test: steady + periodic spikes
export const options = {
  scenarios: {
    // Steady state: 5 RPS
    steady: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 10,
      maxVUs: 20,
    },
    // Burst: 50 RPS for 10 seconds, every minute
    burst: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 100,
      stages: [
        // Minute 1: spike
        { duration: '10s', target: 50 },
        { duration: '50s', target: 5 },
        // Minute 2: spike
        { duration: '10s', target: 50 },
        { duration: '50s', target: 5 },
        // Minute 3: spike
        { duration: '10s', target: 50 },
        { duration: '50s', target: 5 },
        // Minute 4: spike
        { duration: '10s', target: 50 },
        { duration: '50s', target: 5 },
        // Minute 5: spike
        { duration: '10s', target: 50 },
        { duration: '50s', target: 5 },
        // Minutes 6-10: steady
        { duration: '5m', target: 5 },
      ],
    },
  },
  thresholds: {
    // Burst tolerances (higher than soak)
    'http_req_duration': ['p(95)<300', 'p(99)<1000'],
    'http_req_failed': ['rate<0.05'],
    'success_rate': ['rate>0.95'],
    
    // Rate limiting should kick in
    'rate_limited': ['count>0'], // Expect some rate limiting
    'rate_limited_rate': ['rate<0.20'], // But not too much
  },
};

// ============================================================================
// CUSTOM METRICS
// ============================================================================

const successRate = new Rate('success_rate');
const fallbackRate = new Rate('fallback_rate');
const rateLimited = new Counter('rate_limited');
const rateLimitedRate = new Rate('rate_limited_rate');

const latencyDuringBurst = new Trend('latency_during_burst');
const latencyDuringSteady = new Trend('latency_during_steady');

// ============================================================================
// TEST DATA
// ============================================================================

const TENANTS = [
  { id: 't_demo', weight: 0.8 },
  { id: 't_premium', weight: 0.2 },
];

const PRINCIPALS = [10000, 50000, 100000, 500000, 1000000];
const INTEREST_TYPES = ['TCMB_AVANS', 'YASAL_FAIZ', 'TEMERRUT'];

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
      caseType: 'ICRA_TAKIP',
      debtorCount: randomIntBetween(1, 3),
    },
  };
}

// Detect if we're in a burst period
function isInBurstPeriod() {
  const elapsed = Date.now() - __ENV.START_TIME;
  const minute = Math.floor(elapsed / 60000);
  const secondInMinute = (elapsed % 60000) / 1000;
  
  // First 10 seconds of each minute (for first 5 minutes) is burst
  return minute < 5 && secondInMinute < 10;
}

// ============================================================================
// SETUP
// ============================================================================

export function setup() {
  console.log('='.repeat(60));
  console.log('  BURST TEST STARTING');
  console.log('='.repeat(60));
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Duration: 10 minutes`);
  console.log(`  Steady RPS: 5`);
  console.log(`  Burst RPS: 50 (10s every minute for first 5 min)`);
  console.log('='.repeat(60));
  
  return { startTime: Date.now() };
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
    },
    timeout: '10s',
  };
  
  const res = http.post(
    `${BASE_URL}${ENDPOINT}`,
    JSON.stringify(payload),
    params
  );
  
  // Track rate limiting
  if (res.status === 429) {
    rateLimited.add(1);
    rateLimitedRate.add(1);
    successRate.add(0);
    
    // Check Retry-After header
    const retryAfter = res.headers['Retry-After'];
    if (retryAfter) {
      sleep(parseFloat(retryAfter));
    }
    return;
  }
  
  rateLimitedRate.add(0);
  
  // Track latency by period
  const isBurst = isInBurstPeriod();
  if (isBurst) {
    latencyDuringBurst.add(res.timings.duration);
  } else {
    latencyDuringSteady.add(res.timings.duration);
  }
  
  // Parse response
  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      
      if (body.status === 'FULL' || body.status === 'PARTIAL') {
        successRate.add(1);
        fallbackRate.add(body.status === 'PARTIAL' ? 1 : 0);
      } else {
        successRate.add(0);
      }
    } catch (e) {
      successRate.add(0);
    }
  } else {
    successRate.add(0);
  }
}

// ============================================================================
// TEARDOWN
// ============================================================================

export function teardown(data) {
  console.log('');
  console.log('='.repeat(60));
  console.log('  BURST TEST COMPLETED');
  console.log('='.repeat(60));
}

// ============================================================================
// HANDLE SUMMARY
// ============================================================================

export function handleSummary(data) {
  const summary = {
    testName: 'Burst Test',
    timestamp: new Date().toISOString(),
    duration: data.state.testRunDurationMs,
    
    requests: {
      total: data.metrics.http_reqs?.values?.count || 0,
      rateLimited: data.metrics.rate_limited?.values?.count || 0,
    },
    
    latency: {
      overall: {
        p95: data.metrics.http_req_duration?.values?.['p(95)'] || 0,
        p99: data.metrics.http_req_duration?.values?.['p(99)'] || 0,
      },
      duringBurst: {
        avg: data.metrics.latency_during_burst?.values?.avg || 0,
        p95: data.metrics.latency_during_burst?.values?.['p(95)'] || 0,
      },
      duringSteady: {
        avg: data.metrics.latency_during_steady?.values?.avg || 0,
        p95: data.metrics.latency_during_steady?.values?.['p(95)'] || 0,
      },
    },
    
    rates: {
      success: data.metrics.success_rate?.values?.rate || 0,
      rateLimited: data.metrics.rate_limited_rate?.values?.rate || 0,
    },
    
    status: Object.values(data.metrics)
      .filter(m => m.thresholds)
      .every(m => Object.values(m.thresholds).every(t => t.ok))
      ? 'PASSED' : 'FAILED',
  };
  
  return {
    'artifacts/burst-test-summary.json': JSON.stringify(summary, null, 2),
  };
}
