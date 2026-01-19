# Requirements Document

## Introduction

Sprint 9A migrates the Operational Layer from in-memory storage to Redis. This layer handles ephemeral state that affects system availability: rate limits, concurrent tracking, and incident locks. The risk profile is system availability - wrong implementation means the system cannot make decisions about whether to allow or reject operations.

Current in-memory implementations to migrate:
- `SimulationRateLimitGuard`: Per-incident counters (INCR + TTL), concurrent sets (SADD/SREM/SCARD), daily counters, incident locks
- Connection pooling and failover handling for production reliability

## Glossary

- **Redis_Adapter**: The Redis-backed implementation of rate limit storage
- **Rate_Limit_Store**: Interface for storing and querying rate limit state
- **Concurrent_Tracker**: Component tracking active simulation runs per tenant
- **Incident_Lock**: Mutex preventing duplicate simulations on same incident
- **Connection_Pool**: Managed pool of Redis connections for efficiency
- **Failover_Handler**: Component managing Redis connection failures and recovery
- **Circuit_Breaker**: Pattern preventing cascade failures during Redis outages

## Requirements

### Requirement 1: Rate Limit State Migration

**User Story:** As a system operator, I want rate limit state stored in Redis, so that rate limits work correctly across multiple API instances.

#### Acceptance Criteria

1. WHEN a simulation request arrives, THE Redis_Adapter SHALL check per-incident counter using Redis INCR with TTL=60s
2. WHEN per-incident counter exceeds 1, THE Redis_Adapter SHALL return 429 Too Many Requests
3. WHEN TTL expires on per-incident counter, THE Redis_Adapter SHALL allow new simulation for that incident
4. THE Redis_Adapter SHALL use atomic INCR operation to prevent race conditions between instances
5. WHEN Redis key does not exist, THE Redis_Adapter SHALL create it with initial value 1 and TTL in single atomic operation

### Requirement 2: Concurrent Tracking Migration

**User Story:** As a system operator, I want concurrent simulation tracking in Redis, so that tenant concurrency limits work across multiple API instances.

#### Acceptance Criteria

1. WHEN a simulation starts, THE Concurrent_Tracker SHALL add runId to tenant's concurrent set using Redis SADD
2. WHEN a simulation completes, THE Concurrent_Tracker SHALL remove runId from tenant's concurrent set using Redis SREM
3. WHEN checking concurrent limit, THE Concurrent_Tracker SHALL use Redis SCARD to count active runs
4. IF SCARD returns value >= 5, THEN THE Concurrent_Tracker SHALL reject new simulation with 429
5. THE Concurrent_Tracker SHALL use Redis SET with expiry for run entries to handle crash recovery
6. WHEN run entry expires without explicit SREM, THE Concurrent_Tracker SHALL automatically release the slot

### Requirement 3: Daily Counter Migration

**User Story:** As a system operator, I want daily simulation counters in Redis, so that daily limits work correctly across multiple API instances.

#### Acceptance Criteria

1. WHEN a simulation starts, THE Redis_Adapter SHALL increment daily counter using Redis INCR
2. THE Redis_Adapter SHALL use UTC date string in key format: `rate:daily:{tenantId}:{YYYY-MM-DD}`
3. WHEN daily counter exceeds 100, THE Redis_Adapter SHALL reject new simulation with 429
4. THE Redis_Adapter SHALL set TTL of 25 hours on daily counter keys for automatic cleanup
5. WHEN UTC day changes, THE Redis_Adapter SHALL use new key automatically

### Requirement 4: Incident Lock Migration

**User Story:** As a system operator, I want incident locks in Redis, so that duplicate simulation prevention works across multiple API instances.

#### Acceptance Criteria

1. WHEN acquiring incident lock, THE Incident_Lock SHALL use Redis SET with NX (only if not exists) and EX (expiry)
2. IF SET NX returns nil, THEN THE Incident_Lock SHALL return 409 Conflict with existing runId
3. WHEN simulation completes, THE Incident_Lock SHALL release lock using Redis DEL with value verification
4. THE Incident_Lock SHALL set lock expiry to 5 minutes for crash recovery
5. WHEN lock expires without explicit release, THE Incident_Lock SHALL allow new simulation

### Requirement 5: Connection Pooling

**User Story:** As a system operator, I want Redis connection pooling, so that the system handles high load efficiently.

#### Acceptance Criteria

1. THE Connection_Pool SHALL maintain minimum 5 connections to Redis
2. THE Connection_Pool SHALL scale up to maximum 20 connections under load
3. WHEN connection is idle for 30 seconds, THE Connection_Pool SHALL close it
4. THE Connection_Pool SHALL validate connections before use with PING command
5. WHEN all connections are busy, THE Connection_Pool SHALL queue requests with 100ms timeout

### Requirement 6: Failover Handling

**User Story:** As a system operator, I want graceful failover when Redis is unavailable, so that the system remains available in degraded mode.

#### Acceptance Criteria

1. WHEN Redis connection fails, THE Failover_Handler SHALL activate in-memory fallback within 100ms
2. WHILE in fallback mode, THE Failover_Handler SHALL log warning on each rate limit check
3. THE Failover_Handler SHALL attempt Redis reconnection every 5 seconds
4. WHEN Redis connection is restored, THE Failover_Handler SHALL switch back to Redis within 1 second
5. IF Redis fails 3 consecutive times, THEN THE Failover_Handler SHALL activate Circuit_Breaker for 30 seconds
6. WHILE Circuit_Breaker is open, THE Failover_Handler SHALL use in-memory without attempting Redis

### Requirement 7: Metrics and Observability

**User Story:** As a system operator, I want metrics for Redis operations, so that I can monitor rate limit system health.

#### Acceptance Criteria

1. THE Redis_Adapter SHALL emit latency histogram for all Redis operations
2. THE Redis_Adapter SHALL emit counter for Redis connection failures
3. THE Redis_Adapter SHALL emit gauge for current connection pool size
4. THE Redis_Adapter SHALL emit counter for fallback mode activations
5. WHEN Circuit_Breaker state changes, THE Redis_Adapter SHALL emit event with state and reason

### Requirement 8: Test Compatibility

**User Story:** As a developer, I want existing rate limit tests to pass with Redis backend, so that I can verify the migration is correct.

#### Acceptance Criteria

1. THE Redis_Adapter SHALL implement same interface as current in-memory implementation
2. WHEN running tests, THE Redis_Adapter SHALL support mock Redis client injection
3. THE Redis_Adapter SHALL pass all existing `simulation-rate-limit.guard.spec.ts` tests
4. THE Redis_Adapter SHALL support deterministic clock injection for time-based tests
5. WHEN test environment is detected, THE Redis_Adapter SHALL use in-memory Redis mock by default
