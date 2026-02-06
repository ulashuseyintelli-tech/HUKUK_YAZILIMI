# Requirements Document

## Introduction

Phase 10.2 - Manifest Retry Production Hardening builds upon the existing Phase 10 Manifest Retry System to make it production-ready. This phase focuses on controllability, security, auditability, rate limiting, operational safety, and metrics hardening. The goal is to ensure the retry system can operate safely under adversarial conditions and provide full operational visibility.

## Glossary

- **Admin_Controller**: The NestJS controller providing administrative endpoints for manifest retry queue and DLQ management
- **Audit_Service**: Service responsible for recording all administrative actions with actor, timestamp, and context information
- **Break_Glass**: Emergency access mechanism that is normally closed but can be opened for emergency operations
- **Circuit_Breaker**: Pattern that prevents cascading failures by stopping operations when error threshold is reached
- **DLQ**: Dead Letter Queue - storage for permanently failed manifest write jobs
- **Feature_Flag**: Runtime toggle to enable/disable system features without deployment
- **Metrics_Guard**: Runtime validation layer that prevents metrics label explosion and controls scrape cost
- **Rate_Limiter**: Component that restricts request frequency per actor to prevent abuse
- **Redrive**: Operation to move a DLQ entry back to the retry queue for another attempt
- **Runbook**: Operational procedure document for handling specific incidents
- **SLO**: Service Level Objective - measurable target for system behavior
- **Worker**: Background process that processes retry queue jobs

## Requirements

### Requirement 1: Admin API Query Endpoints

**User Story:** As an operations administrator, I want to query retry jobs and DLQ entries with pagination, so that I can monitor system health and investigate issues.

#### Acceptance Criteria

1. WHEN an admin requests GET /admin/manifest-retry/jobs with status, limit, and cursor parameters, THE Admin_Controller SHALL return paginated job entries matching the filter criteria
2. WHEN an admin requests GET /admin/manifest-retry/dlq with status, limit, and cursor parameters, THE Admin_Controller SHALL return paginated DLQ entries matching the filter criteria
3. WHEN pagination cursor is provided, THE Admin_Controller SHALL return the next page of results starting from the cursor position
4. WHEN no entries match the filter criteria, THE Admin_Controller SHALL return an empty list with total count of zero

### Requirement 2: Admin API DLQ Resolution Endpoints

**User Story:** As an operations administrator, I want to resolve and redrive DLQ entries, so that I can recover from failures and clear resolved issues.

#### Acceptance Criteria

1. WHEN an admin requests POST /admin/manifest-retry/dlq/:id/resolve with a reason, THE Admin_Controller SHALL mark the DLQ entry as resolved and record the resolution reason
2. WHEN an admin requests POST /admin/manifest-retry/dlq/:id/redrive with mode "now", THE Admin_Controller SHALL immediately enqueue the bundle for retry
3. WHEN an admin requests POST /admin/manifest-retry/dlq/:id/redrive with mode "scheduled", THE Admin_Controller SHALL enqueue the bundle with standard backoff delay
4. WHEN an admin requests POST /admin/manifest-retry/dlq/redrive-bulk with filters and maxBatch, THE Admin_Controller SHALL redrive up to maxBatch matching DLQ entries
5. IF the bulk redrive maxBatch exceeds 100, THEN THE Admin_Controller SHALL reject the request with a validation error
6. WHEN a DLQ entry is already resolved, THE Admin_Controller SHALL return an error indicating the entry cannot be redriven

### Requirement 3: Admin Authorization and Break-Glass

**User Story:** As a security engineer, I want admin endpoints protected by role-based access and break-glass controls, so that only authorized personnel can perform administrative operations.

#### Acceptance Criteria

1. THE Admin_Controller SHALL require ops_admin role (or equivalent) for all admin endpoints
2. WHEN break-glass is in closed state, THE Admin_Controller SHALL return 403 Forbidden for all admin operations
3. WHEN break-glass is in open state, THE Admin_Controller SHALL allow authorized admin operations
4. WHEN an unauthorized user attempts admin operations, THE Admin_Controller SHALL return 401 Unauthorized
5. THE Break_Glass state SHALL be configurable via feature flag without deployment

### Requirement 4: Audit Trail

**User Story:** As a compliance officer, I want all administrative actions recorded with full context, so that I can audit who did what and when for regulatory compliance.

#### Acceptance Criteria

1. WHEN a DLQ_RESOLVE action is performed, THE Audit_Service SHALL record actor, requestId, ip, userAgent, resourceType, resourceId, targetBundleId, before state, after state, reason, and createdAt
2. WHEN a DLQ_REDRIVE action is performed, THE Audit_Service SHALL record the same audit fields as DLQ_RESOLVE
3. WHEN a DLQ_REDRIVE_BULK action is performed, THE Audit_Service SHALL record the bulk operation with count of affected entries
4. WHEN a JOB_FORCE_RETRY action is performed, THE Audit_Service SHALL record the retry request with job context
5. IF a CB_OVERRIDE action is performed, THEN THE Audit_Service SHALL record the circuit breaker state change
6. THE Audit_Service SHALL derive tenant information from bundleId without requiring explicit tenantId field

### Requirement 5: Rate Limiting

**User Story:** As a system operator, I want rate limits on admin endpoints, so that the system is protected from abuse and accidental overload.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL enforce 10 requests per minute per actor for standard admin endpoints
2. THE Rate_Limiter SHALL enforce 1 request per minute per actor for bulk redrive operations
3. WHEN rate limit is exceeded, THE Admin_Controller SHALL return 429 Too Many Requests with Retry-After header
4. THE Rate_Limiter SHALL track limits per authenticated actor identity

### Requirement 6: Worker Safety Controls

**User Story:** As a system operator, I want worker safety controls, so that the retry worker cannot overwhelm downstream systems during incidents.

#### Acceptance Criteria

1. THE Worker SHALL limit concurrent writes to maxConcurrentWrites (default: 1)
2. WHEN Circuit_Breaker is open, THE Worker SHALL apply exponential backoff: 5s → 30s → 60s (memory-only, resets on restart)
3. WHEN maxConsecutiveErrors (default: 10) is reached, THE Worker SHALL self-pause with reason CONSECUTIVE_ERRORS and emit alert
4. THE Worker SHALL provide a resume mechanism after self-pause
5. WHEN Worker resumes from pause, THE Worker SHALL reset consecutive error counter
6. WHEN Worker is paused with reason CONSECUTIVE_ERRORS, THE Worker SHALL auto-resume after configurable cooloff period (default: 5 minutes)
7. WHEN Worker is paused with reason MANUAL_PAUSE, THE Worker SHALL NOT auto-resume and SHALL require manual resume
8. THE Worker state SHALL be stored in a singleton DB row with owner_instance_id and lease_expires_at for multi-instance safety
9. THE recordError and recordSuccess operations SHALL be atomic (single UPDATE statement)
10. THE PauseReason enum SHALL include CONSECUTIVE_ERRORS, MANUAL_PAUSE, and UNKNOWN for forward-compatibility

### Requirement 7: Metrics Runtime Guard

**User Story:** As a platform engineer, I want metrics protected against label explosion and excessive scrape cost, so that Prometheus remains stable under all conditions.

#### Acceptance Criteria

1. WHEN toPrometheusText() is called, THE Metrics_Guard SHALL call validateNoForbiddenLabels() at the start
2. THE Metrics_Guard SHALL enforce label allowlist: state, status, outcome, from, to, reason, trip_reason, error_code
3. IF a forbidden label is detected, THEN THE Metrics_Guard SHALL reject the metric and log a warning
4. THE Metrics_Guard SHALL implement dirty-flag caching to invalidate cache only on metric state change
5. WHEN dirty-flag is not set, THE Metrics_Guard SHALL return cached Prometheus text
6. THE Metrics_Guard SHALL implement TTL fallback equal to scrape interval (default: 15s)

### Requirement 8: Operational Runbooks

**User Story:** As an on-call engineer, I want documented procedures for common incidents, so that I can respond quickly and consistently to production issues.

#### Acceptance Criteria

1. THE Runbook SHALL document "DLQ rising" procedure with steps to investigate and remediate
2. THE Runbook SHALL document "CB stuck open" procedure with steps to diagnose and recover
3. THE Runbook SHALL document "S3 timeout / access denied" procedure with troubleshooting steps
4. THE Runbook SHALL document "Admin abuse suspected" procedure with investigation and mitigation steps
5. WHEN a runbook procedure is executed, THE procedure SHALL reference relevant metrics and alerts

### Requirement 9: Initial SLO Configuration

**User Story:** As a service owner, I want defined SLO targets, so that I can measure and maintain service quality.

#### Acceptance Criteria

1. THE SLO configuration SHALL define dlq_open < 5 at p95 for DLQ volume
2. THE SLO configuration SHALL define dlq_oldest_age_seconds < 3600 at p95 for DLQ age
3. THE SLO configuration SHALL define job_success_rate > 99% over rolling 30m window
4. THE SLO configuration SHALL be documented and measurable via existing metrics

### Requirement 10: Threat Mitigation

**User Story:** As a security engineer, I want specific mitigations for identified threats, so that the system is resilient against abuse cases.

#### Acceptance Criteria

1. WHEN admin endpoint abuse (redrive spam) is detected, THE Rate_Limiter SHALL block the actor and emit alert
2. WHEN DLQ flood is detected, THE Worker SHALL apply backpressure and emit alert
3. WHEN metrics label explosion is attempted, THE Metrics_Guard SHALL reject invalid labels and emit alert
4. WHEN Circuit_Breaker open busy loop is detected, THE Worker SHALL apply progressive backoff
5. WHEN audit store saturation is detected, THE Audit_Service SHALL apply sampling or buffering strategy

