/**
 * Manifest Retry Worker Safety Integration Tests
 * 
 * Phase 10.2 - Task 2.4-2.8 Integration Test
 * 
 * Tests the complete worker safety flow:
 * 1. Lease acquisition (leader election)
 * 2. Auto-resume condition (cooloff + reason gate)
 * 3. Integration test: pause → no poll → auto-resume → poll
 * 
 * @see .kiro/specs/phase-10-2-production-hardening/design.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ManifestRetryWorkerSafety,
  PauseReason,
  WorkerSafetyConfig,
  DEFAULT_WORKER_SAFETY_CONFIG,
} from '../manifest-retry-worker-safety.service';

// ============================================================================
// Mock PrismaService
// ============================================================================

interface MockWorkerState {
  id: string;
  isPaused: boolean;
  pauseReason: PauseReason | null;
  pausedAt: Date | null;
  pausedBy: string | null;
  consecutiveErrors: number;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
  ownerInstanceId: string | null;
  leaseExpiresAt: Date | null;
}

function createMockPrisma(initialState?: Partial<MockWorkerState>) {
  const state: MockWorkerState = {
    id: 'singleton',
    isPaused: false,
    pauseReason: null,
    pausedAt: null,
    pausedBy: null,
    consecutiveErrors: 0,
    lastErrorCode: null,
    lastErrorAt: null,
    ownerInstanceId: null,
    leaseExpiresAt: null,
    ...initialState,
  };

  return {
    state,
    $executeRaw: vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('?');
      
      // INSERT singleton row
      if (query.includes('INSERT INTO manifest_worker_state')) {
        return 1;
      }
      
      // Lease acquisition
      if (query.includes('owner_instance_id =') && query.includes('lease_expires_at =')) {
        const instanceId = values[0] as string;
        const leaseExpires = values[1] as Date;
        const now = values[2] as Date;
        
        // Check conditions
        const canAcquire = 
          state.ownerInstanceId === null ||
          (state.leaseExpiresAt && state.leaseExpiresAt < now) ||
          state.ownerInstanceId === instanceId;
        
        if (canAcquire) {
          state.ownerInstanceId = instanceId;
          state.leaseExpiresAt = leaseExpires;
          return 1;
        }
        return 0;
      }
      
      // Record success
      if (query.includes('consecutive_errors = 0') && !query.includes('is_paused')) {
        state.consecutiveErrors = 0;
        return 1;
      }
      
      // Manual pause
      if (query.includes("'MANUAL_PAUSE'")) {
        const actor = values[0] as string;
        state.isPaused = true;
        state.pauseReason = PauseReason.MANUAL_PAUSE;
        state.pausedAt = new Date();
        state.pausedBy = actor;
        return 1;
      }
      
      // Resume
      if (query.includes('is_paused = false') && query.includes('pause_reason = NULL')) {
        state.isPaused = false;
        state.pauseReason = null;
        state.pausedAt = null;
        state.pausedBy = null;
        state.consecutiveErrors = 0;
        return 1;
      }
      
      return 0;
    }),
    
    $queryRaw: vi.fn().mockImplementation(async () => {
      // Record error - atomic increment + conditional pause
      state.consecutiveErrors++;
      state.lastErrorAt = new Date();
      
      // Check threshold (default: 10)
      if (state.consecutiveErrors >= 10 && !state.isPaused) {
        state.isPaused = true;
        state.pauseReason = PauseReason.CONSECUTIVE_ERRORS;
        state.pausedAt = new Date();
      }
      
      return [{ consecutive_errors: state.consecutiveErrors, is_paused: state.isPaused }];
    }),
    
    manifestWorkerState: {
      findUnique: vi.fn().mockImplementation(async () => state),
    },
  };
}

// ============================================================================
// Mock Metrics
// ============================================================================

function createMockMetrics() {
  return {
    recordJobClaimed: vi.fn(),
    recordJobDone: vi.fn(),
    recordJobRetryScheduled: vi.fn(),
    recordJobDlq: vi.fn(),
    recordCircuitBreakerState: vi.fn(),
    recordWorkerPoll: vi.fn(),
    recordWorkerIdle: vi.fn(),
    recordWorkerError: vi.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ManifestRetryWorkerSafety', () => {
  let safety: ManifestRetryWorkerSafety;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockMetrics: ReturnType<typeof createMockMetrics>;
  
  const testConfig: Partial<WorkerSafetyConfig> = {
    instanceId: 'test-instance-1',
    maxConsecutiveErrors: 10,
    autoResumeCooloffMs: 1000, // 1 second for fast tests
    leaseTimeoutMs: 5000,
  };

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockMetrics = createMockMetrics();
    safety = new ManifestRetryWorkerSafety(
      mockPrisma as any,
      mockMetrics,
      testConfig,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Lease Acquisition Tests
  // ==========================================================================

  describe('Lease Acquisition (Leader Election)', () => {
    it('should acquire lease when no owner exists', async () => {
      const acquired = await safety.tryAcquireLease();
      
      expect(acquired).toBe(true);
      expect(mockPrisma.state.ownerInstanceId).toBe('test-instance-1');
      expect(mockPrisma.state.leaseExpiresAt).toBeDefined();
    });

    it('should acquire lease when current lease is expired', async () => {
      // Set expired lease
      mockPrisma.state.ownerInstanceId = 'other-instance';
      mockPrisma.state.leaseExpiresAt = new Date(Date.now() - 10000); // 10s ago
      
      const acquired = await safety.tryAcquireLease();
      
      expect(acquired).toBe(true);
      expect(mockPrisma.state.ownerInstanceId).toBe('test-instance-1');
    });

    it('should renew lease when we already own it', async () => {
      // Set our own lease
      mockPrisma.state.ownerInstanceId = 'test-instance-1';
      mockPrisma.state.leaseExpiresAt = new Date(Date.now() + 1000);
      
      const acquired = await safety.tryAcquireLease();
      
      expect(acquired).toBe(true);
    });

    it('should fail to acquire lease when another instance owns it', async () => {
      // Set another instance's valid lease
      mockPrisma.state.ownerInstanceId = 'other-instance';
      mockPrisma.state.leaseExpiresAt = new Date(Date.now() + 60000); // 1 min from now
      
      // Override mock to return 0 for this case
      mockPrisma.$executeRaw.mockImplementationOnce(async () => 0);
      
      const acquired = await safety.tryAcquireLease();
      
      expect(acquired).toBe(false);
    });

    it('should correctly report leader status', async () => {
      // Not leader initially
      expect(await safety.isLeader()).toBe(false);
      
      // Acquire lease
      await safety.tryAcquireLease();
      
      // Now leader
      expect(await safety.isLeader()).toBe(true);
    });
  });

  // ==========================================================================
  // Auto-Resume Tests
  // ==========================================================================

  describe('Auto-Resume Condition', () => {
    it('should NOT auto-resume when not paused', async () => {
      mockPrisma.state.isPaused = false;
      
      const resumed = await safety.checkAndAutoResume();
      
      expect(resumed).toBe(false);
    });

    it('should NOT auto-resume MANUAL_PAUSE regardless of time', async () => {
      // Set MANUAL_PAUSE state with old pausedAt
      mockPrisma.state.isPaused = true;
      mockPrisma.state.pauseReason = PauseReason.MANUAL_PAUSE;
      mockPrisma.state.pausedAt = new Date(Date.now() - 1000000); // Very old
      mockPrisma.state.pausedBy = 'admin';
      
      // Acquire lease first
      await safety.tryAcquireLease();
      
      const resumed = await safety.checkAndAutoResume();
      
      expect(resumed).toBe(false);
      expect(mockPrisma.state.isPaused).toBe(true);
      expect(mockPrisma.state.pauseReason).toBe(PauseReason.MANUAL_PAUSE);
    });

    it('should NOT auto-resume UNKNOWN pause reason', async () => {
      mockPrisma.state.isPaused = true;
      mockPrisma.state.pauseReason = PauseReason.UNKNOWN;
      mockPrisma.state.pausedAt = new Date(Date.now() - 1000000);
      
      await safety.tryAcquireLease();
      
      const resumed = await safety.checkAndAutoResume();
      
      expect(resumed).toBe(false);
    });

    it('should NOT auto-resume CONSECUTIVE_ERRORS before cooloff', async () => {
      mockPrisma.state.isPaused = true;
      mockPrisma.state.pauseReason = PauseReason.CONSECUTIVE_ERRORS;
      mockPrisma.state.pausedAt = new Date(); // Just now
      
      await safety.tryAcquireLease();
      
      const resumed = await safety.checkAndAutoResume();
      
      expect(resumed).toBe(false);
    });

    it('should auto-resume CONSECUTIVE_ERRORS after cooloff', async () => {
      mockPrisma.state.isPaused = true;
      mockPrisma.state.pauseReason = PauseReason.CONSECUTIVE_ERRORS;
      mockPrisma.state.pausedAt = new Date(Date.now() - 2000); // 2s ago (cooloff is 1s)
      mockPrisma.state.consecutiveErrors = 10;
      
      // Acquire lease first
      await safety.tryAcquireLease();
      
      const resumed = await safety.checkAndAutoResume();
      
      expect(resumed).toBe(true);
      expect(mockPrisma.state.isPaused).toBe(false);
      expect(mockPrisma.state.pauseReason).toBeNull();
      expect(mockPrisma.state.consecutiveErrors).toBe(0);
    });

    it('should NOT auto-resume if not leader', async () => {
      mockPrisma.state.isPaused = true;
      mockPrisma.state.pauseReason = PauseReason.CONSECUTIVE_ERRORS;
      mockPrisma.state.pausedAt = new Date(Date.now() - 2000);
      
      // Another instance owns the lease
      mockPrisma.state.ownerInstanceId = 'other-instance';
      mockPrisma.state.leaseExpiresAt = new Date(Date.now() + 60000);
      
      const resumed = await safety.checkAndAutoResume();
      
      expect(resumed).toBe(false);
    });
  });

  // ==========================================================================
  // Integration Test: pause → no poll → auto-resume → poll
  // ==========================================================================

  describe('Integration: pause → no poll → auto-resume → poll', () => {
    it('should complete full pause/resume cycle', async () => {
      // 1. Initialize and acquire lease
      await safety.init();
      expect(await safety.isLeader()).toBe(true);
      
      // 2. Simulate consecutive errors until auto-pause
      for (let i = 0; i < 10; i++) {
        await safety.recordError('S3_TIMEOUT');
      }
      
      // 3. Verify paused state
      expect(await safety.isPaused()).toBe(true);
      const state1 = await safety.getDbState();
      expect(state1.pauseReason).toBe(PauseReason.CONSECUTIVE_ERRORS);
      expect(state1.consecutiveErrors).toBe(10);
      
      // 4. Verify no auto-resume before cooloff
      const earlyResume = await safety.checkAndAutoResume();
      expect(earlyResume).toBe(false);
      expect(await safety.isPaused()).toBe(true);
      
      // 5. Simulate time passing (set pausedAt to past)
      mockPrisma.state.pausedAt = new Date(Date.now() - 2000); // 2s ago
      
      // 6. Auto-resume should now work
      const resumed = await safety.checkAndAutoResume();
      expect(resumed).toBe(true);
      
      // 7. Verify resumed state
      expect(await safety.isPaused()).toBe(false);
      const state2 = await safety.getDbState();
      expect(state2.pauseReason).toBeNull();
      expect(state2.consecutiveErrors).toBe(0);
      
      // 8. Worker can now poll again
      expect(await safety.isLeader()).toBe(true);
    });

    it('should NOT auto-resume MANUAL_PAUSE even after long time', async () => {
      await safety.init();
      
      // Manual pause
      await safety.pause('admin-user', 'maintenance');
      
      expect(await safety.isPaused()).toBe(true);
      expect(mockPrisma.state.pauseReason).toBe(PauseReason.MANUAL_PAUSE);
      
      // Simulate very long time passing
      mockPrisma.state.pausedAt = new Date(Date.now() - 1000000);
      
      // Auto-resume should NOT work
      const resumed = await safety.checkAndAutoResume();
      expect(resumed).toBe(false);
      expect(await safety.isPaused()).toBe(true);
      
      // Manual resume required
      await safety.resume('admin-user');
      expect(await safety.isPaused()).toBe(false);
    });
  });

  // ==========================================================================
  // Concurrent Write Control Tests
  // ==========================================================================

  describe('Concurrent Write Control', () => {
    it('should limit concurrent writes to maxConcurrentWrites', async () => {
      let activeWrites = 0;
      let maxActiveWrites = 0;
      
      const slowOperation = async () => {
        activeWrites++;
        maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
        await new Promise(resolve => setTimeout(resolve, 50));
        activeWrites--;
        return 'done';
      };
      
      // Start 5 concurrent operations
      const promises = [
        safety.acquireWriteSlot(slowOperation),
        safety.acquireWriteSlot(slowOperation),
        safety.acquireWriteSlot(slowOperation),
        safety.acquireWriteSlot(slowOperation),
        safety.acquireWriteSlot(slowOperation),
      ];
      
      await Promise.all(promises);
      
      // Should never exceed maxConcurrentWrites (default: 1)
      expect(maxActiveWrites).toBe(1);
    });
  });

  // ==========================================================================
  // CB Backoff Tests
  // ==========================================================================

  describe('CB Open Backoff (Memory-Only)', () => {
    it('should progress through backoff steps', () => {
      expect(safety.getCbOpenBackoffMs()).toBe(5000);  // Step 0
      expect(safety.getCbOpenBackoffMs()).toBe(30000); // Step 1
      expect(safety.getCbOpenBackoffMs()).toBe(60000); // Step 2
      expect(safety.getCbOpenBackoffMs()).toBe(60000); // Stay at max
    });

    it('should reset backoff on resetCbBackoff()', () => {
      safety.getCbOpenBackoffMs(); // 5000
      safety.getCbOpenBackoffMs(); // 30000
      
      safety.resetCbBackoff();
      
      expect(safety.getCbOpenBackoffMs()).toBe(5000); // Back to step 0
    });
  });

  // ==========================================================================
  // Atomic Operations Tests
  // ==========================================================================

  describe('Atomic Operations', () => {
    it('recordSuccess should reset consecutive_errors atomically', async () => {
      mockPrisma.state.consecutiveErrors = 5;
      
      await safety.recordSuccess();
      
      expect(mockPrisma.state.consecutiveErrors).toBe(0);
    });

    it('recordError should increment and auto-pause atomically', async () => {
      // Record 9 errors (below threshold)
      for (let i = 0; i < 9; i++) {
        const shouldPause = await safety.recordError('S3_TIMEOUT');
        expect(shouldPause).toBe(false);
      }
      
      expect(mockPrisma.state.consecutiveErrors).toBe(9);
      expect(mockPrisma.state.isPaused).toBe(false);
      
      // 10th error should trigger pause
      const shouldPause = await safety.recordError('S3_TIMEOUT');
      
      expect(shouldPause).toBe(true);
      expect(mockPrisma.state.consecutiveErrors).toBe(10);
      expect(mockPrisma.state.isPaused).toBe(true);
      expect(mockPrisma.state.pauseReason).toBe(PauseReason.CONSECUTIVE_ERRORS);
    });
  });
});
