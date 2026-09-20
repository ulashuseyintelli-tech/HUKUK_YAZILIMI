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
 *
 * 2026-09-21 — TEST DUZENI DEGISTI, SENARYOLAR VE IDDIALAR AYNI:
 * Dosya vitest ile yazilmisti ve `jest.config.js` tarafindan ACIKCA disarida birakildigi icin
 * HIC kosmuyordu; icindeki PrismaService mock'u servisin bugunku SQL'inden (lease `$queryRaw ...
 * RETURNING`) sessizce sapmisti. Bu spec'in korudugu guvence SQL seviyesindedir (tek UPDATE
 * icinde atomik artis + kosullu pause, `now()` ile DB saatine dayali lease, `RETURNING` ile
 * yaris guvenligi); elle yazilmis bir SQL taklidi bunu kanitlayamaz. Bu yuzden DB'ye dokunan
 * senaryolar GERCEK PostgreSQL uzerinde kosar (`describeDb` kapisi: DATABASE_URL yoksa atlanir,
 * CI'da db manifestleri saglar). DB'ye dokunmayan bagimlilik (metrics) dar mock olarak kalir.
 * URUN KODU, senaryolar ve iddialar DEGISMEDI.
 *
 * NOT (paylasilan satir): `manifest_worker_state` tek satirli bir tablodur (id='singleton') ve
 * kapsam anahtari yoktur; bu yuzden kurulum/temizlik satirin KENDISINI yonetir. `src` altinda bu
 * tabloyu kullanan baska bir modul yoktur ve DB manifestleri `--runInBand` kosar.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../../../prisma/prisma.service';
import { describeDb } from '../../../../../../../test/describe-db';
import {
  ManifestRetryWorkerSafety,
  PauseReason,
  WorkerSafetyConfig,
} from '../manifest-retry-worker-safety.service';
import type { IWorkerMetrics } from '../manifest-retry-worker.service';

// ============================================================================
// Mock Metrics (DB disi bagimlilik — dar mock)
// ============================================================================

function createMockMetrics(): jest.Mocked<IWorkerMetrics> {
  return {
    recordJobClaimed: jest.fn(),
    recordJobDone: jest.fn(),
    recordJobRetryScheduled: jest.fn(),
    recordJobDlq: jest.fn(),
    recordCircuitBreakerState: jest.fn(),
    recordWorkerPoll: jest.fn(),
    recordWorkerIdle: jest.fn(),
    recordWorkerError: jest.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describeDb('ManifestRetryWorkerSafety', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  // Rakip instance icin BAGIMSIZ baglanti (yaris senaryosu ayni istemciyi paylasmaz)
  let rivalPrisma: PrismaService;
  let safety: ManifestRetryWorkerSafety;
  let mockMetrics: jest.Mocked<IWorkerMetrics>;

  // Kosuma ozel kimlikler
  const instanceId = `test-instance-${randomUUID()}`;
  const rivalInstanceId = `rival-instance-${randomUUID()}`;

  const testConfig: Partial<WorkerSafetyConfig> = {
    instanceId,
    maxConsecutiveErrors: 10,
    autoResumeCooloffMs: 1000, // 1 second for fast tests
    leaseTimeoutMs: 5000,
  };

  /** Singleton satirini bilinen bir baslangica getirir (yalniz bu spec'in verisi). */
  const resetRow = async () => {
    await prisma.manifestWorkerState.deleteMany({ where: { id: 'singleton' } });
    await prisma.manifestWorkerState.create({ data: { id: 'singleton' } });
  };
  const row = () => prisma.manifestWorkerState.findUniqueOrThrow({ where: { id: 'singleton' } });
  const setRow = (data: Parameters<PrismaService['manifestWorkerState']['update']>[0]['data']) =>
    prisma.manifestWorkerState.update({ where: { id: 'singleton' }, data });

  beforeAll(async () => {
    module = await Test.createTestingModule({ providers: [PrismaService] }).compile();
    prisma = module.get<PrismaService>(PrismaService);
    rivalPrisma = new PrismaService();
    await rivalPrisma.$connect();
  });

  afterAll(async () => {
    // Satiri SILMEYIP varsayilana dondururuz: migration zinciri (00000000000001_legal_kernel_triggers)
    // singleton satirini kendisi olusturur; DB'yi geldigimiz duruma birakiyoruz.
    await resetRow();
    await rivalPrisma.$disconnect();
    await module.close();
  });

  beforeEach(async () => {
    await resetRow();
    mockMetrics = createMockMetrics();
    safety = new ManifestRetryWorkerSafety(prisma, mockMetrics, testConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Lease Acquisition Tests
  // ==========================================================================

  describe('Lease Acquisition (Leader Election)', () => {
    it('should acquire lease when no owner exists', async () => {
      const acquired = await safety.tryAcquireLease();

      expect(acquired).toBe(true);
      expect((await row()).ownerInstanceId).toBe(instanceId);
      expect((await row()).leaseExpiresAt).toBeDefined();
    });

    it('should acquire lease when current lease is expired', async () => {
      // Set expired lease
      await setRow({
        ownerInstanceId: rivalInstanceId,
        leaseExpiresAt: new Date(Date.now() - 10000), // 10s ago
      });

      const acquired = await safety.tryAcquireLease();

      expect(acquired).toBe(true);
      expect((await row()).ownerInstanceId).toBe(instanceId);
    });

    it('should renew lease when we already own it', async () => {
      // Set our own lease
      await setRow({
        ownerInstanceId: instanceId,
        leaseExpiresAt: new Date(Date.now() + 1000),
      });
      const before = (await row()).leaseExpiresAt!;

      const acquired = await safety.tryAcquireLease();

      expect(acquired).toBe(true);
      const after = (await row()).leaseExpiresAt!;
      expect(after.getTime()).toBeGreaterThan(before.getTime()); // yenilendi
      expect((await row()).ownerInstanceId).toBe(instanceId);
    });

    it('should fail to acquire lease when another instance owns it', async () => {
      // Rakip GERCEK servis, BAGIMSIZ baglanti uzerinden lease'i alir
      const rival = new ManifestRetryWorkerSafety(rivalPrisma, createMockMetrics(), {
        ...testConfig,
        instanceId: rivalInstanceId,
        leaseTimeoutMs: 60_000, // 1 min from now
      });
      expect(await rival.tryAcquireLease()).toBe(true);

      const acquired = await safety.tryAcquireLease();

      expect(acquired).toBe(false);
      expect((await row()).ownerInstanceId).toBe(rivalInstanceId); // devralinmadi

      // Kontrollu yaris: temiz satirda iki bagimsiz instance AYNI ANDA dener → TAM BIRI kazanir
      await resetRow();
      const [mine, theirs] = await Promise.all([safety.tryAcquireLease(), rival.tryAcquireLease()]);
      expect([mine, theirs].filter(Boolean)).toHaveLength(1);
      expect((await row()).ownerInstanceId).toBe(mine ? instanceId : rivalInstanceId);
    });

    it('should correctly report leader status', async () => {
      // Not leader initially
      expect(await safety.isLeader()).toBe(false);

      await safety.tryAcquireLease();
      expect(await safety.isLeader()).toBe(true);

      // Baskasi gecerli lease'e sahipken lider DEGILIZ
      await setRow({
        ownerInstanceId: rivalInstanceId,
        leaseExpiresAt: new Date(Date.now() + 60000),
      });
      expect(await safety.isLeader()).toBe(false);
    });
  });

  // ==========================================================================
  // Auto-Resume Tests
  // ==========================================================================

  describe('Auto-Resume Condition', () => {
    it('should NOT auto-resume when not paused', async () => {
      await safety.tryAcquireLease();

      expect(await safety.checkAndAutoResume()).toBe(false);
    });

    it('should NOT auto-resume MANUAL_PAUSE regardless of time', async () => {
      await safety.tryAcquireLease();
      await setRow({
        isPaused: true,
        pauseReason: PauseReason.MANUAL_PAUSE,
        pausedAt: new Date(Date.now() - 1000000), // Very old
      });

      expect(await safety.checkAndAutoResume()).toBe(false);
      expect((await row()).isPaused).toBe(true);
    });

    it('should NOT auto-resume UNKNOWN pause reason', async () => {
      await safety.tryAcquireLease();
      await setRow({
        isPaused: true,
        pauseReason: PauseReason.UNKNOWN,
        pausedAt: new Date(Date.now() - 1000000),
      });

      expect(await safety.checkAndAutoResume()).toBe(false);
      expect((await row()).isPaused).toBe(true);
    });

    it('should NOT auto-resume CONSECUTIVE_ERRORS before cooloff', async () => {
      await safety.tryAcquireLease();
      await setRow({
        isPaused: true,
        pauseReason: PauseReason.CONSECUTIVE_ERRORS,
        pausedAt: new Date(), // Just now
      });

      expect(await safety.checkAndAutoResume()).toBe(false);
      expect((await row()).isPaused).toBe(true);
    });

    it('should auto-resume CONSECUTIVE_ERRORS after cooloff', async () => {
      await safety.tryAcquireLease();
      await setRow({
        isPaused: true,
        pauseReason: PauseReason.CONSECUTIVE_ERRORS,
        pausedAt: new Date(Date.now() - 2000), // 2s ago (cooloff is 1s)
        consecutiveErrors: 10,
      });

      expect(await safety.checkAndAutoResume()).toBe(true);
      const after = await row();
      expect(after.isPaused).toBe(false);
      expect(after.pauseReason).toBeNull();
      expect(after.consecutiveErrors).toBe(0);
    });

    it('should NOT auto-resume if not leader', async () => {
      await setRow({
        isPaused: true,
        pauseReason: PauseReason.CONSECUTIVE_ERRORS,
        pausedAt: new Date(Date.now() - 2000),
        ownerInstanceId: rivalInstanceId,
        leaseExpiresAt: new Date(Date.now() + 60000),
      });

      expect(await safety.checkAndAutoResume()).toBe(false);
      expect((await row()).isPaused).toBe(true);
    });
  });

  // ==========================================================================
  // Integration: pause → no poll → auto-resume → poll
  // ==========================================================================

  describe('Integration: pause → no poll → auto-resume → poll', () => {
    it('should complete full pause/resume cycle', async () => {
      await safety.init();
      expect(await safety.isLeader()).toBe(true);
      expect(await safety.isPaused()).toBe(false);

      // 1. Pause (manual)
      await safety.pause('ops-admin');
      expect(await safety.isPaused()).toBe(true);
      expect((await row()).pauseReason).toBe(PauseReason.MANUAL_PAUSE);

      // 2. MANUAL_PAUSE auto-resume ETMEZ → poll yok
      expect(await safety.checkAndAutoResume()).toBe(false);
      expect(await safety.isPaused()).toBe(true);

      // 3. CONSECUTIVE_ERRORS + cooloff dolmus → auto-resume
      await setRow({
        pauseReason: PauseReason.CONSECUTIVE_ERRORS,
        pausedAt: new Date(Date.now() - 2000), // 2s ago
        consecutiveErrors: 10,
      });
      expect(await safety.checkAndAutoResume()).toBe(true);

      // 4. Resume sonrasi poll edilebilir
      expect(await safety.isPaused()).toBe(false);
      expect((await row()).consecutiveErrors).toBe(0);
    });

    it('should NOT auto-resume MANUAL_PAUSE even after long time', async () => {
      await safety.init();
      await safety.pause('ops-admin');

      await setRow({ pausedAt: new Date(Date.now() - 1000000) });

      expect(await safety.checkAndAutoResume()).toBe(false);
      expect(await safety.isPaused()).toBe(true);
    });
  });

  // ==========================================================================
  // Concurrent Write Control (bellek ici — DB gerektirmez)
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
  // CB Backoff Tests (bellek ici — DB gerektirmez)
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
      await setRow({ consecutiveErrors: 5 });

      await safety.recordSuccess();

      expect((await row()).consecutiveErrors).toBe(0);
    });

    it('recordError should increment and auto-pause atomically', async () => {
      // Record 9 errors (below threshold)
      for (let i = 0; i < 9; i++) {
        const shouldPause = await safety.recordError('S3_TIMEOUT');
        expect(shouldPause).toBe(false);
      }

      expect((await row()).consecutiveErrors).toBe(9);
      expect((await row()).isPaused).toBe(false);

      // 10th error should trigger pause
      const shouldPause = await safety.recordError('S3_TIMEOUT');

      const after = await row();
      expect(shouldPause).toBe(true);
      expect(after.consecutiveErrors).toBe(10);
      expect(after.isPaused).toBe(true);
      expect(after.pauseReason).toBe(PauseReason.CONSECUTIVE_ERRORS);
    });
  });
});
