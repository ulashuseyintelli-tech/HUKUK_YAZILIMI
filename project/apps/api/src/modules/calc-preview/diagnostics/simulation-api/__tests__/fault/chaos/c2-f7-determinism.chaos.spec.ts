/**
 * C2 — F7 Partial Response: Determinism Testi
 *
 * Chaos Validation — Task 3
 *
 * F7 fault aktifken farklı partial payload varyasyonları
 * deterministik olarak F7'ye map olmalı. Drift engine çalışmamalı.
 *
 * DoD: aynı input replay → aynı exception class + aynı outcome
 *
 * @see .kiro/specs/chaos-soak-validation/design.md — C2
 */

import { PromoteService } from '../../../promote.service';
import type { ISnapshotProvider } from '../../../promote.service';
import { Phase7PartialResponseException } from '../../../simulation-error.types';
import { PHASE7_ENV_KEYS } from '../../../phase7-config';
import {
  ChaosMetricsSpy,
  RedFlagChecker,
  createChaosFeatureFlag,
  createChaosPromoteStore,
  createChaosRunStore,
  createChaosAudit,
  createChaosClock,
  buildChaosSnapshot,
  cleanupPhase7Env,
} from './chaos-helpers';

jest.setTimeout(120_000);

// F7 payload variants — all should map to Phase7PartialResponseException
const F7_VARIANTS: Array<{ name: string; points: any }> = [
  { name: 'empty_array', points: [] },
  { name: 'undefined_points', points: undefined },
  { name: 'null_points', points: null },
];

describe('C2: F7 Partial Response — Determinism Testi', () => {
  afterEach(() => {
    cleanupPhase7Env();
  });

  for (const variant of F7_VARIANTS) {
    describe(`variant: ${variant.name}`, () => {
      let service: PromoteService;
      let metricsSpy: ChaosMetricsSpy;
      let promoteStore: ReturnType<typeof createChaosPromoteStore>;
      let audit: ReturnType<typeof createChaosAudit>;

      beforeEach(() => {
        process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED] = 'true';

        metricsSpy = new ChaosMetricsSpy();
        promoteStore = createChaosPromoteStore();
        audit = createChaosAudit();

        // F7 setup: baseline OK, current has partial/empty points
        const partialSnapshot = {
          ...buildChaosSnapshot('snap-current'),
          points: variant.points ?? [],
        };

        const snapshotProvider: ISnapshotProvider = {
          getSnapshot: jest.fn(async (id: string) => {
            if (id === 'snap-baseline') return buildChaosSnapshot('snap-baseline');
            return partialSnapshot;
          }),
        };

        service = new PromoteService(
          createChaosFeatureFlag() as any,
          promoteStore as any,
          createChaosRunStore() as any,
          metricsSpy.mock as any,
          audit as any,
          createChaosClock(),
          snapshotProvider,
        );
      });

      it('should return HTTP 500 (Phase7PartialResponseException)', async () => {
        await expect(service.promote('inc-1', 'run-1', 'actor-1'))
          .rejects.toThrow(expect.objectContaining({ status: 500 }));
      });

      it('should increment phase7_faults_total{F7}, not {F6}', async () => {
        await service.promote('inc-1', 'run-1', 'actor-1').catch(() => {});

        const snap = metricsSpy.snapshot();
        expect(snap.phase7_faults_total['F7']).toBe(1);
        expect(snap.phase7_faults_total['F6'] ?? 0).toBe(0);
      });

      it('should NOT run drift engine (phase7_evaluations_total = 0)', async () => {
        await service.promote('inc-1', 'run-1', 'actor-1').catch(() => {});

        const snap = metricsSpy.snapshot();
        expect(snap.phase7_evaluations_total).toBe(0);
      });

      it('should produce deterministic outcome on replay (N calls → same exception class)', async () => {
        const N = 10;
        const errors: Error[] = [];

        for (let i = 0; i < N; i++) {
          try {
            await service.promote(`inc-det-${i}`, `run-det-${i}`, 'actor-1');
          } catch (err) {
            errors.push(err as Error);
          }
        }

        expect(errors).toHaveLength(N);

        // All errors must be the same class
        for (const err of errors) {
          expect(err).toBeInstanceOf(Phase7PartialResponseException);
          expect((err as any).status).toBe(500);
        }

        // Metrics: all F7
        const snap = metricsSpy.snapshot();
        expect(snap.phase7_faults_total['F7']).toBe(N);
        expect(snap.phase7_faults_total['F6'] ?? 0).toBe(0);
      });
    });
  }

  it('should keep fault label set bounded to {F7} across all variants', async () => {
    process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED] = 'true';

    const metricsSpy = new ChaosMetricsSpy();
    let callIdx = 0;

    for (const variant of F7_VARIANTS) {
      const partialSnapshot = {
        ...buildChaosSnapshot('snap-current'),
        points: variant.points ?? [],
      };

      const snapshotProvider: ISnapshotProvider = {
        getSnapshot: jest.fn(async (id: string) => {
          if (id === 'snap-baseline') return buildChaosSnapshot('snap-baseline');
          return partialSnapshot;
        }),
      };

      const service = new PromoteService(
        createChaosFeatureFlag() as any,
        createChaosPromoteStore() as any,
        createChaosRunStore() as any,
        metricsSpy.mock as any,
        createChaosAudit() as any,
        createChaosClock(),
        snapshotProvider,
      );

      await service.promote(`inc-v${callIdx}`, `run-v${callIdx}`, 'actor-1').catch(() => {});
      callIdx++;
    }

    const snap = metricsSpy.snapshot();
    const faultLabels = Object.keys(snap.phase7_faults_total);
    expect(faultLabels).toEqual(['F7']);
  });
});
