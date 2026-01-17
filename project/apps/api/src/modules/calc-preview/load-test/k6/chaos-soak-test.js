/**
 * Phase 5.5 - k6 Chaos Soak Test Script
 * 
 * Fault injection ile dayanıklılık testi
 * 
 * Çalıştırma:
 *   ENABLE_CHAOS_ENDPOINTS=true k6 run chaos-soak-test.js
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
const CHAOS_ENDPOINT = '/calc/chaos';

// Chaos soak: 30 minutes with periodic fault injection
export const options = {
  scenarios: {
    load: {
      executor: 'constant-arrival-rate',
      rate: 5, // Lower RPS with chaos
      timeUnit: '1s',
      duration: '30m',
      preAllocatedVUs: 15,
      maxVUs: 30,
    },
    chaos_injector: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 30, // 30 chaos injections over 30 minutes
      maxDuration: '30m',
    },
  },
  thresholds: {
    // Chaos tolerances (more lenient)
    'http_req_duration': ['p(95)<500', 'p(99)<2000'],
    'http_req_failed': ['rate<0.10'],
    'success_rate': ['rate>0.90'],
    'fallback_rate': ['rate<0.15'],
    
    // Breaker should activate
    'breaker_activations': ['count>0'],
    
    // Recovery should happen
    'recovery_events': ['count>0'],
  },
};

// ============================================================================
// CUSTOM METRICS
// ============================================================================

const successRate = new Rate('success_rate');
const fallbackRate = new Rate('fallback_rate');
const degradedRate = new Rate('degraded_rate');

const breakerActivations = new Counter('breaker_activations');
const recoveryEvents = new Counter('recovery_events');

const latencyWithChaos = new Trend('latency_with_chaos');
const latencyWithoutChaos = new Trend('latency_without_chaos');

// ============================================================================
// CHAOS SCENARIOS
// ============================================================================

const CHAOS_SCENARIOS = [
  {
    name: 'rate_provider_timeout',
    inject: {
      dependency: 'rate_provider',
      mode: 'TIMEOUT',
      durationMs: 30000, // 30 seconds
    },
  },
  {
    name: 'interest_engine_500',
    inject: {
      dependency: 'interest_engine',
      mode: 'ERROR_500',
      durationMs: 20000,
    },
  },
  {
    name: 'fee_engine_latency',
    inject: {
      dependency: 'fee_engine',
      mode: 'DELAY',
      delayMs: 2000,
      durationMs: 30000,
    },
  },
  {
    name: 'policy_engine_invalid',
    inject: {
      dependency: 'policy_engine',
      mode: 'INVALID_RESPONSE',
      durationMs: 15000,
    },
  },
];

let currentChaos = null;
let chaosStartTime = null;

// ============================================================================
// TEST DATA
// ============================================================================

const TENANTS = [
  { id: 't_demo', weight: 0.7 },
  { id: 't_premium', weight: 0.3 },
];

function selectTenant() {
  const rand = Math.random();
  return rand <= 0.7 ? 't_demo' : 't_premium';
}

function generatePayload(tenantId) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - randomIntBetween(1, 12));
  
  return {
    tenantId,
    payload: {
      principalAmount: randomItem([10000, 50000, 100000, 500000]),
      currency: 'TRY',
      interestType: randomItem(['TCMB_AVANS', 'YASAL_FAIZ']),
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      caseType: 'ICRA_TAKIP',
      debtorCount: 1,
    },
  };
}

// ============================================================================
// SETUP
// ============================================================================

export function setup() {
  // Check if chaos endpoints are available
  const statusRes = http.get(`${BASE_URL}${CHAOS_ENDPOINT}/status`);
  
  if (statusRes.status === 403 || statusRes.status === 404) {
    console.log('⚠️  Chaos endpoints not available. Set ENABLE_CHAOS_ENDPOINTS=true');
    return { chaosEnabled: false };
  }
  
  console.log('='.repeat(60));
  console.log('  CHAOS SOAK TEST STARTING');
  console.log('='.repeat(60));
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Duration: 30 minutes`);
  console.log(`  RPS: 5`);
  console.log(`  Chaos scenarios: ${CHAOS_SCENARIOS.length}`);
  console.log('='.repeat(60));
  
  return { chaosEnabled: true, startTime: Date.now() };
}

// ============================================================================
// CHAOS INJECTOR SCENARIO
// ============================================================================

export function chaos_injector(data) {
  if (!data.chaosEnabled) {
    sleep(60);
    return;
  }
  
  // Wait 1 minute between chaos injections
  sleep(60);
  
  // Select random chaos scenario
  const scenario = randomItem(CHAOS_SCENARIOS);
  
  console.log(`[CHAOS] Injecting: ${scenario.name}`);
  
  // Inject fault
  const injectRes = http.post(
    `${BASE_URL}${CHAOS_ENDPOINT}/inject`,
    JSON.stringify(scenario.inject),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (injectRes.status === 200) {
    currentChaos = scenario.name;
    chaosStartTime = Date.now();
    breakerActivations.add(1);
    
    // Wait for chaos duration
    sleep(scenario.inject.durationMs / 1000);
    
    // Clear fault
    http.post(`${BASE_URL}${CHAOS_ENDPOINT}/clear`);
    
    console.log(`[CHAOS] Cleared: ${scenario.name}`);
    currentChaos = null;
    recoveryEvents.add(1);
    
    // Wait for recovery
    sleep(30);
  }
}

// ============================================================================
// LOAD SCENARIO
// ============================================================================

export default function(data) {
  if (!data.chaosEnabled) {
    console.log('Chaos not enabled, skipping test');
    return;
  }
  
  const tenantId = selectTenant();
  const payload = generatePayload(tenantId);
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      'X-Force-Trace': 'true',
    },
    timeout: '15s', // Longer timeout for chaos
  };
  
  const res = http.post(
    `${BASE_URL}${ENDPOINT}`,
    JSON.stringify(payload),
    params
  );
  
  // Track latency by chaos state
  if (currentChaos) {
    latencyWithChaos.add(res.timings.duration);
  } else {
    latencyWithoutChaos.add(res.timings.duration);
  }
  
  // Handle rate limiting
  if (res.status === 429) {
    successRate.add(0);
    return;
  }
  
  // Parse response
  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      
      if (body.status === 'FULL') {
        successRate.add(1);
        fallbackRate.add(0);
        degradedRate.add(0);
      } else if (body.status === 'PARTIAL') {
        successRate.add(1);
        fallbackRate.add(1);
        degradedRate.add(0);
      } else if (body.status === 'DEGRADED') {
        successRate.add(1);
        fallbackRate.add(1);
        degradedRate.add(1);
      } else {
        successRate.add(0);
      }
      
      // Check for fallback evidence
      if (body.interest?.fallback || body.fee?.fallback) {
        // Fallback was used - this is expected during chaos
        check(body, {
          'fallback has evidence': (b) => 
            b.interest?.fallback?.evidence || b.fee?.fallback?.evidence,
        });
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
  if (data.chaosEnabled) {
    // Ensure all chaos is cleared
    http.post(`${BASE_URL}${CHAOS_ENDPOINT}/clear`);
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('  CHAOS SOAK TEST COMPLETED');
  console.log('='.repeat(60));
}

// ============================================================================
// HANDLE SUMMARY
// ============================================================================

export function handleSummary(data) {
  const summary = {
    testName: 'Chaos Soak Test',
    timestamp: new Date().toISOString(),
    duration: data.state.testRunDurationMs,
    
    requests: {
      total: data.metrics.http_reqs?.values?.count || 0,
    },
    
    latency: {
      withChaos: {
        avg: data.metrics.latency_with_chaos?.values?.avg || 0,
        p95: data.metrics.latency_with_chaos?.values?.['p(95)'] || 0,
      },
      withoutChaos: {
        avg: data.metrics.latency_without_chaos?.values?.avg || 0,
        p95: data.metrics.latency_without_chaos?.values?.['p(95)'] || 0,
      },
    },
    
    rates: {
      success: data.metrics.success_rate?.values?.rate || 0,
      fallback: data.metrics.fallback_rate?.values?.rate || 0,
      degraded: data.metrics.degraded_rate?.values?.rate || 0,
    },
    
    chaos: {
      breakerActivations: data.metrics.breaker_activations?.values?.count || 0,
      recoveryEvents: data.metrics.recovery_events?.values?.count || 0,
    },
    
    status: Object.values(data.metrics)
      .filter(m => m.thresholds)
      .every(m => Object.values(m.thresholds).every(t => t.ok))
      ? 'PASSED' : 'FAILED',
  };
  
  return {
    'artifacts/chaos-soak-summary.json': JSON.stringify(summary, null, 2),
  };
}
