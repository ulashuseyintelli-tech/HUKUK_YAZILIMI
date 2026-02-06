# Implementation Plan: Phase 10.2 - Manifest Retry Production Hardening

## Overview

This implementation plan follows a phased approach: data/invariants first, then core services, then admin surface, then metrics hardening, and finally tests/runbooks. Each phase builds on the previous and keeps the system shippable at every step.

**MVP Cut Line**: All non-optional tasks are required for production readiness. Property-based tests (`*`) can be deferred but are recommended for comprehensive coverage.

## Tasks

- [x] 1. Phase A: Data Layer and Invariants
  - [x] 1.1 Create database migration for manifest_admin_audit_log table
    - Create table with all columns: id, event_type, actor, request_id, ip_hash, user_agent, resource_type, resource_id, target_bundle_id, before_state, after_state, reason, created_at
    - Add indexes: created_at, actor, bundle, event_type, resource, request_id (unique)
    - Add retention policy comment (90 days hot, then archive)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.2 Create database migration for DLQ table extensions
    - Add columns: resolved_at, resolved_by, redriven_at, redriven_by
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 1.3 Implement cursor pagination utilities
    - Create encodeCursor/decodeCursor functions with (created_at, id) tuple
    - Create queryWithCursor method for repositories
    - Document stable ordering contract and concurrent modification behavior
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.4 Implement state machine transition atomicity
    - Ensure retry queue transitions use SELECT ... FOR UPDATE SKIP LOCKED
    - Ensure DLQ transitions are atomic (UPDATE + INSERT in transaction for redrive)
    - Document exactly-once-ish semantics
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [ ]* 1.5 Write property test for cursor pagination
    - **Property 1: Pagination Correctness**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [ ] 2. Phase B: Core Services
  - [ ] 2.1 Implement ManifestAdminAuditService with flood mitigation
    - Create audit event recording with all required fields
    - Implement async buffer with MAX_BUFFER_SIZE=1000
    - Implement batch flush with FLUSH_INTERVAL_MS=5000
    - Implement fallback file write on DB failure (degraded mode)
    - Hash IP addresses for PII protection (HMAC-SHA256)
    - Emit AUDIT_WRITE_FAILED metric on failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.5_
    
    **TASK 2.1 DETAILED SPEC (Copy-Paste Ready)**
    
    ```typescript
    // ============================================================================
    // FILE: manifest-admin-audit.service.ts
    // ============================================================================
    
    // --- INTERFACE ---
    interface IAuditService {
      record(event: AuditEvent): void;  // Non-blocking, returns immediately
      flush(): Promise<void>;           // Manual flush (for shutdown/tests)
      getMode(): AuditServiceMode;      // Current operational mode
    }
    
    // --- AUDIT EVENT ---
    interface AuditEvent {
      eventType: AuditEventType;
      actor: string;                    // User ID from JWT
      requestId: string;                // Idempotency key
      ipAddress: string;                // Raw IP (will be hashed)
      userAgent: string | null;
      resourceType: 'DLQ_ENTRY' | 'RETRY_JOB' | 'WORKER';
      resourceId: string;
      targetBundleId: string | null;
      beforeState: Record<string, unknown> | null;
      afterState: Record<string, unknown> | null;
      reason: string | null;
    }
    
    type AuditEventType = 
      | 'DLQ_RESOLVE'
      | 'DLQ_REDRIVE'
      | 'DLQ_BULK_REDRIVE'
      | 'WORKER_RESUME'
      | 'CB_OVERRIDE';
    
    // --- SERVICE MODE (State Machine) ---
    type AuditServiceMode = 'NORMAL' | 'DEGRADED';
    
    interface AuditServiceState {
      mode: AuditServiceMode;
      consecutiveFailures: number;
      lastFailureAt: Date | null;
      lastRecoveryCheckAt: Date | null;
    }
    
    // --- CONSTANTS ---
    const MAX_BUFFER_SIZE = 1000;
    const FLUSH_INTERVAL_MS = 5000;           // Time-based flush
    const SIZE_FLUSH_THRESHOLD = 1000;        // Size-based flush (immediate when buffer full)
    const CONSECUTIVE_FAIL_THRESHOLD = 3;     // 3 fails → DEGRADED
    const RECOVERY_CHECK_INTERVAL_MS = 30000; // Check DB health every 30s in DEGRADED
    const DEGRADED_FILE_PATH = '/var/log/hukuk/audit-degraded.jsonl';
    const DEGRADED_FILE_MAX_SIZE_MB = 100;
    const DEGRADED_FILE_ROTATION_COUNT = 5;
    
    // --- IP HASHING (KVKK Compliant) ---
    // HMAC-SHA256 with secret key for pseudonymization
    function hashIp(ip: string, secret: string): string {
      return crypto
        .createHmac('sha256', secret)
        .update(ip)
        .digest('hex')
        .substring(0, 32); // Truncate for storage efficiency
    }
    // Secret from env: AUDIT_IP_HASH_SECRET
    
    // --- STATE TRANSITIONS ---
    // NORMAL → DEGRADED: 3 consecutive DB write failures
    // DEGRADED → NORMAL: DB health check succeeds
    
    // --- DEGRADED MODE BEHAVIOR ---
    // 1. Write to file sink (JSONL format)
    // 2. Emit audit_service_degraded gauge = 1
    // 3. Emit audit_write_failed_total counter
    // 4. Every 30s: attempt DB health check
    // 5. On recovery: mode = NORMAL, consecutiveFailures = 0
    
    // --- METRICS ---
    const METRICS = {
      audit_events_buffered: Gauge,           // Current buffer size
      audit_events_flushed_total: Counter,    // Total events flushed to DB
      audit_flush_duration_seconds: Histogram,
      audit_write_failed_total: Counter,      // DB write failures
      audit_service_degraded: Gauge,          // 1 = degraded, 0 = normal
      audit_degraded_file_writes_total: Counter,
    };
    
    // --- FLUSH TRIGGERS ---
    // 1. Time-based: Every 5s (setInterval)
    // 2. Size-based: When buffer.length >= SIZE_FLUSH_THRESHOLD
    // 3. Manual: flush() called (shutdown, tests)
    
    // --- ACCEPTANCE CRITERIA ---
    // ✓ record() returns immediately (non-blocking)
    // ✓ Buffer flushed every 5s OR when 1000 items reached
    // ✓ Manual flush() available for shutdown/tests
    // ✓ 3 consecutive DB failures → DEGRADED mode
    // ✓ DEGRADED: writes to file, checks DB every 30s
    // ✓ Recovery: mode → NORMAL, consecutiveFailures = 0
    // ✓ IP addresses hashed with HMAC-SHA256
    // ✓ Metrics emitted for all state changes
    ```

  - [ ]* 2.2 Write property test for audit event completeness
    - **Property 7: Audit Event Completeness**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

  - [x] 2.3 Create database migration for manifest_worker_state table
    - Create singleton table with id='singleton' CHECK constraint
    - Add pause state columns: is_paused, pause_reason (CONSECUTIVE_ERRORS|MANUAL_PAUSE|UNKNOWN), paused_at, paused_by
    - Add error tracking columns: consecutive_errors, last_error_code, last_error_at
    - Add leader election columns: owner_instance_id, lease_expires_at
    - Add timestamps: created_at, updated_at with trigger
    - Initialize singleton row on migration
    - _Requirements: 6.8_

  - [x] 2.4 Implement ManifestRetryWorkerSafety service with leader election
    - Implement init() with singleton row creation and lease acquisition
    - Implement tryAcquireLease() with atomic UPDATE (owner_instance_id + lease_expires_at)
    - **UPDATE**: Lease query now uses DB time (now()) to avoid clock drift
    - **UPDATE**: RETURNING lease_expires_at for gauge calculation
    - Implement isLeader() check
    - Implement acquireWriteSlot with maxConcurrentWrites=1 and write queue
    - _Requirements: 6.1, 6.8_

  - [x] 2.5 Implement atomic recordSuccess/recordError operations
    - recordSuccess: atomic UPDATE consecutive_errors=0
    - recordError: atomic UPDATE with increment + conditional pause in single statement
    - **UPDATE**: updated_at also set in lease query
    - Auto-pause when consecutive_errors >= maxConsecutiveErrors (default: 10)
    - Set pause_reason='CONSECUTIVE_ERRORS' on auto-pause
    - _Requirements: 6.3, 6.9_

  - [x] 2.6 Implement pause/resume with PauseReason enum
    - Implement pause(actor, reason) for MANUAL_PAUSE
    - Implement resume(actor) with consecutive_errors reset
    - PauseReason enum: CONSECUTIVE_ERRORS, MANUAL_PAUSE, UNKNOWN
    - _Requirements: 6.4, 6.5, 6.10_

  - [x] 2.7 Implement auto-resume scheduler (CONSECUTIVE_ERRORS only)
    - checkAndAutoResume() called by worker poll loop
    - Auto-resume ONLY for pause_reason=CONSECUTIVE_ERRORS after cooloff (default: 5 min)
    - MANUAL_PAUSE NEVER auto-resumes
    - Reset consecutive_errors on auto-resume
    - _Requirements: 6.6, 6.7_

  - [x] 2.8 Implement CB-open backoff logic (memory-only)
    - Implement getCbOpenBackoffMs with progressive backoff (5s → 30s → 60s)
    - Implement resetCbBackoff on CB close
    - CB backoff index is memory-only (resets on restart - acceptable)
    - _Requirements: 6.2_

  - [ ]* 2.9 Write property test for concurrent write limiting
    - **Property 9: Concurrent Write Limiting**
    - **Validates: Requirements 6.1**

  - [ ]* 2.10 Write property test for self-pause on consecutive errors
    - **Property 11: Self-Pause on Consecutive Errors**
    - **Validates: Requirements 6.3**

  - [ ]* 2.11 Write property test for CB open backoff progression
    - **Property 10: Circuit Breaker Open Backoff Progression**
    - **Validates: Requirements 6.2**

  - [ ]* 2.12 Write property test for error counter reset on resume
    - **Property 12: Error Counter Reset on Resume**
    - **Validates: Requirements 6.5**

  - [ ]* 2.13 Write property test for auto-resume only for CONSECUTIVE_ERRORS
    - **Property 12a: Auto-Resume Only for CONSECUTIVE_ERRORS**
    - **Validates: Requirements 6.4, 6.6**

  - [ ]* 2.14 Write property test for leader election atomicity
    - **Property 12b: Leader Election Atomicity**
    - **Validates: Requirements 6.7**

- [ ] 3. Checkpoint - Core Services Complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Phase C: Admin Surface
  - [x] 4.0 Create database migration for manifest_admin_actions table (Idempotency Store)
    - **CRITICAL**: Idempotency için audit log'a güvenme! Degraded mode'da dosyaya düşebilir
    - Create table with: request_id (unique), action_type, endpoint, resource_type, resource_id, actor, result_code, result_json, expires_at
    - Add indexes: request_id (unique), resource, expires_at, actor
    - TTL: 7 days default
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 4.1 Implement ManifestAdminAuthGuard
    - Check break-glass feature flag state (per endpoint family: read/write/bulk)
    - Check ops_admin role in JWT claims
    - Return 403 when break-glass closed (code: BREAK_GLASS_CLOSED)
    - Return 401 when unauthorized
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 4.2 Write property test for authorization enforcement
    - **Property 6: Authorization Enforcement**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [x] 4.3 Implement ManifestAdminRateLimiter service
    - Implement per-actor rate limiting with sliding window
    - Configure 10 req/min for standard endpoints
    - Configure 1 req/min for bulk operations
    - Return remaining count and resetAt
    - Emit rate_limit_exceeded metric on block
    - Response format: { code, rate_limit_type, retry_after_seconds }
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 10.1_

  - [ ]* 4.4 Write property test for rate limiting enforcement
    - **Property 8: Rate Limiting Enforcement**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [ ] 4.5 Enhance ManifestAdminController with read endpoints
    - [x] Implement GET /admin/manifest-retry/dlq with cursor pagination
    - [x] Implement GET /admin/manifest-retry/jobs with cursor pagination
    - [x] Apply auth guard and rate limiter
    - [x] Add INVALID_CURSOR error handling (400)
    - [x] Add status allowlist validation
    - [x] Add limit clamping (max 200, silent clamp)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 4.6 Implement idempotency layer for admin mutations
    - **UPDATED**: Use manifest_admin_actions table (NOT audit log!)
    - Use requestId as idempotency key
    - Check actions table for existing requestId before execution
    - Return cached result_json if requestId exists
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 4.7 Enhance ManifestAdminController with mutation endpoints
    - Implement POST /admin/manifest-retry/dlq/:id/resolve with audit
    - Implement POST /admin/manifest-retry/dlq/:id/redrive with mode support (now/scheduled)
    - **UPDATED**: Use 409 Conflict for state transition errors (not 400)
    - Apply idempotency layer
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [ ]* 4.8 Write property test for DLQ resolve state transition
    - **Property 2: DLQ Resolve State Transition**
    - **Validates: Requirements 2.1**

  - [ ]* 4.9 Write property test for DLQ redrive enqueuing
    - **Property 3: DLQ Redrive Enqueuing**
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 4.10 Write property test for resolved entry rejection
    - **Property 5: Resolved Entry Rejection**
    - **Validates: Requirements 2.6**

  - [ ] 4.11 Implement bulk redrive endpoint with audit semantics
    - Implement POST /admin/manifest-retry/dlq/redrive-bulk
    - Enforce maxBatch <= 100 validation
    - **Audit semantics**: Record single bulk audit event with count and filter criteria (not per-item)
    - Include list of affected bundleIds in audit event
    - _Requirements: 2.4, 2.5_

  - [ ]* 4.12 Write property test for bulk redrive batch limit
    - **Property 4: Bulk Redrive Batch Limit**
    - **Validates: Requirements 2.4, 2.5**

  - [ ] 4.13 Implement worker resume endpoint
    - Implement POST /admin/manifest-retry/worker/resume
    - **UPDATED**: Record WORKER_RESUME audit event (NOT CB_OVERRIDE - ayrı endpoint)
    - _Requirements: 6.4_

  - [ ] 4.14 Implement worker pause endpoint
    - Implement POST /admin/manifest-retry/worker/pause
    - Record WORKER_PAUSE audit event
    - _Requirements: 6.4_

- [ ] 5. Checkpoint - Admin Surface Complete
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 6. Phase D: Metrics Hardening
  - [ ] 6.1 Implement ManifestMetricsGuard service
    - Implement validateLabels with ALLOWED_LABELS allowlist
    - Implement dirty-flag caching with markDirty()
    - Implement TTL fallback with scrapeIntervalMs=15000
    - **Failure mode**: Drop offending series, emit metrics_guard_violations_total, return 200
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 10.3_

  - [ ]* 6.2 Write property test for label allowlist enforcement
    - **Property 13: Label Allowlist Enforcement**
    - **Validates: Requirements 7.2, 7.3**

  - [ ]* 6.3 Write property test for metrics cache dirty-flag
    - **Property 14: Metrics Cache Dirty-Flag**
    - **Validates: Requirements 7.4, 7.5, 7.6**

  - [x] 6.4 Add worker pause metrics
    - Add manifest_retry_worker_paused gauge with reason label
    - Add manifest_retry_worker_consecutive_errors gauge
    - **ADDED**: manifest_retry_worker_lease_expires_in_seconds gauge (ops değeri yüksek)
    - _Requirements: 6.3_

  - [ ] 6.5 Integrate ManifestMetricsGuard with existing metrics endpoint
    - Replace direct toPrometheusText() calls with guarded version
    - _Requirements: 7.1_

- [ ] 7. Checkpoint - Metrics Hardening Complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Phase E: Integration Tests and Ops Readiness
  - [ ] 8.1 Write integration test for DLQ resolve/redrive happy path
    - Create DLQ entry → Resolve → Verify state and audit
    - Create DLQ entry → Redrive (now) → Verify job created with immediate scheduling
    - Create DLQ entry → Redrive (scheduled) → Verify job created with backoff
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 8.2 Write integration test for bulk redrive with maxBatch=100
    - Create 150 DLQ entries → Bulk redrive with maxBatch=100 → Verify only 100 redriven
    - Verify single bulk audit event with count=100
    - _Requirements: 2.4, 2.5_

  - [ ] 8.3 Write integration test for S3 timeout classification
    - Simulate S3 timeout → Verify classified as RETRY
    - Verify job scheduled with backoff
    - _Requirements: 10.2_

  - [ ] 8.4 Write integration test for authorization flow
    - Test break-glass closed → 403
    - Test missing role → 401
    - Test valid auth → success
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 8.5 Write integration test for rate limiting
    - Send 11 requests → Verify 11th returns 429
    - Verify Retry-After header present
    - _Requirements: 5.1, 5.3_

  - [ ]* 8.6 Write property test for DLQ flood backpressure
    - **Property 15: DLQ Flood Backpressure**
    - **Validates: Requirements 10.2**

  - [ ] 8.7 Create runbook documentation (skeleton)
    - Create DLQ rising procedure: symptoms, investigation steps, remediation
    - Create CB stuck open procedure: symptoms, investigation steps, remediation
    - Create S3 timeout / access denied procedure: symptoms, investigation steps, remediation
    - Create admin abuse suspected procedure: symptoms, investigation steps, remediation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 8.8 Create SLO configuration file
    - Define dlq_volume SLO (< 5 at p95)
    - Define dlq_age SLO (< 3600s at p95)
    - Define job_success_rate SLO (> 99% rolling 30m)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 8.9 Create alert rules for SLOs
    - Alert on DLQ size > 5
    - Alert on DLQ oldest age > 3600s
    - Alert on job success rate < 99%
    - Alert on worker paused
    - Alert on CB open > 5 minutes
    - _Requirements: 9.1, 9.2, 9.3_

- [ ] 9. Final Checkpoint - All Tests Pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests that can be skipped for faster MVP
- All non-optional tasks are REQUIRED for production readiness
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Integration tests validate end-to-end flows

## Key Design Decisions Embedded in Tasks

1. **Pause state persistence**: DB flag (survives restart) - Task 2.4
2. **Audit flood mitigation**: Degraded mode (allow action, emit metric) - Task 2.1
3. **Bulk redrive audit**: Single bulk event with count (not per-item) - Task 4.11
4. **Metrics failure mode**: Drop series, emit counter, return 200 - Task 6.1
