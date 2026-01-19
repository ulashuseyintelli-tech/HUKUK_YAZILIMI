# Phase 9A Redis Migration - LOCKED

**Lock Date**: 2026-01-18
**Lock Version**: v1.0.0
**Lock Owner**: Phase 9 Sprint Team

---

## Lock Status

🔒 **LOCKED** - This phase is feature-complete and locked for production stability.

---

## What is Locked

The following components are locked and must not receive breaking changes:

### Core Contracts
- `IRateLimitStore` interface - method signatures frozen
- `IRateLimitMetrics` interface - method signatures frozen
- `FailoverStatus` type - field names and types frozen
- `FailoverState` type - enum values frozen

### Implementations
- `RedisRateLimitStore` - Redis key schema frozen
- `InMemoryRateLimitStore` - behavior contract frozen
- `FailoverHandler` - state machine transitions frozen

### State Machine Invariants
```
HEALTHY → DEGRADED (on failure)
DEGRADED → HEALTHY (on success)
DEGRADED → CIRCUIT_OPEN (after 3 consecutive failures)
CIRCUIT_OPEN → DEGRADED (after 30s timeout)
CIRCUIT_OPEN → HEALTHY (timeout + success)

INVARIANT: state !== 'CIRCUIT_OPEN' => circuitOpenUntil === undefined
```

### Redis Key Schema
| Key Pattern | Type | TTL |
|-------------|------|-----|
| `rate:incident:{tenantId}:{incidentId}` | String | 60s |
| `rate:concurrent:{tenantId}` | Sorted Set | - |
| `rate:daily:{tenantId}:{YYYY-MM-DD}` | String | 25h |
| `lock:incident:{tenantId}:{incidentId}` | String | 5m |

---

## What is NOT Locked

The following can be modified with appropriate review:

### Allowed Changes (Patch - v1.0.x)
- Bug fixes that don't change behavior
- Log message improvements
- Internal refactoring (no interface changes)
- Test additions/improvements
- Documentation updates

### Allowed Changes (Minor - v1.x.0)
- New optional fields in status objects
- New metrics (additive only)
- Performance optimizations
- New helper methods (internal)

### Forbidden Changes (Major - v2.0.0)
- ❌ Changing `IRateLimitStore` method signatures
- ❌ Changing Redis key schema
- ❌ Changing state machine transitions
- ❌ Removing existing metrics
- ❌ Changing failover thresholds without ops approval

---

## Deployment Configuration

### Environment Variables
```bash
# Required for Redis mode
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<secret>
REDIS_KEY_PREFIX=sim:

# Optional
REDIS_TLS_ENABLED=false
REDIS_CONNECT_TIMEOUT_MS=5000
```

### Operational Scenarios

#### Scenario 1: Redis Disabled (Design Choice)
```bash
REDIS_ENABLED=false
```
- System uses in-memory store by design
- No Redis providers registered
- Suitable for development/testing

#### Scenario 2: Redis Enabled + Healthy
```bash
REDIS_ENABLED=true
```
- System uses Redis as primary
- FailoverHandler in HEALTHY state
- Full distributed rate limiting

#### Scenario 3: Redis Enabled + Down
```bash
REDIS_ENABLED=true
# But Redis is unreachable
```
- FailoverHandler activates
- Falls back to in-memory
- Logs warnings, emits metrics
- Auto-recovers when Redis returns

---

## Verification Checklist

Before any deployment, verify:

- [ ] All 11 failover-handler tests pass
- [ ] All 11 rate-limit-store property tests pass
- [ ] All 19 simulation-rate-limit.guard tests pass
- [ ] Graceful shutdown works (no connection leaks)
- [ ] Metrics are emitting correctly

---

## Breaking the Lock

To break this lock (create v2.0.0):

1. Create RFC document explaining why
2. Get approval from:
   - Tech Lead
   - Ops Team
   - Product Owner
3. Create new spec: `phase-9a-v2-migration`
4. Implement with full test coverage
5. Run parallel deployment for 1 week
6. Archive this lock file

---

## Files Covered by Lock

```
redis/
├── failover-handler.ts          # State machine + failover
├── in-memory-rate-limit-store.ts # Fallback implementation
├── rate-limit-metrics.ts        # Metrics interfaces
├── rate-limit-store.interface.ts # Core contract
├── redis-config.ts              # Configuration
├── redis-rate-limit-store.ts    # Redis implementation
└── index.ts                     # Public exports

__tests__/
├── failover-handler.spec.ts     # 11 tests
├── rate-limit-store.property.spec.ts # 11 tests
└── simulation-rate-limit.guard.spec.ts # 19 tests

guards/
└── simulation-rate-limit.guard.ts # Consumer
```

---

## Contact

For questions about this lock:
- Phase 9 Sprint Team
- #phase-9-redis channel

---

*This lock ensures Phase 9A remains stable while Phase 9B (PostgreSQL) and Phase 9C (S3) are developed.*
