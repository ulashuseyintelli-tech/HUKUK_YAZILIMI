/**
 * DbPoolMonitor — Connection pool monitoring
 *
 * Synthetic Load Validation — Task 1.4
 *
 * Primary fail signal: Prisma P1001/P1002 connection timeout > 0 → ABORT + FAIL
 * Secondary guard (opsiyonel): active_conns_peak > pool_size * 0.8 >= 30s → WARN
 *
 * @see .kiro/specs/synthetic-load-validation/design.md
 */

import { PrismaService } from '../../../../../../../prisma/prisma.service';
import { SuiteAbortError } from '../load-test-report.types';

/** Default pool size if not detectable */
const DEFAULT_POOL_SIZE = 10;

/** Sampling interval for pool monitoring (ms) */
const SAMPLE_INTERVAL_MS = 1_000;

export class DbPoolMonitor {
  private peakActiveConnections = 0;
  private poolLimit: number;
  private connectionTimeoutCount = 0;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private highWatermarkStartMs: number | null = null;
  private highWatermarkDurationMs = 0;
  private readonly warnings: string[] = [];

  constructor(
    private readonly prisma: PrismaService,
    poolSize?: number,
  ) {
    this.poolLimit = poolSize ?? DEFAULT_POOL_SIZE;
  }

  /** Start periodic pool sampling */
  start(): void {
    this.peakActiveConnections = 0;
    this.connectionTimeoutCount = 0;
    this.highWatermarkStartMs = null;
    this.highWatermarkDurationMs = 0;

    this.intervalHandle = setInterval(() => {
      void this.sample();
    }, SAMPLE_INTERVAL_MS);
  }

  /** Stop sampling */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Record a connection timeout error (P1001/P1002) */
  recordConnectionTimeout(errorCode: string): void {
    this.connectionTimeoutCount++;
    // Primary fail signal — immediate abort
    throw new SuiteAbortError(
      'POOL_EXHAUSTION',
      `Prisma ${errorCode}: connection timeout (count: ${this.connectionTimeoutCount})`,
    );
  }

  /** Check if a Prisma error is a connection timeout */
  static isConnectionTimeout(err: unknown): boolean {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code: string }).code;
      return code === 'P1001' || code === 'P1002';
    }
    return false;
  }

  getPeakActiveConnections(): number {
    return this.peakActiveConnections;
  }

  getPoolLimit(): number {
    return this.poolLimit;
  }

  getConnectionTimeoutCount(): number {
    return this.connectionTimeoutCount;
  }

  getWarnings(): string[] {
    return [...this.warnings];
  }

  isExhausted(): boolean {
    return this.peakActiveConnections >= this.poolLimit * 0.8;
  }

  /** Sample current active connections (best-effort) */
  private async sample(): Promise<void> {
    try {
      // Best-effort: query pg_stat_activity for active connections
      const result = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) as count FROM pg_stat_activity
        WHERE state = 'active' AND datname = current_database()
      `;
      const active = Number(result[0]?.count ?? 0);

      if (active > this.peakActiveConnections) {
        this.peakActiveConnections = active;
      }

      // Secondary guard: >80% for >=30s → WARN
      const threshold = this.poolLimit * 0.8;
      if (active > threshold) {
        if (!this.highWatermarkStartMs) {
          this.highWatermarkStartMs = Date.now();
        }
        this.highWatermarkDurationMs = Date.now() - this.highWatermarkStartMs;
        if (this.highWatermarkDurationMs >= 30_000) {
          const msg = `DB pool >80% for ${(this.highWatermarkDurationMs / 1000).toFixed(0)}s (peak: ${active}/${this.poolLimit})`;
          if (!this.warnings.includes(msg)) {
            this.warnings.push(msg);
          }
        }
      } else {
        this.highWatermarkStartMs = null;
        this.highWatermarkDurationMs = 0;
      }
    } catch {
      // Sampling failure is non-fatal — skip this sample
    }
  }
}
