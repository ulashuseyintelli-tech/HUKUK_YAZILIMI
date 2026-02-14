/**
 * SB-3: Tenant Skew Testi (Tek Tenant Yoğunluk)
 *
 * Synthetic Load Validation — Task 5.1
 *
 * %80 trafik tenant-A, %20 diğer tenant'lar.
 * tenantId label yok → log-based analiz.
 * Tenant hash: salt + hash (PII yok).
 *
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 3
 * @see .kiro/specs/synthetic-load-validation/design.md SB-3
 */

import { PromoteService } from '../../promote.service';
import { PromoteRequestStore } from '../../promote-request.store';
import { SimulationMetricsService } from '../../simulation-metrics.service';
import { SimulationAuditAdapter } from '../../simulation-audit.adapter';
import { SimulationRunStoreService } from '../../simulation-run-store.service';
import { SimulationFeatureFlagService } from '../../simulation-feature-flag.service';
import { IClock } from '../../../evidence/clock.service';
import { MetricsSpy } from './helpers/metrics-spy';
import { ScenarioFactory } from './helpers/scenario-factory';
import { createHash } from 'crypto';

const SEED = Number(process.env.SYN_LOAD_SEED) || 1337;
const TOTAL_REQUESTS = 100;
const HEAVY_TENANT = 'tenant-A';
const LIGHT_TENANTS = ['tenant-B', 'tenant-C', 'tenant-D', 'tenant-E'];
const HEAVY_RATIO = 0.8; // 80% to heavy tenant

/** Stable tenant hash (PII-safe) */
function tenantHash(tenantId: string, salt: string = 'sb3'): string {
  return createHash('sha256').update(`${salt}:${tenantId}`).digest('hex').slice(0, 8);
}

describe('SB-3: Tenant Skew', () => {
  let promoteService: PromoteService;
  let metricsService: SimulationMetricsService;
  let metricsSpy: MetricsSpy;
  let factory: ScenarioFactory;

  // Track per-tenant results for log-based analysis
  const tenantResults = new Map<string, { success: number; fail: number; total: number }>();

  beforeAll(() => {
    factory = new ScenarioFactory(SEED);

    const mockFeatureFlag: jest.Mocked<SimulationFeatureFlagService> = {
      isSimulationEnabled: jest.fn().mockReturnValue(true),
    } as any;

    const mockRunStore: jest.Mocked<SimulationRunStoreService> = {
      findById: jest.fn().mockResolvedValue({ id: 'run-1', status: 'COMPLETED' }),
    } as any;

    const mockAudit: jest.Mocked<SimulationAuditAdapter> = {
      logSimulationEvent: jest.fn(),
    } as any;

    const mockClock: IClock = {
      now: () => new Date('2026-02-14T10:00:00Z'),
    } as any;

    // Each (incidentId, runId) is unique → all get ACCEPTED
    const claimed = new Set<string>();
    const mockPromoteStore: jest.Mocked<PromoteRequestStore> = {
      claimOrGet: jest.fn().mockImplementation(
        async (incidentId: string, runId: string, requestId: string) => {
          const key = `${incidentId}:${runId}`;
          if (claimed.has(key)) {
            return {
              record: {
                id: `rec-${key}`, requestId: `existing-${key}`,
                incidentId, runId, status: 'IN_PROGRESS' as const,
                resultRef: null,
                createdAt: new Date('2026-02-14T10:00:00Z'),
                updatedAt: new Date('2026-02-14T10:00:00Z'),
              },
              isNew: false,
            };
          }
          claimed.add(key);
          return {
            record: {
              id: `rec-${key}`, requestId, incidentId, runId,
              status: 'IN_PROGRESS' as const, resultRef: null,
              createdAt: new Date('2026-02-14T10:00:00Z'),
              updatedAt: new Date('2026-02-14T10:00:00Z'),
            },
            isNew: true,
          };
        },
      ),
      markSucceeded: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    } as any;

    metricsService = new SimulationMetricsService();
    metricsSpy = new MetricsSpy(metricsService);
    metricsSpy.attach();

    promoteService = new PromoteService(
      mockFeatureFlag, mockPromoteStore, mockRunStore,
      metricsService, mockAudit, mockClock,
    );
  });

  afterAll(() => {
    metricsSpy.detach();
  });

  it('should distribute traffic 80/20 and track per-tenant results', async () => {
    metricsSpy.reset();
    tenantResults.clear();

    // Build request plan: 80% heavy, 20% light (round-robin across light tenants)
    const requests: Array<{ tenantId: string; incidentId: string; runId: string }> = [];
    const heavyCount = Math.floor(TOTAL_REQUESTS * HEAVY_RATIO);
    const lightCount = TOTAL_REQUESTS - heavyCount;

    for (let i = 0; i < heavyCount; i++) {
      requests.push({
        tenantId: HEAVY_TENANT,
        incidentId: factory.createIncidentId(HEAVY_TENANT),
        runId: factory.createRunId(),
      });
    }

    for (let i = 0; i < lightCount; i++) {
      const tenant = LIGHT_TENANTS[i % LIGHT_TENANTS.length];
      requests.push({
        tenantId: tenant,
        incidentId: factory.createIncidentId(tenant),
        runId: factory.createRunId(),
      });
    }

    // Execute all in parallel (intra-scenario concurrency)
    const results = await Promise.all(
      requests.map(async (req) => {
        try {
          const result = await promoteService.promote(req.incidentId, req.runId, factory.createActorId());
          return { tenantId: req.tenantId, result, error: null };
        } catch (err) {
          return { tenantId: req.tenantId, result: null, error: err as Error };
        }
      }),
    );

    // Aggregate per-tenant
    for (const r of results) {
      const entry = tenantResults.get(r.tenantId) ?? { success: 0, fail: 0, total: 0 };
      entry.total++;
      if (r.result && r.result.status === 'ACCEPTED') {
        entry.success++;
      } else {
        entry.fail++;
      }
      tenantResults.set(r.tenantId, entry);
    }

    // Log-based tenant distribution report (Req 3.3)
    console.log('[SB-3] Tenant Skew Report:');
    for (const [tenantId, stats] of tenantResults) {
      const hash = tenantHash(tenantId);
      const successRate = stats.total > 0 ? (stats.success / stats.total * 100).toFixed(1) : '0';
      console.log(`  tenant_hash=${hash} total=${stats.total} success=${stats.success} fail=${stats.fail} success_rate=${successRate}%`);
    }

    // Verify distribution
    const heavyStats = tenantResults.get(HEAVY_TENANT);
    expect(heavyStats).toBeDefined();
    expect(heavyStats!.total).toBe(heavyCount);
  });

  it('should not degrade light tenant success rate under heavy skew', async () => {
    // Req 3.1: Diğer tenant'ların başarı oranı düşmemiş
    for (const tenant of LIGHT_TENANTS) {
      const stats = tenantResults.get(tenant);
      if (stats && stats.total > 0) {
        const successRate = stats.success / stats.total;
        // Light tenants should have same success rate as heavy tenant
        // (mock store doesn't have real contention, so all should succeed)
        expect(successRate).toBeGreaterThanOrEqual(0.9);
      }
    }
  });

  it('should not show global conflict increase from tenant skew', async () => {
    // Req 3.2: Global conflict artışı yok
    // With mock store (no real DB), conflict should be 0
    const conflictCount = metricsSpy.getCount('escalation_state_conflict_total');
    expect(conflictCount).toBe(0);
  });

  it('should produce log-based tenant distribution with hashed IDs', () => {
    // Verify tenant hashes are stable and PII-safe
    const hash1 = tenantHash(HEAVY_TENANT);
    const hash2 = tenantHash(HEAVY_TENANT);
    expect(hash1).toBe(hash2); // Stable

    // Different tenants produce different hashes
    const hashes = new Set([HEAVY_TENANT, ...LIGHT_TENANTS].map((t) => tenantHash(t)));
    expect(hashes.size).toBe(5); // All unique
  });
});
