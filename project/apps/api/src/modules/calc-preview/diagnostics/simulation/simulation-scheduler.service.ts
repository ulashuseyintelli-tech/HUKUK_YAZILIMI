/**
 * Simulation Scheduler Services
 * 
 * Phase 8 - Sprint 2A
 * 
 * Injectable scheduler implementations.
 * RealScheduler for production (uses setInterval).
 * ManualScheduler for tests (manual tick, no open handles).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ISimulationScheduler } from './simulation.types';

// ============================================================================
// Real Scheduler (Production)
// ============================================================================

@Injectable()
export class RealSimulationScheduler implements ISimulationScheduler {
  private readonly logger = new Logger(RealSimulationScheduler.name);
  private intervalId?: NodeJS.Timeout;
  private running = false;

  schedule(callback: () => void | Promise<void>, intervalMs: number): void {
    if (this.running) {
      this.logger.warn('[Scheduler] Already running, stopping previous');
      this.stop();
    }

    this.running = true;
    this.intervalId = setInterval(async () => {
      try {
        await callback();
      } catch (error) {
        this.logger.error('[Scheduler] Callback error', error);
      }
    }, intervalMs);

    this.logger.debug('[Scheduler] Started', { intervalMs });
  }

  async tick(): Promise<void> {
    // No-op in real scheduler - intervals fire automatically
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.running = false;
    this.logger.debug('[Scheduler] Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }
}

// ============================================================================
// Manual Scheduler (Testing)
// ============================================================================

/**
 * Manual tick scheduler for tests.
 * No setInterval = no open handles = clean test exit.
 */
export class ManualSimulationScheduler implements ISimulationScheduler {
  private callback?: () => void | Promise<void>;
  private running = false;
  private tickCount = 0;

  schedule(callback: () => void | Promise<void>, _intervalMs: number): void {
    this.callback = callback;
    this.running = true;
    this.tickCount = 0;
  }

  async tick(): Promise<void> {
    if (this.callback && this.running) {
      this.tickCount++;
      await this.callback();
    }
  }

  /**
   * Tick multiple times
   */
  async tickN(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await this.tick();
    }
  }

  stop(): void {
    this.callback = undefined;
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getTickCount(): number {
    return this.tickCount;
  }
}
