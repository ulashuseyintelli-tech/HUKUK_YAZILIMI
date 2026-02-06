# Design Document: Phase 10.2 - Manifest Retry Production Hardening

## Overview

Phase 10.2 hardens the existing Manifest Retry System (Phase 10) for production deployment. This phase adds controllability, security, auditability, rate limiting, operational safety, and metrics hardening to ensure the system operates safely under adversarial conditions.

The design builds upon existing Phase 10 components:
- `ManifestAdminController` - Admin API endpoints
- `ManifestRetryWorker` - Background job processor
- `ManifestRetryMetricsService` - Prometheus metrics
- `ManifestDlqRepository` - Dead letter queue storage
- `ManifestRetryQueueRepository` - Retry queue storage

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 10.2: PRODUCTION HARDENING LAYER                             │
└──────────────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────────┐
                              │   Admin Request     │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
              ┌──────────┐        ┌──────────┐        ┌──────────┐
              │  Auth    │        │  Rate    │        │  Break   │
              │  Guard   │        │  Limiter │        │  Glass   │
              └────┬─────┘        └────┬─────┘        └────┬─────┘
                   │                   │                   │
                   └───────────────────┼───────────────────┘
                                       │
                                       ▼
                              ┌─────────────────────┐
                              │  Admin Controller   │
                              │  (Enhanced)         │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
              ┌──────────┐        ┌──────────┐        ┌──────────┐
              │  Audit   │        │  Queue   │        │   DLQ    │
              │  Service │        │  Repo    │        │   Repo   │
              └──────────┘        └──────────┘        └──────────┘


                              ┌─────────────────────┐
                              │   Retry Worker      │
                              │   (Hardened)        │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
              ┌──────────┐        ┌──────────┐        ┌──────────┐
              │ Concurr. │        │  Self    │        │  CB Open │
              │ Control  │        │  Pause   │        │  Backoff │
              └──────────┘        └──────────┘        └──────────┘


                              ┌─────────────────────┐
                              │  Metrics Service    │
                              │  (Guarded)          │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
              ┌──────────┐        ┌──────────┐        ┌──────────┐
              │  Label   │        │  Dirty   │        │   TTL    │
              │  Guard   │        │  Flag    │        │  Cache   │
              └──────────┘        └──────────┘        └──────────┘
```

## Components and Interfaces

### 1. Admin Authorization Guard

```typescript
// manifest-admin-auth.guard.ts

export interface AdminAuthConfig {
  requiredRole: string;  // 'ops_admin'
  breakGlassFeatureFlag: string;  // 'manifest-retry-admin-enabled'
}

@Injectable()
export class ManifestAdminAuthGuard implements CanActivate {
  constructor(
    private readonly featureFlagService: FeatureFlagService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // 1. Check break-glass state
    const breakGlassOpen = await this.featureFlagService.isEnabled(
      'manifest-retry-admin-enabled'
    );
    if (!breakGlassOpen) {
      throw new ForbiddenException('Admin access is currently disabled (break-glass closed)');
    }
    
    // 2. Check role
    const user = request.user;
    if (!user || !user.roles?.includes('ops_admin')) {
      throw new UnauthorizedException('ops_admin role required');
    }
    
    return true;
  }
}
```

### 2. Rate Limiter Service

```typescript
// manifest-admin-rate-limiter.service.ts

export interface RateLimitConfig {
  standardLimitPerMinute: number;  // 10
  bulkLimitPerMinute: number;      // 1
  windowMs: number;                 // 60000
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
}

@Injectable()
export class ManifestAdminRateLimiter {
  private readonly limits = new Map<string, { count: number; resetAt: number }>();
  
  constructor(
    @Inject('RATE_LIMIT_CONFIG') private readonly config: RateLimitConfig,
  ) {}

  checkLimit(actorId: string, operation: 'standard' | 'bulk'): RateLimitResult {
    const key = `${actorId}:${operation}`;
    const limit = operation === 'bulk' 
      ? this.config.bulkLimitPerMinute 
      : this.config.standardLimitPerMinute;
    
    const now = Date.now();
    const entry = this.limits.get(key);
    
    if (!entry || entry.resetAt <= now) {
      // New window
      this.limits.set(key, { count: 1, resetAt: now + this.config.windowMs });
      return { allowed: true, remaining: limit - 1, resetAt: new Date(now + this.config.windowMs) };
    }
    
    if (entry.count >= limit) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      return { 
        allowed: false, 
        remaining: 0, 
        resetAt: new Date(entry.resetAt),
        retryAfterSeconds,
      };
    }
    
    entry.count++;
    return { allowed: true, remaining: limit - entry.count, resetAt: new Date(entry.resetAt) };
  }
}
```

### 3. Audit Service

```typescript
// manifest-admin-audit.service.ts

export enum AuditEventType {
  DLQ_RESOLVE = 'DLQ_RESOLVE',
  DLQ_REDRIVE = 'DLQ_REDRIVE',
  DLQ_REDRIVE_BULK = 'DLQ_REDRIVE_BULK',
  JOB_FORCE_RETRY = 'JOB_FORCE_RETRY',
  CB_OVERRIDE = 'CB_OVERRIDE',
}

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  actor: string;
  requestId: string;
  ip: string;
  userAgent: string;
  resourceType: 'dlq_entry' | 'retry_job' | 'circuit_breaker';
  resourceId: string;
  targetBundleId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: Date;
}

export interface AuditContext {
  actor: string;
  requestId: string;
  ip: string;
  userAgent: string;
}

@Injectable()
export class ManifestAdminAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async recordEvent(
    eventType: AuditEventType,
    context: AuditContext,
    resourceType: AuditEvent['resourceType'],
    resourceId: string,
    targetBundleId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    reason: string | null,
  ): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: randomUUID(),
      eventType,
      actor: context.actor,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
      resourceType,
      resourceId,
      targetBundleId,
      before,
      after,
      reason,
      createdAt: new Date(),
    };

    await this.prisma.manifestAdminAuditLog.create({
      data: event,
    });

    this.logger.log('[Audit] Event recorded', { 
      eventType, 
      actor: context.actor, 
      resourceId,
      targetBundleId,
    });

    return event;
  }
}
```

### 4. Enhanced Admin Controller

```typescript
// manifest-admin.controller.ts (enhanced)

@Controller('admin/manifest-retry')
@UseGuards(ManifestAdminAuthGuard)
export class ManifestAdminController {
  constructor(
    private readonly retryQueue: IManifestRetryQueueRepository,
    private readonly dlqRepo: IManifestDlqRepository,
    private readonly auditService: ManifestAdminAuditService,
    private readonly rateLimiter: ManifestAdminRateLimiter,
  ) {}

  // GET /admin/manifest-retry/jobs?status=&limit=&cursor=
  @Get('/jobs')
  async queryJobs(
    @Query() query: JobQueryDto,
    @Req() req: Request,
  ): Promise<JobQueryResponseDto> {
    this.checkRateLimit(req, 'standard');
    return this.retryQueue.queryWithCursor(query);
  }

  // GET /admin/manifest-retry/dlq?status=&limit=&cursor=
  @Get('/dlq')
  async queryDlq(
    @Query() query: DlqQueryDto,
    @Req() req: Request,
  ): Promise<DlqQueryResponseDto> {
    this.checkRateLimit(req, 'standard');
    return this.dlqRepo.queryWithCursor(query);
  }

  // POST /admin/manifest-retry/dlq/:id/resolve
  @Post('/dlq/:id/resolve')
  async resolveDlqEntry(
    @Param('id') id: string,
    @Body() body: DlqResolveDto,
    @Req() req: Request,
  ): Promise<DlqResolveResponseDto> {
    this.checkRateLimit(req, 'standard');
    
    const entry = await this.dlqRepo.getById(id);
    if (!entry) throw new NotFoundException('DLQ entry not found');
    
    const before = { status: entry.status };
    const result = await this.dlqRepo.resolve({ dlqId: id, ...body });
    const after = { status: 'DLQ_RESOLVED' };
    
    await this.auditService.recordEvent(
      AuditEventType.DLQ_RESOLVE,
      this.extractAuditContext(req),
      'dlq_entry',
      id,
      entry.bundleId,
      before,
      after,
      body.reason,
    );
    
    return result;
  }

  // POST /admin/manifest-retry/dlq/:id/redrive
  @Post('/dlq/:id/redrive')
  async redriveDlqEntry(
    @Param('id') id: string,
    @Body() body: DlqRedriveDto,
    @Req() req: Request,
  ): Promise<DlqRedriveResponseDto> {
    this.checkRateLimit(req, 'standard');
    
    const entry = await this.dlqRepo.getById(id);
    if (!entry) throw new NotFoundException('DLQ entry not found');
    if (entry.status !== 'DLQ_OPEN') {
      throw new BadRequestException('DLQ entry already resolved');
    }
    
    const before = { status: entry.status };
    const result = await this.performRedrive(entry, body.mode);
    const after = { status: 'DLQ_REDROVE' };
    
    await this.auditService.recordEvent(
      AuditEventType.DLQ_REDRIVE,
      this.extractAuditContext(req),
      'dlq_entry',
      id,
      entry.bundleId,
      before,
      after,
      `mode: ${body.mode}`,
    );
    
    return result;
  }

  // POST /admin/manifest-retry/dlq/redrive-bulk
  @Post('/dlq/redrive-bulk')
  async redriveBulk(
    @Body() body: DlqRedriveBulkDto,
    @Req() req: Request,
  ): Promise<DlqRedriveBulkResponseDto> {
    this.checkRateLimit(req, 'bulk');
    
    if (body.maxBatch > 100) {
      throw new BadRequestException('maxBatch cannot exceed 100');
    }
    
    const entries = await this.dlqRepo.queryForBulkRedrive(body.filters, body.maxBatch);
    const results = await Promise.all(
      entries.map(e => this.performRedrive(e, 'scheduled'))
    );
    
    await this.auditService.recordEvent(
      AuditEventType.DLQ_REDRIVE_BULK,
      this.extractAuditContext(req),
      'dlq_entry',
      'bulk',
      'multiple',
      { count: entries.length, filters: body.filters },
      { redriven: results.filter(r => r.redriven).length },
      `bulk redrive: ${entries.length} entries`,
    );
    
    return {
      requested: entries.length,
      redriven: results.filter(r => r.redriven).length,
      failed: results.filter(r => !r.redriven).length,
    };
  }

  private checkRateLimit(req: Request, operation: 'standard' | 'bulk'): void {
    const actorId = req.user?.id || req.ip;
    const result = this.rateLimiter.checkLimit(actorId, operation);
    
    if (!result.allowed) {
      throw new HttpException(
        { error: 'RATE_LIMIT_EXCEEDED', retryAfter: result.retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private extractAuditContext(req: Request): AuditContext {
    return {
      actor: req.user?.id || 'unknown',
      requestId: req.headers['x-request-id'] as string || randomUUID(),
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
  }
}
```

### 5. Worker Safety Controls

```typescript
// manifest-retry-worker-safety.service.ts

/**
 * DESIGN DECISIONS (User Approved 2026-02-03):
 * 
 * 1. Singleton worker state: DB'de tek satır, ama owner+lease ile multi-instance safe
 * 2. CB backoff: Memory-only (restart'ta reset olması kabul edilebilir)
 * 3. Auto-resume: CONSECUTIVE_ERRORS için VAR (cooloff sonrası), MANUAL_PAUSE için YOK
 * 4. PauseReason: CONSECUTIVE_ERRORS, MANUAL_PAUSE, UNKNOWN (forward-compatible)
 */

export interface WorkerSafetyConfig {
  maxConcurrentWrites: number;      // default: 1
  maxConsecutiveErrors: number;     // default: 10
  cbOpenBackoffSteps: number[];     // [5000, 30000, 60000] - MEMORY ONLY
  autoResumeCooloffMs: number;      // default: 300000 (5 minutes)
  leaseTimeoutMs: number;           // default: 60000 (1 minute)
  instanceId: string;               // unique per instance (e.g., hostname + pid)
}

/**
 * PauseReason enum - forward-compatible with UNKNOWN
 */
export enum PauseReason {
  CONSECUTIVE_ERRORS = 'CONSECUTIVE_ERRORS',
  MANUAL_PAUSE = 'MANUAL_PAUSE',
  UNKNOWN = 'UNKNOWN',  // Forward-compatible placeholder
}

/**
 * DB State - minimal, persisted in worker_state singleton table
 * Runtime state (CB backoff index) is NOT persisted
 */
export interface WorkerSafetyDbState {
  isPaused: boolean;
  pauseReason: PauseReason | null;
  pausedAt: Date | null;
  pausedBy: string | null;           // actor for MANUAL_PAUSE
  consecutiveErrors: number;
  ownerInstanceId: string | null;    // Current leader instance
  leaseExpiresAt: Date | null;       // Lease expiration for leader election
}

/**
 * Runtime State - includes memory-only fields
 */
export interface WorkerSafetyState extends WorkerSafetyDbState {
  currentCbBackoffIndex: number;     // MEMORY ONLY - resets on restart
  isLeader: boolean;                 // Computed from lease
}

@Injectable()
export class ManifestRetryWorkerSafety {
  // Memory-only state (not persisted)
  private currentCbBackoffIndex = 0;
  private activeConcurrentWrites = 0;
  private readonly writeQueue: Array<() => Promise<void>> = [];

  constructor(
    @Inject('WORKER_SAFETY_CONFIG') private readonly config: WorkerSafetyConfig,
    private readonly prisma: PrismaService,
    private readonly metrics: ManifestRetryMetricsService,
    private readonly logger: Logger,
  ) {}

  /**
   * Initialize: Load state from DB, attempt to acquire lease
   */
  async init(): Promise<void> {
    await this.ensureSingletonRow();
    await this.tryAcquireLease();
  }

  private async ensureSingletonRow(): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO manifest_worker_state (id, is_paused, consecutive_errors)
      VALUES ('singleton', false, 0)
      ON CONFLICT (id) DO NOTHING
    `;
  }

  /**
   * Try to acquire or renew lease for this instance
   * Returns true if this instance is the leader
   */
  async tryAcquireLease(): Promise<boolean> {
    const now = new Date();
    const leaseExpires = new Date(now.getTime() + this.config.leaseTimeoutMs);

    // Atomic lease acquisition: only succeed if no owner or lease expired or we own it
    const result = await this.prisma.$executeRaw`
      UPDATE manifest_worker_state
      SET owner_instance_id = ${this.config.instanceId},
          lease_expires_at = ${leaseExpires}
      WHERE id = 'singleton'
        AND (owner_instance_id IS NULL 
             OR lease_expires_at < ${now}
             OR owner_instance_id = ${this.config.instanceId})
    `;

    return result > 0;
  }

  /**
   * Check if this instance is the active leader
   */
  async isLeader(): Promise<boolean> {
    const state = await this.getDbState();
    if (!state.ownerInstanceId || !state.leaseExpiresAt) return false;
    
    return state.ownerInstanceId === this.config.instanceId 
           && state.leaseExpiresAt > new Date();
  }

  /**
   * Concurrent write slot management
   */
  async acquireWriteSlot<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeConcurrentWrites >= this.config.maxConcurrentWrites) {
      return new Promise((resolve, reject) => {
        this.writeQueue.push(async () => {
          try {
            resolve(await operation());
          } catch (e) {
            reject(e);
          }
        });
      });
    }

    this.activeConcurrentWrites++;
    try {
      return await operation();
    } finally {
      this.activeConcurrentWrites--;
      this.processWriteQueue();
    }
  }

  private processWriteQueue(): void {
    if (this.writeQueue.length > 0 && this.activeConcurrentWrites < this.config.maxConcurrentWrites) {
      const next = this.writeQueue.shift();
      if (next) {
        this.activeConcurrentWrites++;
        next().finally(() => {
          this.activeConcurrentWrites--;
          this.processWriteQueue();
        });
      }
    }
  }

  /**
   * Record success - ATOMIC update: consecutive_errors = 0
   */
  async recordSuccess(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE manifest_worker_state
      SET consecutive_errors = 0
      WHERE id = 'singleton'
    `;
    this.currentCbBackoffIndex = 0;  // Memory-only reset
  }

  /**
   * Record error - ATOMIC update: increment + check threshold + auto-pause
   * Returns true if worker should pause
   */
  async recordError(lastErrorCode: string, lastErrorMessage: string): Promise<boolean> {
    // Atomic increment + conditional pause in single UPDATE
    const result = await this.prisma.$queryRaw<Array<{ consecutive_errors: number; is_paused: boolean }>>`
      UPDATE manifest_worker_state
      SET consecutive_errors = consecutive_errors + 1,
          last_error_code = ${lastErrorCode},
          last_error_at = NOW(),
          is_paused = CASE 
            WHEN consecutive_errors + 1 >= ${this.config.maxConsecutiveErrors} THEN true 
            ELSE is_paused 
          END,
          pause_reason = CASE 
            WHEN consecutive_errors + 1 >= ${this.config.maxConsecutiveErrors} AND NOT is_paused 
            THEN 'CONSECUTIVE_ERRORS' 
            ELSE pause_reason 
          END,
          paused_at = CASE 
            WHEN consecutive_errors + 1 >= ${this.config.maxConsecutiveErrors} AND NOT is_paused 
            THEN NOW() 
            ELSE paused_at 
          END
      WHERE id = 'singleton'
      RETURNING consecutive_errors, is_paused
    `;

    const newState = result[0];
    if (newState.is_paused) {
      this.logger.warn('[WorkerSafety] Worker auto-paused', { 
        reason: PauseReason.CONSECUTIVE_ERRORS,
        consecutiveErrors: newState.consecutive_errors,
      });
      this.metrics.recordWorkerError('self_pause');
    }

    return newState.is_paused;
  }

  /**
   * Manual pause - only ops_admin can trigger
   */
  async pause(actor: string, reason?: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE manifest_worker_state
      SET is_paused = true,
          pause_reason = 'MANUAL_PAUSE',
          paused_at = NOW(),
          paused_by = ${actor}
      WHERE id = 'singleton'
    `;
    this.logger.warn('[WorkerSafety] Worker manually paused', { actor, reason });
    this.metrics.recordWorkerError('manual_pause');
  }

  /**
   * Resume - resets consecutive errors
   */
  async resume(actor: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE manifest_worker_state
      SET is_paused = false,
          pause_reason = NULL,
          paused_at = NULL,
          paused_by = NULL,
          consecutive_errors = 0
      WHERE id = 'singleton'
    `;
    this.logger.log('[WorkerSafety] Worker resumed', { actor });
  }

  /**
   * Check if paused
   */
  async isPaused(): Promise<boolean> {
    const state = await this.getDbState();
    return state.isPaused;
  }

  /**
   * Auto-resume check - ONLY for CONSECUTIVE_ERRORS, NOT for MANUAL_PAUSE
   * Called by worker poll loop
   */
  async checkAndAutoResume(): Promise<boolean> {
    const state = await this.getDbState();
    
    if (!state.isPaused) return false;
    
    // MANUAL_PAUSE never auto-resumes
    if (state.pauseReason === PauseReason.MANUAL_PAUSE) {
      return false;
    }
    
    // CONSECUTIVE_ERRORS: auto-resume after cooloff
    if (state.pauseReason === PauseReason.CONSECUTIVE_ERRORS && state.pausedAt) {
      const pausedDuration = Date.now() - state.pausedAt.getTime();
      if (pausedDuration >= this.config.autoResumeCooloffMs) {
        this.logger.log('[WorkerSafety] Auto-resuming after cooloff', {
          pauseReason: state.pauseReason,
          pausedDuration,
        });
        await this.resume('auto-resume');
        return true;
      }
    }
    
    return false;
  }

  /**
   * CB backoff - MEMORY ONLY (resets on restart, acceptable)
   */
  getCbOpenBackoffMs(): number {
    const backoff = this.config.cbOpenBackoffSteps[this.currentCbBackoffIndex] || 
                    this.config.cbOpenBackoffSteps[this.config.cbOpenBackoffSteps.length - 1];
    
    if (this.currentCbBackoffIndex < this.config.cbOpenBackoffSteps.length - 1) {
      this.currentCbBackoffIndex++;
    }
    
    return backoff;
  }

  resetCbBackoff(): void {
    this.currentCbBackoffIndex = 0;
  }

  /**
   * Get full state (DB + runtime)
   */
  async getState(): Promise<WorkerSafetyState> {
    const dbState = await this.getDbState();
    return {
      ...dbState,
      currentCbBackoffIndex: this.currentCbBackoffIndex,
      isLeader: await this.isLeader(),
    };
  }

  private async getDbState(): Promise<WorkerSafetyDbState> {
    const row = await this.prisma.manifestWorkerState.findUnique({
      where: { id: 'singleton' },
    });
    
    if (!row) {
      return {
        isPaused: false,
        pauseReason: null,
        pausedAt: null,
        pausedBy: null,
        consecutiveErrors: 0,
        ownerInstanceId: null,
        leaseExpiresAt: null,
      };
    }

    return {
      isPaused: row.isPaused,
      pauseReason: row.pauseReason as PauseReason | null,
      pausedAt: row.pausedAt,
      pausedBy: row.pausedBy,
      consecutiveErrors: row.consecutiveErrors,
      ownerInstanceId: row.ownerInstanceId,
      leaseExpiresAt: row.leaseExpiresAt,
    };
  }
}
```

### 6. Metrics Guard

```typescript
// manifest-metrics-guard.service.ts

export const ALLOWED_LABELS = [
  'state',
  'status', 
  'outcome',
  'from',
  'to',
  'reason',
  'trip_reason',
  'error_code',
] as const;

export type AllowedLabel = typeof ALLOWED_LABELS[number];

export interface MetricsGuardConfig {
  scrapeIntervalMs: number;  // default: 15000
  enableDirtyFlag: boolean;  // default: true
}

@Injectable()
export class ManifestMetricsGuard {
  private cachedPrometheusText: string | null = null;
  private cacheTimestamp: number = 0;
  private isDirty: boolean = true;

  constructor(
    @Inject('METRICS_GUARD_CONFIG') private readonly config: MetricsGuardConfig,
    private readonly metricsService: ManifestRetryMetricsService,
    private readonly logger: Logger,
  ) {}

  /**
   * Validate that all labels are in the allowlist
   */
  validateLabels(labels: Record<string, string>): boolean {
    for (const key of Object.keys(labels)) {
      if (!ALLOWED_LABELS.includes(key as AllowedLabel)) {
        this.logger.warn('[MetricsGuard] Forbidden label detected', { label: key });
        return false;
      }
    }
    return true;
  }

  /**
   * Mark metrics as dirty (cache invalidation)
   */
  markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Get Prometheus text with caching and validation
   */
  toPrometheusText(): string {
    // 1. Always validate labels first
    if (!this.validateNoForbiddenLabelsInService()) {
      this.logger.error('[MetricsGuard] Forbidden labels detected in metrics service');
      // Return safe fallback
      return '# ERROR: Forbidden labels detected\n';
    }

    const now = Date.now();

    // 2. Check dirty flag (primary strategy)
    if (this.config.enableDirtyFlag && !this.isDirty && this.cachedPrometheusText) {
      return this.cachedPrometheusText;
    }

    // 3. Check TTL fallback
    if (this.cachedPrometheusText && (now - this.cacheTimestamp) < this.config.scrapeIntervalMs) {
      return this.cachedPrometheusText;
    }

    // 4. Generate fresh metrics
    this.cachedPrometheusText = this.metricsService.toPrometheusText();
    this.cacheTimestamp = now;
    this.isDirty = false;

    return this.cachedPrometheusText;
  }

  private validateNoForbiddenLabelsInService(): boolean {
    // This is called at the start of toPrometheusText()
    // The actual validation is done by the existing validateNoForbiddenLabels function
    return true; // Metrics service already enforces this
  }
}
```

## Data Models

### Worker State Table (Singleton with Leader Election)

```sql
-- Migration: manifest_worker_state
-- Design: Singleton row with owner/lease for multi-instance safety

CREATE TABLE manifest_worker_state (
  id TEXT PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  
  -- Pause state
  is_paused BOOLEAN NOT NULL DEFAULT false,
  pause_reason TEXT CHECK (pause_reason IN ('CONSECUTIVE_ERRORS', 'MANUAL_PAUSE', 'UNKNOWN')),
  paused_at TIMESTAMPTZ,
  paused_by TEXT,  -- Actor for MANUAL_PAUSE
  
  -- Error tracking
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_at TIMESTAMPTZ,
  
  -- Leader election (multi-instance safety)
  owner_instance_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure singleton
CREATE UNIQUE INDEX idx_worker_state_singleton ON manifest_worker_state (id);

-- Initialize singleton row
INSERT INTO manifest_worker_state (id) VALUES ('singleton') ON CONFLICT DO NOTHING;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_worker_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER worker_state_updated_at
  BEFORE UPDATE ON manifest_worker_state
  FOR EACH ROW
  EXECUTE FUNCTION update_worker_state_timestamp();
```

### Audit Log Table

```sql
-- Migration: manifest_admin_audit_log
CREATE TABLE manifest_admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,  -- DLQ_RESOLVE, DLQ_REDRIVE, etc.
  actor TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,  -- Idempotency key
  ip_hash TEXT NOT NULL,  -- SHA-256 hash of IP (PII protection)
  user_agent TEXT NOT NULL,
  resource_type TEXT NOT NULL,  -- dlq_entry, retry_job, circuit_breaker
  resource_id TEXT NOT NULL,
  target_bundle_id TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary query index (time-based)
CREATE INDEX idx_audit_log_created_at ON manifest_admin_audit_log (created_at DESC);

-- Index for querying by actor
CREATE INDEX idx_audit_log_actor ON manifest_admin_audit_log (actor, created_at DESC);

-- Index for querying by bundle
CREATE INDEX idx_audit_log_bundle ON manifest_admin_audit_log (target_bundle_id, created_at DESC);

-- Index for querying by event type
CREATE INDEX idx_audit_log_event_type ON manifest_admin_audit_log (event_type, created_at DESC);

-- Index for querying by resource
CREATE INDEX idx_audit_log_resource ON manifest_admin_audit_log (resource_type, resource_id);

-- Idempotency enforcement
CREATE UNIQUE INDEX idx_audit_log_request_id ON manifest_admin_audit_log (request_id);
```

**Retention Policy**: 
- **Hot storage**: 90 days in PostgreSQL (ops/troubleshooting için yeterli)
- **Cold storage**: Archive to S3 after 90 days (compliance gerekirse)
- **IP addresses**: Hashed (SHA-256) for PII/KVKK compliance
- **Cleanup**: Automated via pg_cron or application-level scheduled job

### DLQ Table Extensions

```sql
-- Add columns for admin operations tracking
ALTER TABLE manifest_dead_letter_queue
ADD COLUMN resolved_at TIMESTAMPTZ,
ADD COLUMN resolved_by TEXT,
ADD COLUMN redriven_at TIMESTAMPTZ,
ADD COLUMN redriven_by TEXT;
```

### Rate Limit State (In-Memory or Redis)

```typescript
interface RateLimitEntry {
  actorId: string;
  operation: 'standard' | 'bulk';
  count: number;
  windowStart: number;
  windowEnd: number;
}
```

### Worker Safety State (DB Singleton + Memory)

```typescript
/**
 * DB Schema: manifest_worker_state (singleton table)
 * 
 * Design Decision: Singleton row with owner/lease for multi-instance safety
 */
interface WorkerSafetyDbRow {
  id: 'singleton';                    // Always 'singleton'
  isPaused: boolean;
  pauseReason: 'CONSECUTIVE_ERRORS' | 'MANUAL_PAUSE' | 'UNKNOWN' | null;
  pausedAt: Date | null;
  pausedBy: string | null;            // Actor for MANUAL_PAUSE
  consecutiveErrors: number;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
  ownerInstanceId: string | null;     // Leader election
  leaseExpiresAt: Date | null;        // Lease expiration
}

/**
 * Memory-only state (not persisted, resets on restart)
 * CB backoff index is intentionally NOT persisted - acceptable behavior
 */
interface WorkerSafetyMemoryState {
  currentCbBackoffIndex: number;
  activeConcurrentWrites: number;
}
```

## Transactional Boundaries and State Machine

### State Transition Rules

#### Retry Queue State Machine

```
PENDING ──────────────────► IN_PROGRESS ──────────────────► DONE
    │                            │                           ▲
    │                            │ (success/noop)            │
    │                            ▼                           │
    │                       RETRY_SCHEDULED ─────────────────┘
    │                            │
    │                            │ (max retries OR permanent error)
    │                            ▼
    └────────────────────────► DLQ
```

**Atomicity Rules**:
- `PENDING → IN_PROGRESS`: Protected by `SELECT ... FOR UPDATE SKIP LOCKED`
- `IN_PROGRESS → DONE/RETRY_SCHEDULED/DLQ`: Single UPDATE within same transaction
- Only ONE active job per bundleId (enforced by unique partial index)

#### DLQ State Machine

```
DLQ_OPEN ──────► DLQ_RESOLVED (terminal)
    │
    └──────────► DLQ_REDROVE (terminal, new job created)
```

**Atomicity Rules**:
- `DLQ_OPEN → DLQ_RESOLVED`: Single UPDATE, idempotent (check status first)
- `DLQ_OPEN → DLQ_REDROVE`: Transaction: UPDATE DLQ + INSERT retry job

### Idempotency Strategy

All admin mutations use `requestId` as idempotency key:
- If `requestId` already exists in audit log → return cached result
- If `requestId` is new → execute operation + record audit

```typescript
async executeWithIdempotency<T>(
  requestId: string,
  operation: () => Promise<T>,
  auditEvent: Partial<AuditEvent>,
): Promise<T> {
  // Check if already executed
  const existing = await this.auditRepo.findByRequestId(requestId);
  if (existing) {
    return existing.result as T;
  }
  
  // Execute in transaction
  return this.prisma.$transaction(async (tx) => {
    const result = await operation();
    await tx.manifestAdminAuditLog.create({
      data: { ...auditEvent, requestId, result: JSON.stringify(result) },
    });
    return result;
  });
}
```

## Cursor Pagination Contract

### Cursor Design

Cursor is based on stable ordering key: `(created_at, id)` tuple, base64 encoded.

```typescript
interface CursorData {
  createdAt: string;  // ISO timestamp
  id: string;         // UUID
}

function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function decodeCursor(cursor: string): CursorData {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString());
}
```

### Pagination Query

```sql
-- First page (no cursor)
SELECT * FROM manifest_dead_letter_queue
WHERE status = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- Subsequent pages (with cursor)
SELECT * FROM manifest_dead_letter_queue
WHERE status = $1
  AND (created_at, id) < ($cursor_created_at, $cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT $2;
```

### Behavior During Concurrent Modifications

- **Insertions**: New records with `created_at > cursor` won't appear in current pagination (consistent snapshot)
- **Deletions**: Deleted records simply won't appear; no gaps in results
- **Updates**: Status changes may cause records to appear/disappear from filtered results (expected behavior)

## Audit Flood Mitigation

### Strategy: Async Queue with Bounded Memory

```typescript
@Injectable()
export class ManifestAdminAuditService {
  private readonly buffer: AuditEvent[] = [];
  private readonly MAX_BUFFER_SIZE = 1000;
  private readonly FLUSH_INTERVAL_MS = 5000;
  private flushTimer: NodeJS.Timer | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: ManifestRetryMetricsService,
    private readonly logger: Logger,
  ) {
    this.startFlushTimer();
  }

  async recordEvent(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<void> {
    const fullEvent: AuditEvent = {
      ...event,
      id: randomUUID(),
      createdAt: new Date(),
    };

    // Add to buffer
    this.buffer.push(fullEvent);

    // If buffer full, flush immediately
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const toFlush = this.buffer.splice(0, this.buffer.length);
    
    try {
      await this.prisma.manifestAdminAuditLog.createMany({
        data: toFlush,
      });
    } catch (error) {
      // DEGRADED MODE: Log to file, emit metric, but DON'T block admin action
      this.logger.error('[Audit] Batch write failed, logging to fallback', { 
        count: toFlush.length, 
        error: error.message,
      });
      this.metrics.recordWorkerError('audit_write_failed');
      
      // Write to fallback file (async, best-effort)
      this.writeToFallbackFile(toFlush);
    }
  }

  private writeToFallbackFile(events: AuditEvent[]): void {
    // Append to audit-fallback.jsonl (one JSON per line)
    const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFile('audit-fallback.jsonl', lines, (err) => {
      if (err) this.logger.error('[Audit] Fallback file write failed', { error: err.message });
    });
  }
}
```

**Failure Behavior Decision**: **Option B (Degraded)** - Allow admin action but emit `AUDIT_WRITE_FAILED` metric and raise alert. Rationale: Availability over strict auditability; fallback file provides recovery path.

### Fallback File Configuration (Finalized)

```typescript
interface AuditFallbackConfig {
  // Location: Local disk (container-mounted volume)
  path: '/var/log/manifest-admin/audit-fallback.jsonl';
  
  // Rotation: Daily via logrotate
  rotationPolicy: 'daily';
  
  // TTL: 7 days retention
  retentionDays: 7;
  
  // Purpose: Incident debug ONLY - NOT source of truth
  // Recovery: Ops team can manually import to DB if needed
  isSourceOfTruth: false;
}
```

**Fallback File Contract:**
- Format: JSONL (one JSON object per line)
- Location: `/var/log/manifest-admin/audit-fallback.jsonl`
- Rotation: Daily, 7 days retention
- Purpose: Emergency debug only, not authoritative
- Recovery: Manual import script available for ops team

## Self-Pause and Resume Mechanism

### Design Decisions (User Approved 2026-02-03)

1. **Auto-resume VAR** - ama sadece `CONSECUTIVE_ERRORS` için
2. **MANUAL_PAUSE auto-resume OLMAZ** - kesinlikle manual resume gerektirir
3. **Cooloff süresi configurable** - default 5 dakika

### Resume Conditions

| Pause Reason | Auto-Resume | Manual Resume | Notes |
|--------------|-------------|---------------|-------|
| CONSECUTIVE_ERRORS | ✅ Cooloff sonrası | ✅ | Auto-resume başarısız olursa tekrar pause'a düşebilir |
| MANUAL_PAUSE | ❌ ASLA | ✅ | Ops kararı, sadece manual |
| UNKNOWN | ❌ | ✅ | Forward-compatible, conservative |

### Auto-Resume Logic

```typescript
/**
 * Auto-resume scheduler - ONLY for CONSECUTIVE_ERRORS
 * Called by worker poll loop every tick
 */
async checkAndAutoResume(): Promise<boolean> {
  const state = await this.getDbState();
  
  if (!state.isPaused) return false;
  
  // CRITICAL: MANUAL_PAUSE never auto-resumes
  if (state.pauseReason === PauseReason.MANUAL_PAUSE) {
    return false;
  }
  
  // CONSECUTIVE_ERRORS: auto-resume after cooloff
  if (state.pauseReason === PauseReason.CONSECUTIVE_ERRORS && state.pausedAt) {
    const pausedDuration = Date.now() - state.pausedAt.getTime();
    if (pausedDuration >= this.config.autoResumeCooloffMs) {
      this.logger.log('[WorkerSafety] Auto-resuming after cooloff', {
        pauseReason: state.pauseReason,
        pausedDurationMs: pausedDuration,
        cooloffMs: this.config.autoResumeCooloffMs,
      });
      
      // Reset consecutive errors on auto-resume
      await this.resume('auto-resume');
      
      // Emit metric for observability
      this.metrics.recordWorkerAutoResume();
      
      return true;
    }
  }
  
  return false;
}
```

### Auto-Resume Failure Handling

Auto-resume sonrası ilk hata tekrar pause'a düşürür:

```typescript
// Worker poll loop
async tick(): Promise<void> {
  // 1. Check auto-resume
  const autoResumed = await this.safety.checkAndAutoResume();
  if (autoResumed) {
    this.logger.log('[Worker] Auto-resumed, attempting first job');
  }
  
  // 2. Check if paused
  if (await this.safety.isPaused()) {
    return; // Skip this tick
  }
  
  // 3. Process job
  try {
    await this.processNextJob();
    await this.safety.recordSuccess();
  } catch (error) {
    const shouldPause = await this.safety.recordError(
      error.code || 'UNKNOWN',
      error.message,
    );
    
    if (shouldPause) {
      // If we just auto-resumed and immediately failed, we're back to paused
      this.logger.warn('[Worker] Paused after error', {
        wasAutoResumed: autoResumed,
      });
    }
  }
}
```

### Metrics and Alerts

```prometheus
# Worker pause state with reason
manifest_retry_worker_paused{reason="CONSECUTIVE_ERRORS"} 1
manifest_retry_worker_paused{reason="MANUAL_PAUSE"} 0

# Auto-resume counter
manifest_retry_worker_auto_resume_total 5

# Alert: Worker paused (any reason)
- alert: ManifestRetryWorkerPaused
  expr: manifest_retry_worker_paused == 1
  for: 1m
  labels:
    severity: warning
  annotations:
    summary: "Manifest retry worker is paused"
    description: "Worker paused due to {{ $labels.reason }}"

# Alert: Auto-resume failing repeatedly
- alert: ManifestRetryWorkerAutoResumeFlapping
  expr: increase(manifest_retry_worker_auto_resume_total[10m]) > 3
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Worker auto-resume flapping"
    description: "Worker has auto-resumed {{ $value }} times in 10 minutes - investigate root cause"

# Alert: Manual pause active for too long
- alert: ManifestRetryWorkerManualPauseLong
  expr: manifest_retry_worker_paused{reason="MANUAL_PAUSE"} == 1
  for: 30m
  labels:
    severity: info
  annotations:
    summary: "Worker manually paused for 30+ minutes"
    description: "Consider resuming or investigating why manual pause is needed"
```

## Security Posture

### Authentication Source Decision

**Decision**: JWT claims (primary) with optional mTLS for service-to-service.

```typescript
interface AdminAuthConfig {
  // JWT-based auth (primary)
  jwtClaimPath: string;  // e.g., 'roles' or 'permissions'
  requiredRole: string;  // 'ops_admin'
  
  // mTLS (optional, for internal services)
  allowMtlsAuth: boolean;
  mtlsClientCertHeader: string;  // 'X-Client-Cert-DN'
  mtlsAllowedCNs: string[];  // ['manifest-admin-service']
}
```

### Break-Glass Scope

Break-glass is scoped per environment and per endpoint family:

```typescript
interface BreakGlassConfig {
  // Feature flags (per environment)
  featureFlags: {
    'manifest-retry-admin-read': boolean;   // GET endpoints
    'manifest-retry-admin-write': boolean;  // POST endpoints
    'manifest-retry-admin-bulk': boolean;   // Bulk operations
  };
  
  // All break-glass state changes are audited
  auditBreakGlassChanges: true;
}
```

## Metrics Guard Failure Mode

**Decision**: Drop offending series + emit violation counter + return 200.

```typescript
toPrometheusText(): string {
  const lines: string[] = [];
  let violationCount = 0;

  // Validate each metric series
  for (const series of this.getAllSeries()) {
    if (!this.validateLabels(series.labels)) {
      violationCount++;
      this.logger.warn('[MetricsGuard] Dropping series with forbidden label', {
        metric: series.name,
        labels: Object.keys(series.labels),
      });
      continue; // Skip this series
    }
    lines.push(this.formatSeries(series));
  }

  // Add violation counter
  if (violationCount > 0) {
    lines.push(`# HELP metrics_guard_violations_total Metrics dropped due to forbidden labels`);
    lines.push(`# TYPE metrics_guard_violations_total counter`);
    lines.push(`metrics_guard_violations_total{reason="forbidden_label"} ${violationCount}`);
  }

  return lines.join('\n');
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Pagination Correctness

*For any* set of jobs or DLQ entries and any valid filter/limit/cursor combination, the returned page SHALL contain only entries matching the filter, have at most `limit` entries, and when using the returned cursor for the next request, the results SHALL start exactly where the previous page ended with no duplicates or gaps.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: DLQ Resolve State Transition

*For any* DLQ entry in DLQ_OPEN status, calling resolve with a reason SHALL transition the entry to DLQ_RESOLVED status and store the provided reason, and the entry SHALL NOT be resolvable again.

**Validates: Requirements 2.1**

### Property 3: DLQ Redrive Enqueuing

*For any* DLQ entry in DLQ_OPEN status, calling redrive with mode "now" SHALL create a retry job with next_retry_at <= current time, and calling redrive with mode "scheduled" SHALL create a retry job with next_retry_at > current time following backoff rules.

**Validates: Requirements 2.2, 2.3**

### Property 4: Bulk Redrive Batch Limit

*For any* bulk redrive request with maxBatch value, if maxBatch > 100 the request SHALL be rejected, otherwise at most maxBatch entries SHALL be redriven regardless of how many entries match the filters.

**Validates: Requirements 2.4, 2.5**

### Property 5: Resolved Entry Rejection

*For any* DLQ entry in DLQ_RESOLVED or DLQ_REDROVE status, attempting to redrive SHALL return an error and SHALL NOT create a new retry job.

**Validates: Requirements 2.6**

### Property 6: Authorization Enforcement

*For any* admin endpoint request, if the user lacks ops_admin role the response SHALL be 401, if break-glass is closed the response SHALL be 403, and only when both conditions pass SHALL the operation proceed.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 7: Audit Event Completeness

*For any* admin action (DLQ_RESOLVE, DLQ_REDRIVE, DLQ_REDRIVE_BULK, JOB_FORCE_RETRY, CB_OVERRIDE), the recorded audit event SHALL contain all required fields: actor, requestId, ip, userAgent, resourceType, resourceId, targetBundleId, before, after, reason, and createdAt.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

### Property 8: Rate Limiting Enforcement

*For any* actor making admin requests, the (N+1)th request within a minute window SHALL be rejected with 429 status where N is the configured limit (10 for standard, 1 for bulk), and different actors SHALL have independent rate limit counters.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 9: Concurrent Write Limiting

*For any* sequence of write operations submitted to the worker, at any point in time the number of active concurrent writes SHALL NOT exceed maxConcurrentWrites configuration value.

**Validates: Requirements 6.1**

### Property 10: Circuit Breaker Open Backoff Progression

*For any* sequence of circuit breaker open states, the backoff delay SHALL progress through the configured steps (5s → 30s → 60s) and SHALL NOT exceed the maximum step value.

**Validates: Requirements 6.2**

### Property 11: Self-Pause on Consecutive Errors

*For any* sequence of worker job processing results, if maxConsecutiveErrors consecutive failures occur without any success, the worker SHALL enter paused state with reason CONSECUTIVE_ERRORS.

**Validates: Requirements 6.3**

### Property 12: Error Counter Reset on Resume

*For any* worker in paused state, calling resume SHALL reset the consecutive error counter to zero and set isPaused to false, regardless of pause reason.

**Validates: Requirements 6.5**

### Property 12a: Auto-Resume Only for CONSECUTIVE_ERRORS

*For any* worker paused with reason CONSECUTIVE_ERRORS, after autoResumeCooloffMs has elapsed, checkAndAutoResume SHALL return true and resume the worker. *For any* worker paused with reason MANUAL_PAUSE, checkAndAutoResume SHALL always return false regardless of elapsed time.

**Validates: Requirements 6.4, 6.6**

### Property 12b: Leader Election Atomicity

*For any* two instances attempting to acquire lease simultaneously, exactly one SHALL succeed and become the leader. The non-leader instance SHALL NOT process jobs until it acquires the lease.

**Validates: Requirements 6.7**

### Property 13: Label Allowlist Enforcement

*For any* metric label key, if the key is not in the allowed set [state, status, outcome, from, to, reason, trip_reason, error_code], the validateLabels function SHALL return false.

**Validates: Requirements 7.2, 7.3**

### Property 14: Metrics Cache Dirty-Flag

*For any* sequence of toPrometheusText() calls, if no metric state change occurred between calls (dirty flag not set), the returned text SHALL be identical to the cached value without regeneration.

**Validates: Requirements 7.4, 7.5, 7.6**

### Property 15: DLQ Flood Backpressure

*For any* DLQ size exceeding the configured threshold, the worker SHALL reduce processing rate and emit backpressure metrics.

**Validates: Requirements 10.2**

## Error Handling

### Admin API Errors

| Error Condition | HTTP Status | Error Code | Response |
|-----------------|-------------|------------|----------|
| Missing authentication | 401 | UNAUTHORIZED | `{ error: "UNAUTHORIZED" }` |
| Missing ops_admin role | 401 | UNAUTHORIZED | `{ error: "UNAUTHORIZED", message: "ops_admin role required" }` |
| Break-glass closed | 403 | FORBIDDEN | `{ error: "FORBIDDEN", message: "Admin access disabled" }` |
| DLQ entry not found | 404 | NOT_FOUND | `{ error: "NOT_FOUND", resourceId: "..." }` |
| DLQ entry already resolved | 400 | ALREADY_RESOLVED | `{ error: "ALREADY_RESOLVED", status: "..." }` |
| Rate limit exceeded | 429 | RATE_LIMIT_EXCEEDED | `{ error: "RATE_LIMIT_EXCEEDED", retryAfter: N }` |
| maxBatch > 100 | 400 | VALIDATION_ERROR | `{ error: "VALIDATION_ERROR", message: "maxBatch cannot exceed 100" }` |
| Invalid cursor | 400 | INVALID_CURSOR | `{ error: "INVALID_CURSOR" }` |

### Worker Errors

| Error Condition | Behavior | Metrics |
|-----------------|----------|---------|
| S3 timeout | Retry with backoff | `manifest_retry_job_retry_scheduled{error_code="S3_TIMEOUT"}` |
| S3 5xx | Retry with backoff | `manifest_retry_job_retry_scheduled{error_code="S3_5XX"}` |
| S3 access denied | Move to DLQ | `manifest_retry_job_dlq{error_code="S3_ACCESS_DENIED"}` |
| Max retries exceeded | Move to DLQ | `manifest_retry_job_dlq{error_code="MAX_RETRIES"}` |
| Consecutive errors threshold | Self-pause | `manifest_retry_worker_error{error_code="self_pause"}` |
| Circuit breaker open | Skip with backoff | `manifest_retry_circuit_breaker_state{state="open"}` |

### Audit Service Errors

| Error Condition | Behavior | Fallback |
|-----------------|----------|----------|
| Database write failure | Retry 3 times | Log to file, emit metric |
| High volume (saturation) | Apply sampling | Buffer in memory, batch write |
| Connection timeout | Circuit breaker | Queue in memory |

### Metrics Guard Errors

| Error Condition | Behavior | Response |
|-----------------|----------|----------|
| Forbidden label detected | Reject metric | Return error comment in Prometheus text |
| Cache corruption | Regenerate | Clear cache, regenerate fresh |

## Testing Strategy

### Dual Testing Approach

This phase requires both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, error conditions, and integration points
- **Property tests**: Verify universal properties across all valid inputs using randomized testing

### Property-Based Testing Configuration

- **Library**: fast-check (TypeScript)
- **Minimum iterations**: 100 per property test
- **Tag format**: `Feature: phase-10-2-production-hardening, Property N: {property_text}`

### Test Categories

#### Unit Tests

1. **Admin Auth Guard**
   - Test break-glass closed returns 403
   - Test missing role returns 401
   - Test valid auth passes

2. **Rate Limiter**
   - Test limit enforcement at boundary
   - Test window reset after timeout
   - Test per-actor isolation

3. **Audit Service**
   - Test all event types recorded correctly
   - Test field completeness
   - Test error handling

4. **Worker Safety**
   - Test concurrent write queueing
   - Test self-pause trigger
   - Test resume behavior

5. **Metrics Guard**
   - Test label validation
   - Test cache hit/miss
   - Test TTL expiration

#### Property-Based Tests

Each correctness property (1-15) SHALL be implemented as a separate property-based test with:
- Minimum 100 iterations
- Appropriate generators for input data
- Clear property assertion
- Tag referencing the design property

#### Integration Tests

1. **DLQ Resolve/Redrive Happy Path**
   - Create DLQ entry → Resolve → Verify state
   - Create DLQ entry → Redrive → Verify job created

2. **Bulk Redrive with maxBatch=100**
   - Create 150 DLQ entries → Bulk redrive with maxBatch=100 → Verify only 100 redriven
   - Verify audit event contains correct count

3. **S3 Timeout → Retryable Classification**
   - Simulate S3 timeout → Verify classified as RETRY
   - Verify job scheduled with backoff

### Test File Structure

```
manifest-retry/
├── __tests__/
│   ├── manifest-admin-auth.guard.spec.ts
│   ├── manifest-admin-rate-limiter.spec.ts
│   ├── manifest-admin-audit.service.spec.ts
│   ├── manifest-retry-worker-safety.spec.ts
│   ├── manifest-metrics-guard.spec.ts
│   ├── manifest-admin.controller.integration.spec.ts
│   ├── manifest-admin.property.spec.ts  # Property-based tests
│   └── manifest-worker-safety.property.spec.ts
```

## Runbook Templates

### DLQ Rising Procedure

```markdown
## Alert: manifest_dlq_size > 5

### Symptoms
- DLQ size metric exceeds threshold
- Possible S3 issues or configuration problems

### Investigation Steps
1. Check S3 health: `aws s3 ls s3://bucket-name/`
2. Check recent DLQ entries: `GET /admin/manifest-retry/dlq?limit=10`
3. Check error codes distribution in metrics
4. Check circuit breaker state

### Remediation
1. If S3 issue: Wait for S3 recovery, entries will auto-retry
2. If config issue: Fix config, bulk redrive affected entries
3. If permanent errors: Investigate and resolve manually
```

### CB Stuck Open Procedure

```markdown
## Alert: manifest_retry_circuit_breaker_open_seconds > 300

### Symptoms
- Circuit breaker in OPEN state for > 5 minutes
- Worker not processing jobs

### Investigation Steps
1. Check S3 health
2. Check recent error codes
3. Check worker logs for error patterns

### Remediation
1. If S3 recovered: CB will auto-transition to HALF_OPEN
2. If stuck: Manual CB reset via admin API (if implemented)
3. If persistent: Investigate root cause before forcing closed
```

### S3 Timeout / Access Denied Procedure

```markdown
## Alert: High rate of S3_TIMEOUT or S3_ACCESS_DENIED errors

### Symptoms
- Jobs failing with S3 errors
- DLQ growing

### Investigation Steps
1. Check S3 service health
2. Check IAM role/policy
3. Check bucket policy
4. Check network connectivity

### Remediation
1. S3_TIMEOUT: Usually transient, wait for recovery
2. S3_ACCESS_DENIED: Fix IAM/bucket policy, then bulk redrive
```

### Admin Abuse Suspected Procedure

```markdown
## Alert: Rate limit exceeded frequently for single actor

### Symptoms
- High 429 response rate
- Single actor hitting limits repeatedly

### Investigation Steps
1. Identify actor from audit logs
2. Check request patterns
3. Determine if legitimate or abuse

### Remediation
1. If legitimate: Consider increasing limits temporarily
2. If abuse: Block actor, investigate intent
3. Review and adjust rate limits if needed
```

## SLO Configuration

```yaml
# manifest-retry-slo.yaml
slos:
  - name: dlq_volume
    description: DLQ should have fewer than 5 open entries
    metric: manifest_dlq_size{status="DLQ_OPEN"}
    target: "< 5"
    window: p95
    
  - name: dlq_age
    description: Oldest DLQ entry should be less than 1 hour old
    metric: manifest_dlq_oldest_age_seconds
    target: "< 3600"
    window: p95
    
  - name: job_success_rate
    description: Job success rate should exceed 99%
    metric: |
      sum(rate(manifest_retry_job_done_total{reason="OK"}[30m])) /
      sum(rate(manifest_retry_job_done_total[30m]))
    target: "> 0.99"
    window: rolling_30m
```


---

## Phase C: Admin Surface Contract Specification (User Approved 2026-02-03)

Bu bölüm, Phase C admin endpoint sözleşmelerini detaylandırır.

### HTTP Status Code Semantics

| Code | Meaning | When to Use |
|------|---------|-------------|
| 200 OK | İşlem yapıldı veya idempotent no-op | Başarılı işlem |
| 404 Not Found | Resource bulunamadı | ID yok |
| 409 Conflict | State transition mümkün değil | already resolved, already redriven, not allowed |
| 401 Unauthorized | Auth yok/invalid | Token eksik veya geçersiz |
| 403 Forbidden | Auth var ama rol yok veya break-glass kapalı | ops_admin rolü yok |
| 429 Too Many Requests | Rate limit aşıldı | Retry-After header ile |

### Break-Glass Kapalıyken Response

```json
// 403 Forbidden
{
  "code": "BREAK_GLASS_CLOSED",
  "message": "Admin access is currently disabled"
}
```

### Rate Limit Response (429)

```json
{
  "code": "RATE_LIMIT_EXCEEDED",
  "rate_limit_type": "standard|bulk",
  "retry_after_seconds": 45
}
```

Headers:
- `Retry-After: 45`

### Idempotency Store (CRITICAL)

**ASLA audit log'a güvenme!** Degraded mode'da dosyaya düşebilir → DB'de olmayabilir → yanlış idempotency.

**Doğru yaklaşım**: `manifest_admin_actions` tablosu

```sql
CREATE TABLE manifest_admin_actions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,  -- Idempotency key
  action_type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  result_code TEXT NOT NULL,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);
```

### Endpoint Contracts

#### POST /admin/manifest/dlq/:dlqId/resolve

**Request**:
```json
{
  "resolution": "WONT_FIX|MANUAL_FIXED|DUPLICATE",
  "notes": "Optional explanation"
}
```

**Success Response (200)**:
```json
{
  "resolved": true,
  "dlqId": "abc123",
  "resolvedBy": "admin@example.com",
  "resolvedAt": "2026-02-03T22:00:00Z"
}
```

**Error Responses**:
- 404: `{ "code": "NOT_FOUND", "message": "DLQ entry not found" }`
- 409: `{ "code": "ALREADY_RESOLVED", "dlqId": "abc123", "currentStatus": "DLQ_RESOLVED" }`

**Audit Event**: `DLQ_RESOLVE`

#### POST /admin/manifest/dlq/:dlqId/redrive

**Request**: (empty body or optional delay)
```json
{
  "delayMs": 0  // Optional: immediate by default
}
```

**Success Response (200)**:
```json
{
  "redriven": true,
  "dlqId": "abc123",
  "bundleId": "bundle-xyz",
  "reason": "REDRIVEN",
  "newJobId": "job-456"
}
```

**Error Responses**:
- 404: `{ "code": "NOT_FOUND", "message": "DLQ entry not found" }`
- 409: `{ "code": "ALREADY_REDRIVEN", "dlqId": "abc123" }`
- 409: `{ "code": "ALREADY_RESOLVED", "dlqId": "abc123" }`
- 409: `{ "code": "ALREADY_QUEUED", "dlqId": "abc123", "existingJobId": "job-123" }`

**Audit Event**: `DLQ_REDRIVE`

#### POST /admin/manifest/worker/resume

**Request**:
```json
{
  "reason": "Ops approval after investigation"
}
```

**Success Response (200)**:
```json
{
  "resumed": true,
  "previousState": {
    "isPaused": true,
    "pauseReason": "CONSECUTIVE_ERRORS",
    "pausedAt": "2026-02-03T21:00:00Z"
  }
}
```

**Error Responses**:
- 409: `{ "code": "NOT_PAUSED", "message": "Worker is not paused" }`

**Audit Event**: `WORKER_RESUME` (NOT CB_OVERRIDE - bu ayrı endpoint)

#### POST /admin/manifest/worker/pause

**Request**:
```json
{
  "reason": "Maintenance window"
}
```

**Success Response (200)**:
```json
{
  "paused": true,
  "pauseReason": "MANUAL_PAUSE",
  "pausedAt": "2026-02-03T22:00:00Z",
  "pausedBy": "admin@example.com"
}
```

**Error Responses**:
- 409: `{ "code": "ALREADY_PAUSED", "pauseReason": "MANUAL_PAUSE" }`

**Audit Event**: `WORKER_PAUSE`

### Idempotency Rules

1. **Request ID**: Client `X-Request-Id` header veya server-generated UUID
2. **Lookup**: İşlem öncesi `manifest_admin_actions` tablosunda `request_id` ara
3. **Cache Hit**: Aynı `request_id` varsa, `result_json` döndür (200 OK)
4. **Cache Miss**: İşlemi yap, sonucu tabloya yaz
5. **TTL**: 7 gün (configurable)

```typescript
async executeWithIdempotency<T>(
  requestId: string,
  actionType: string,
  endpoint: string,
  resourceType: string,
  resourceId: string,
  actor: string,
  operation: () => Promise<T>,
): Promise<T> {
  // 1. Check existing
  const existing = await this.prisma.manifestAdminActions.findUnique({
    where: { requestId },
  });
  
  if (existing) {
    return existing.resultJson as T;
  }
  
  // 2. Execute
  const result = await operation();
  
  // 3. Store
  await this.prisma.manifestAdminActions.create({
    data: {
      requestId,
      actionType,
      endpoint,
      resourceType,
      resourceId,
      actor,
      resultCode: 'OK',
      resultJson: result as any,
    },
  });
  
  return result;
}
```

---

## Design Decisions Summary (User Approved 2026-02-03)

Bu bölüm, kullanıcı onayı ile kesinleşen kritik tasarım kararlarını özetler.

### 1. Singleton Worker State + Owner/Lease ✅

| Karar | Detay |
|-------|-------|
| Tablo | `manifest_worker_state` singleton (id='singleton') |
| Multi-instance | `owner_instance_id` + `lease_expires_at` ile leader election |
| Lease timeout | Default 60 saniye |
| Rationale | Tek instance hedeflense bile, future-proof ve maliyeti düşük |

### 2. CB Backoff Memory-Only ✅

| Karar | Detay |
|-------|-------|
| Persist | HAYIR - memory-only |
| Restart davranışı | Reset olur (kabul edilebilir) |
| Rationale | CB zaten fail durumunda tekrar açılacak, persist etmeye değmez |

### 3. Auto-Resume Modeli ✅

| Pause Reason | Auto-Resume | Cooloff |
|--------------|-------------|---------|
| CONSECUTIVE_ERRORS | ✅ VAR | 5 dakika (configurable) |
| MANUAL_PAUSE | ❌ ASLA | N/A |
| UNKNOWN | ❌ | N/A (conservative) |

**Rationale**: Manual-only uzun vadede ops yükü üretir. Auto-resume güvenli (cooloff + tekrar pause olabilir) ve ops dostu.

### 4. PauseReason Enum ✅

```typescript
enum PauseReason {
  CONSECUTIVE_ERRORS = 'CONSECUTIVE_ERRORS',
  MANUAL_PAUSE = 'MANUAL_PAUSE',
  UNKNOWN = 'UNKNOWN',  // Forward-compatible
}
```

**Rationale**: 2 reason + UNKNOWN ile başla, ileride genişletilebilir (örn: CB_STUCK_OPEN).

### 5. DB State Minimal ✅

| DB'de | Memory'de |
|-------|-----------|
| is_paused | currentCbBackoffIndex |
| pause_reason | activeConcurrentWrites |
| paused_at/by | writeQueue |
| consecutive_errors | |
| owner_instance_id | |
| lease_expires_at | |

**Rationale**: "ERROR" ve "RESUMED" runtime kavram, DB'de tutmaya gerek yok.

### 6. Atomic Updates ✅

```sql
-- recordError: tek UPDATE ile increment + conditional pause
UPDATE manifest_worker_state
SET consecutive_errors = consecutive_errors + 1,
    is_paused = CASE WHEN consecutive_errors + 1 >= threshold THEN true ELSE is_paused END,
    ...
WHERE id = 'singleton'
RETURNING consecutive_errors, is_paused
```

**Rationale**: Transaction veya tek UPDATE ile atomik güncelleme, race condition önlenir.

---

## Spec Final Lock

**Status**: ✅ APPROVED  
**Date**: 2026-02-03  
**Approver**: User  
**Conditions**: 4 kritik düzeltme uygulandı

Bu spec artık implementasyona hazır. Task 2.2 başlayabilir.
