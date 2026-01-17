/**
 * Simulation Clock Services
 * 
 * Phase 8 - Sprint 2A
 * 
 * Injectable clock implementations for simulation.
 * RealClock for production, FakeClock for tests.
 */

import { Injectable } from '@nestjs/common';
import { ISimulationClock } from './simulation.types';

// ============================================================================
// Real Clock (Production)
// ============================================================================

@Injectable()
export class RealSimulationClock implements ISimulationClock {
  now(): Date {
    return new Date();
  }

  advanceSeconds(_seconds: number): void {
    // No-op in real clock - time advances naturally
  }

  reset(_to?: Date): void {
    // No-op in real clock - cannot reset real time
  }
}

// ============================================================================
// Fake Clock (Testing)
// ============================================================================

export class FakeSimulationClock implements ISimulationClock {
  private current: Date;

  constructor(initial?: Date) {
    this.current = initial ? new Date(initial) : new Date();
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }

  advanceMilliseconds(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  reset(to?: Date): void {
    this.current = to ? new Date(to) : new Date();
  }

  /**
   * Set to specific ISO string
   */
  setTime(iso: string): void {
    this.current = new Date(iso);
  }
}
