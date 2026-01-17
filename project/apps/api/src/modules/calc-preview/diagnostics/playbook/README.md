# Playbook System Documentation

Phase 7B - Sprint 3 - Operational Playbook Automation

## Overview

The Playbook system provides automated incident response with safety guardrails. It enables:
- Automatic detection and response to operational incidents
- Human-in-the-loop approval for critical actions
- Time-based escalation with loop prevention
- Tenant-scoped execution isolation
- Full audit trail and rollback capabilities

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PlaybookController                          │
│  (Thin controller - auth/validation/DTO only)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PlaybookService                            │
│  State Machine: ACTIVE ↔ PAUSED ↔ DISABLED → ESCALATED/EXHAUSTED│
│  - Enable/Disable/Mode change                                   │
│  - Pause/Resume (GLOBAL/INCIDENT/TENANT scopes)                 │
│  - Evaluate (dry simulation) / Run (execution)                  │
│  - Idempotency caching (24h TTL)                                │
└─────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ ActionExecutor│ │NotificationSvc│ │EscalationSvc │ │ LeaseManager │
│ - Execute    │ │ - Console    │ │ - Schedule   │ │ - Create     │
│ - Rollback   │ │ - Webhook    │ │ - Cancel     │ │ - Extend     │
│              │ │ - Slack      │ │ - Loop guard │ │ - Revoke     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

## State Machine

```
                    ┌─────────┐
                    │ ACTIVE  │◄────────────────┐
                    └────┬────┘                 │
                         │                      │
              pause()    │    resume()          │ enable()
                         ▼                      │
                    ┌─────────┐                 │
                    │ PAUSED  │                 │
                    └────┬────┘                 │
                         │                      │
              disable()  │                      │
                         ▼                      │
                    ┌─────────┐                 │
                    │DISABLED │─────────────────┘
                    └─────────┘

  On max escalations:  ACTIVE → EXHAUSTED
  On escalation:       ACTIVE → ESCALATED
```

## API Endpoints

### Playbook Management

```bash
# List playbooks
GET /playbooks
Headers: x-tenant-id: <tenant>

# Get playbook detail
GET /playbooks/:id
Headers: x-tenant-id: <tenant>

# Enable playbook
POST /playbooks/:id/enable
Headers: x-tenant-id: <tenant>, Idempotency-Key: <key>

# Disable playbook
POST /playbooks/:id/disable
Headers: x-tenant-id: <tenant>, Idempotency-Key: <key>

# Change mode (DRY_RUN/LIVE)
POST /playbooks/:id/mode
Headers: x-tenant-id: <tenant>, Idempotency-Key: <key>
Body: { "mode": "LIVE" }

# Pause playbook
POST /playbooks/:id/pause
Headers: x-tenant-id: <tenant>
Body: { "scope": "TENANT" | "INCIDENT" | "GLOBAL", "incidentId"?: string }

# Resume playbook
POST /playbooks/:id/resume
Headers: x-tenant-id: <tenant>
Body: { "scope": "TENANT" | "INCIDENT" | "GLOBAL", "incidentId"?: string }
```

### Execution

```bash
# Evaluate (dry simulation)
POST /playbooks/:id/evaluate
Headers: x-tenant-id: <tenant>
Body: { "incidentId": "<id>" }

# Run playbook
POST /playbooks/:id/run
Headers: x-tenant-id: <tenant>, Idempotency-Key: <key>
Body: { "incidentId": "<id>", "mode"?: "DRY_RUN" | "LIVE" }
```

### Incident Management

```bash
# Acknowledge incident
POST /incidents/:id/acknowledge
Headers: x-tenant-id: <tenant>
Body: { "note"?: string }

# Resolve incident
POST /incidents/:id/resolve
Headers: x-tenant-id: <tenant>
Body: { "resolutionNote": string }
```

### Lease Management

```bash
# List active leases
GET /leases
Headers: x-tenant-id: <tenant>

# Revoke lease
DELETE /leases/:id
Headers: x-tenant-id: <tenant>

# Extend lease
POST /leases/:id/extend
Headers: x-tenant-id: <tenant>
Body: { "durationMs": number }
```

### Health & Audit

```bash
# Health check
GET /playbooks/health

# Get audit log
GET /playbooks/:id/audit
Headers: x-tenant-id: <tenant>
Query: since?, limit?

# Export audit
GET /playbooks/:id/audit/export
Headers: x-tenant-id: <tenant>
```

## Response Contracts

### State Change Response
```typescript
{
  ok: boolean;
  playbookId: string;
  previousState: { enabled: boolean; mode: string; state: string };
  newState: { enabled: boolean; mode: string; state: string };
  auditId: string;
  timestamp: string;
}
```

### Error Codes
- `403` - Authorization failure (missing role)
- `409` - State conflict (e.g., already paused)
- `422` - Validation error (e.g., invalid mode transition)
- `429` - Rate limit exceeded

## Escalation Rules

### Time-based Scheduling
- Escalations are scheduled with configurable delays (e.g., T+5m, T+15m)
- Background job checks every 30 seconds for due escalations

### Loop Prevention
- **Max escalations per incident**: Configurable (default: 3)
- **Min interval between escalations**: 10 minutes
- When max reached: Playbook transitions to `EXHAUSTED` state

### Cancellation
- Escalations are automatically cancelled when incident is resolved
- Manual cancellation available via API

## Idempotency & Dedupe

### Idempotency-Key Header
- Required for `/run` and `/mode` endpoints
- Results cached for 24 hours
- Same key returns identical response

### Notification Dedupe
- Key: `incident_id + template + channel`
- Window: 5 minutes
- Prevents notification storms

## Tenant Scoping

### Header Contract
- `x-tenant-id` header required on all endpoints
- Never trust tenant from request body
- All data isolated by tenant

### Pause Scopes
- `GLOBAL`: Pauses for all tenants
- `TENANT`: Pauses for specific tenant only
- `INCIDENT`: Pauses for specific incident only

## DRY_RUN → LIVE Transition Guards

Before switching to LIVE mode:
1. Minimum 10 dry-run executions required
2. Failure rate must be < 10%
3. No notifications in dead letter queue

## Break-Glass Operations

### Emergency Lease Revoke
```bash
DELETE /leases/:id?force=true
```
Immediately revokes lease and triggers rollback.

### Force Disable
```bash
POST /playbooks/:id/disable?force=true
```
Disables playbook and cancels all pending escalations.

## RBAC Roles

- `PLAYBOOK_VIEW`: Read playbook list and details
- `PLAYBOOK_OPERATE`: Pause/resume, acknowledge/resolve
- `PLAYBOOK_EXECUTE`: Run playbooks, manage leases
- `PLAYBOOK_ADMIN`: Enable/disable, change mode, force operations

## Lease Constraints

- Minimum duration: 60 seconds
- Maximum duration: 24 hours
- Auto-rollback on expiry (configurable)

## Metrics & Monitoring

### Key Metrics
- `playbook_executions_total` - Total executions by result
- `playbook_escalations_total` - Escalations by severity
- `playbook_notifications_total` - Notifications by channel
- `playbook_leases_active` - Currently active leases
- `playbook_dead_letter_total` - Failed notifications

### Health Status
- `healthy`: All systems operational
- `degraded`: Dead letter > 0 or retry queue > 50
- `unhealthy`: Dead letter > 10

## Test Coverage

Sprint 3 test suite:
- **Golden Scenarios**: 11 tests (uçtan uca senaryolar)
- **Integration Tests**: 13 tests (gerçek kablo testleri)
- **Contract Tests**: 23 tests (API kontratı doğrulama)
- **Property Tests**: 18 tests (invariant doğrulama)
- **Unit Tests**: 70 tests (servis testleri)

Total: 135 passing tests
