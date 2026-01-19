# Design Document: Sprint 9A Redis Migration

## Overview

Sprint 9A migrates the Operational Layer from in-memory storage to Redis. This layer handles ephemeral state that affects system availability: rate limits, concurrent tracking, and incident locks. The migration preserves the existing interface while adding Redis as the primary backend with in-memory fallback.

### Risk Profile

**System Availability** - Wrong implementation means the system cannot make decisions about whether to allow or reject operations. This is the lowest-risk layer because:
1. State is ephemeral and can be reconstructed
2. Fallback to in-memory is acceptable (temporary over-admission)
3. No legal/audit implications

### Migration Strategy

1. Implement Redis adapter with same interface as in-memory
2. Add connection pooling and failover handling
3. Run existing tests against both backends
4. Deploy with feature flag, fallback enabled
5. Monitor metrics, disable fallback when stable

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                  SimulationRateLimitGuard                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  IRateLimitStore                         │   │
│  │  (Interface - same as current in-memory)                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│              ┌─────────────┴─────────────┐                     │
│              ▼                           ▼                      │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ RedisRateLimitStore │    │InMemoryRateLimitStore│           │
│  │ (Primary)           │    │(Fallback)            │           │
│  └──────────┬──────────┘    └─────────────────────┘            │
│             │                           ▲                       │
│             │                           │                       │
│  ┌──────────▼──────────┐    ┌──────────┴──────────┐            │
│  │  ConnectionPool     │    │  FailoverHandler    │            │
│  │  (5-20 connections) │    │  (Circuit Breaker)  │            │
│  └──────────┬──────────┘    └─────────────────────┘            │
│             │                                                   │
└─────────────┼───────────────────────────────────────────────────┘
              │
              ▼
         ┌─────────┐
         │  Redis  │
         └─────────┘
```

### State Machine: Failover Handler

```
                    ┌─────────────┐
                    │   HEALTHY   │
                    │ (Use Redis) │
                    └──────┬──────┘
                           │
                    Connection Failure
                           │
                           ▼
                    ┌─────────────┐
                    │  DEGRADED   │◄────────────────┐
                    │(Use Memory) │                 │
                    └──────┬──────┘                 │
                           │                        │
                    3 consecutive                   │
                    failures                   Reconnect
                           │                   Success
                           ▼                        │
                    ┌─────────────┐                 │
                    │   CIRCUIT   │─────────────────┘
                    │    OPEN     │
                    │ (30s timer) │
                    └─────────────┘
```

## Components and Interfaces

### IRateLimitStore Interface

```typescript
/**
 * Rate limit store interface - same as current in-memory implementation
 * Both Redis and in-memory adapters implement this interface
 */
interface IRateLimitStore {
  // Per-incident rate limiting
  incrementIncidentCounter(
    tenantId: string,
    incidentId: string,
    ttlSec: number,
  ): Promise<{ count: number; ttlRemaining: number }>;
  
  getIncidentCounter(
    tenantId: string,
    incidentId: string,
  ): Promise<{ count: number; ttlRemaining: number } | null>;

  // Concurrent tracking
  addToConcurrentSet(tenantId: string, runId: string, ttlSec: number): Promise<void>;
  removeFromConcurrentSet(tenantId: string, runId: string): Promise<void>;
  getConcurrentCount(tenantId: string): Promise<number>;

  // Daily counters
  incrementDailyCounter(tenantId: string, date: string): Promise<number>;
  getDailyCounter(tenantId: string, date: string): Promise<number>;

  // Incident locks
  acquireIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
    ttlSec: number,
  ): Promise<{ acquired: boolean; existingRunId?: string }>;
  releaseIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
  ): Promise<boolean>;
}
```

### RedisRateLimitStore Implementation

```typescript
@Injectable()
class RedisRateLimitStore implements IRateLimitStore {
  constructor(
    private readonly redis: RedisClient,
    private readonly clock: IClock,
    private readonly metrics: IMetricsEmitter,
  ) {}

  async incrementIncidentCounter(
    tenantId: string,
    incidentId: string,
    ttlSec: number,
  ): Promise<{ count: number; ttlRemaining: number }> {
    const key = `rate:incident:${tenantId}:${incidentId}`;
    const start = this.clock.nowMs();
    
    try {
      // Atomic INCR + EXPIRE
      const multi = this.redis.multi();
      multi.incr(key);
      multi.expire(key, ttlSec);
      multi.ttl(key);
      
      const [count, , ttlRemaining] = await multi.exec();
      
      this.metrics.histogram('redis.operation.latency', this.clock.nowMs() - start, {
        operation: 'incrementIncidentCounter',
      });
      
      return { count: count as number, ttlRemaining: ttlRemaining as number };
    } catch (error) {
      this.metrics.counter('redis.operation.error', 1, {
        operation: 'incrementIncidentCounter',
      });
      throw error;
    }
  }

  async addToConcurrentSet(
    tenantId: string,
    runId: string,
    ttlSec: number,
  ): Promise<void> {
    // Use sorted set with score = expiry timestamp for automatic cleanup
    const key = `rate:concurrent:${tenantId}`;
    const expiresAt = this.clock.nowMs() + (ttlSec * 1000);
    
    await this.redis.zadd(key, expiresAt, runId);
    
    // Cleanup expired entries
    await this.redis.zremrangebyscore(key, '-inf', this.clock.nowMs());
  }

  async getConcurrentCount(tenantId: string): Promise<number> {
    const key = `rate:concurrent:${tenantId}`;
    
    // First cleanup expired
    await this.redis.zremrangebyscore(key, '-inf', this.clock.nowMs());
    
    // Then count
    return await this.redis.zcard(key);
  }

  async acquireIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
    ttlSec: number,
  ): Promise<{ acquired: boolean; existingRunId?: string }> {
    const key = `lock:incident:${tenantId}:${incidentId}`;
    
    // SET NX EX - atomic acquire
    const result = await this.redis.set(key, runId, 'NX', 'EX', ttlSec);
    
    if (result === 'OK') {
      return { acquired: true };
    }
    
    // Lock exists - get existing runId
    const existingRunId = await this.redis.get(key);
    return { acquired: false, existingRunId: existingRunId || undefined };
  }

  async releaseIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
  ): Promise<boolean> {
    const key = `lock:incident:${tenantId}:${incidentId}`;
    
    // Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    const result = await this.redis.eval(script, 1, key, runId);
    return result === 1;
  }
}
```

### FailoverHandler Implementation

```typescript
interface FailoverState {
  status: 'HEALTHY' | 'DEGRADED' | 'CIRCUIT_OPEN';
  consecutiveFailures: number;
  lastFailureAt?: number;
  circuitOpenUntil?: number;
}

@Injectable()
class FailoverHandler {
  private state: FailoverState = {
    status: 'HEALTHY',
    consecutiveFailures: 0,
  };

  private readonly CIRCUIT_OPEN_DURATION_MS = 30_000;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly RECONNECT_INTERVAL_MS = 5_000;

  constructor(
    private readonly redisStore: RedisRateLimitStore,
    private readonly memoryStore: InMemoryRateLimitStore,
    private readonly clock: IClock,
    private readonly metrics: IMetricsEmitter,
    private readonly logger: Logger,
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
  ): Promise<T> {
    // Check circuit breaker
    if (this.state.status === 'CIRCUIT_OPEN') {
      if (this.clock.nowMs() < this.state.circuitOpenUntil!) {
        this.logger.warn('[Failover] Circuit open, using fallback');
        return fallbackOperation();
      }
      // Circuit timeout expired, try Redis again
      this.state.status = 'DEGRADED';
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      return this.onFailure(error, fallbackOperation);
    }
  }

  private onSuccess(): void {
    if (this.state.status !== 'HEALTHY') {
      this.logger.log('[Failover] Redis connection restored');
      this.metrics.counter('redis.failover.recovered', 1);
    }
    this.state = { status: 'HEALTHY', consecutiveFailures: 0 };
  }

  private async onFailure<T>(
    error: Error,
    fallbackOperation: () => Promise<T>,
  ): Promise<T> {
    this.state.consecutiveFailures++;
    this.state.lastFailureAt = this.clock.nowMs();
    
    this.metrics.counter('redis.connection.failure', 1);
    this.logger.warn('[Failover] Redis operation failed', { error: error.message });

    if (this.state.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      this.state.status = 'CIRCUIT_OPEN';
      this.state.circuitOpenUntil = this.clock.nowMs() + this.CIRCUIT_OPEN_DURATION_MS;
      
      this.metrics.counter('redis.circuit_breaker.opened', 1);
      this.logger.error('[Failover] Circuit breaker opened');
    } else {
      this.state.status = 'DEGRADED';
    }

    this.metrics.counter('redis.failover.activated', 1);
    return fallbackOperation();
  }

  getState(): FailoverState {
    return { ...this.state };
  }
}
```

### ConnectionPool Configuration

```typescript
interface RedisPoolConfig {
  minConnections: number;      // Default: 5
  maxConnections: number;      // Default: 20
  idleTimeoutMs: number;       // Default: 30_000
  acquireTimeoutMs: number;    // Default: 100
  healthCheckIntervalMs: number; // Default: 10_000
}

const defaultPoolConfig: RedisPoolConfig = {
  minConnections: 5,
  maxConnections: 20,
  idleTimeoutMs: 30_000,
  acquireTimeoutMs: 100,
  healthCheckIntervalMs: 10_000,
};
```

## Data Models

### Redis Key Schema

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `rate:incident:{tenantId}:{incidentId}` | String (counter) | 60s | Per-incident rate limit |
| `rate:concurrent:{tenantId}` | Sorted Set | None | Active runs (score = expiry) |
| `rate:daily:{tenantId}:{YYYY-MM-DD}` | String (counter) | 25h | Daily limit |
| `lock:incident:{tenantId}:{incidentId}` | String (runId) | 5m | Incident lock |

### Metrics Schema

```typescript
interface RedisMetrics {
  // Latency histogram (ms)
  'redis.operation.latency': {
    operation: string;
    status: 'success' | 'error';
  };
  
  // Error counter
  'redis.operation.error': {
    operation: string;
    errorType: string;
  };
  
  // Connection pool gauge
  'redis.pool.size': {
    state: 'active' | 'idle' | 'waiting';
  };
  
  // Failover counters
  'redis.failover.activated': {};
  'redis.failover.recovered': {};
  'redis.circuit_breaker.opened': {};
  'redis.circuit_breaker.closed': {};
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Per-Incident Rate Limit Lifecycle

*For any* tenant and incident, incrementing the counter N times within TTL window shall result in counter value N, and after TTL expires, the counter shall reset to allow new increments starting from 1.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

### Property 2: Concurrent Tracking Lifecycle

*For any* tenant, adding a runId to the concurrent set and then removing it shall result in the same concurrent count as before the add, and entries that expire without explicit removal shall be automatically cleaned up.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

### Property 3: Daily Counter Lifecycle

*For any* tenant, the daily counter shall increment correctly within a UTC day, use a new key when the day changes, and automatically expire after 25 hours.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 4: Incident Lock Lifecycle

*For any* tenant and incident, acquiring a lock shall succeed only if no lock exists, releasing a lock shall only succeed if the runId matches, and expired locks shall automatically allow new acquisitions.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

### Property 5: Connection Pool Scaling

*For any* load pattern, the connection pool shall maintain at least minConnections, scale up to maxConnections under load, close idle connections after timeout, and queue requests when all connections are busy.

**Validates: Requirements 5.2, 5.3, 5.4, 5.5**

### Property 6: Failover State Machine

*For any* sequence of Redis connection successes and failures, the failover handler shall transition through states correctly: HEALTHY → DEGRADED (on failure) → CIRCUIT_OPEN (after 3 failures) → DEGRADED (after 30s) → HEALTHY (on success).

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**

### Property 7: Metrics Emission

*For any* Redis operation, the adapter shall emit latency histogram on completion and error counter on failure, and failover activations shall be counted.

**Validates: Requirements 7.1, 7.2, 7.4**

### Property 8: Test Compatibility

*For any* test in the existing `simulation-rate-limit.guard.spec.ts` suite, the test shall pass when run against the Redis adapter with mock Redis client.

**Validates: Requirements 8.3**

## Error Handling

### Redis Operation Errors

| Error Type | Detection | Response |
|------------|-----------|----------|
| Connection timeout | Socket timeout | Failover to memory |
| Command timeout | Operation timeout | Failover to memory |
| Connection refused | ECONNREFUSED | Failover to memory |
| Auth failure | NOAUTH | Log error, fail startup |
| OOM | OOM error | Failover to memory |

### Failover Behavior

```typescript
// Pseudo-code for error handling
async function handleRedisError(error: Error): Promise<void> {
  if (isConnectionError(error)) {
    failoverHandler.recordFailure();
    return; // Use fallback
  }
  
  if (isAuthError(error)) {
    logger.error('Redis auth failed - check configuration');
    throw error; // Don't fallback on auth errors
  }
  
  if (isOOMError(error)) {
    metrics.counter('redis.oom', 1);
    failoverHandler.recordFailure();
    return; // Use fallback
  }
  
  // Unknown error - log and fallback
  logger.warn('Unknown Redis error', { error });
  failoverHandler.recordFailure();
}
```

## Testing Strategy

### Test Categories

1. **Unit Tests**: Redis adapter methods with mock Redis client
2. **Integration Tests**: Redis adapter with real Redis (containerized)
3. **Failover Tests**: State machine transitions and recovery
4. **Property Tests**: Universal properties across all inputs
5. **Compatibility Tests**: Existing tests against Redis backend

### Dual Backend Test Pattern

```typescript
describe.each([
  ['in-memory', () => new InMemoryRateLimitStore(mockClock)],
  ['redis', () => new RedisRateLimitStore(mockRedis, mockClock, mockMetrics)],
])('Rate Limit Store (%s)', (name, createStore) => {
  let store: IRateLimitStore;

  beforeEach(() => {
    store = createStore();
  });

  it('should increment incident counter atomically', async () => {
    const result1 = await store.incrementIncidentCounter('t1', 'i1', 60);
    const result2 = await store.incrementIncidentCounter('t1', 'i1', 60);
    
    expect(result1.count).toBe(1);
    expect(result2.count).toBe(2);
  });

  // ... more tests
});
```

### Property-Based Test Configuration

- Library: fast-check
- Minimum iterations: 100 per property
- Shrinking: enabled
- Seed: deterministic for CI reproducibility

### Test Environment

| Environment | Redis Backend |
|-------------|---------------|
| Unit tests | ioredis-mock |
| Integration | Docker Redis |
| CI | Docker Redis |
| Staging | AWS ElastiCache |
| Production | AWS ElastiCache |


## Final Polish (v1.0.0)

This section documents the final refinements made before locking Phase 9A.

### State Machine Invariants

The following invariants must hold at all times:

```typescript
// INVARIANT 1: circuitOpenUntil only valid in CIRCUIT_OPEN state
if (state !== 'CIRCUIT_OPEN') {
  assert(circuitOpenUntil === undefined);
}

// INVARIANT 2: consecutiveFailures reset on state transitions
// When transitioning CIRCUIT_OPEN → DEGRADED (timeout expired):
//   - consecutiveFailures = 0 (fresh start for half-open)
//   - circuitOpenUntil = undefined (no longer relevant)
```

### Graceful Shutdown

Both `FailoverHandler` and `RedisRateLimitStore` implement `OnModuleDestroy`:

```typescript
// FailoverHandler
async onModuleDestroy(): Promise<void> {
  this.stopReconnectTimer(); // Prevent timer leaks
}

// RedisRateLimitStore
async onModuleDestroy(): Promise<void> {
  await this.redis.quit(); // Graceful connection close
}
```

This prevents:
- Timer leaks from reconnect intervals
- Connection leaks from Redis client
- Hanging processes during shutdown

### Deployment Scenarios

| Scenario | `REDIS_ENABLED` | Redis Status | Behavior |
|----------|-----------------|--------------|----------|
| Disabled | `false` | N/A | In-memory only, no Redis providers |
| Enabled + Healthy | `true` | Up | Redis primary, failover ready |
| Enabled + Down | `true` | Down | Failover to in-memory, auto-recover |

### Test Coverage Summary

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `failover-handler.spec.ts` | 11 | State machine, fallback, health |
| `rate-limit-store.property.spec.ts` | 11 | All 8 properties |
| `simulation-rate-limit.guard.spec.ts` | 19 | Guard integration |

### Lock Reference

See `PHASE-9A-LOCK.md` for:
- What is locked vs. allowed to change
- Version bump rules (patch/minor/major)
- Breaking the lock procedure
