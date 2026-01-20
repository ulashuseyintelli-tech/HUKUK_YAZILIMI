/**
 * Clock Implementations
 * 
 * Production Alerting System - Sprint 0
 * 
 * SystemClock for production, FakeClock for testing.
 * 
 * RULE: Date.now() usage is FORBIDDEN in alerting code.
 * RULE: All services must accept IClock via constructor injection.
 * RULE: Tests MUST use FakeClock for deterministic behavior.
 * 
 * @see .kiro/specs/production-alerting-system/design.md
 * @see Requirements 1.1-1.4, 9.2, 12.2
 */

import { IClock, ITestClock } from './clock.interface';

/**
 * System Clock (production)
 * 
 * Uses real system time. Should only be used in production.
 */
export class SystemClock implements IClock {
  nowMs(): number {
    return Date.now();
  }

  nowIso(): string {
    return new Date().toISOString();
  }

  now(): Date {
    return new Date();
  }

  windowBucket(windowMs: number): number {
    return Math.floor(this.nowMs() / windowMs);
  }

  ageMs(timestamp: string | Date): number {
    const then = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp.getTime();
    return this.nowMs() - then;
  }

  ageSec(timestamp: string | Date): number {
    return Math.floor(this.ageMs(timestamp) / 1000);
  }

  isOlderThanMs(timestamp: string | Date, thresholdMs: number): boolean {
    return this.ageMs(timestamp) > thresholdMs;
  }

  isWithinWindow(timestamp: string | Date, windowMs: number): boolean {
    return this.ageMs(timestamp) <= windowMs;
  }
}

/**
 * Fake Clock (testing)
 * 
 * Allows deterministic time control for tests.
 * 
 * Usage:
 * ```typescript
 * const clock = new FakeClock(1000000);
 * clock.advanceMinutes(15);
 * expect(clock.nowMs()).toBe(1000000 + 15 * 60 * 1000);
 * ```
 */
export class FakeClock implements ITestClock {
  private currentTime: number;
  private readonly initialTime: number;

  /**
   * Create a FakeClock
   * 
   * @param initialTime - Initial time in milliseconds (default: 0)
   */
  constructor(initialTime: number = 0) {
    this.currentTime = initialTime;
    this.initialTime = initialTime;
  }

  nowMs(): number {
    return this.currentTime;
  }

  nowIso(): string {
    return new Date(this.currentTime).toISOString();
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  windowBucket(windowMs: number): number {
    return Math.floor(this.currentTime / windowMs);
  }

  ageMs(timestamp: string | Date): number {
    const then = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp.getTime();
    return this.currentTime - then;
  }

  ageSec(timestamp: string | Date): number {
    return Math.floor(this.ageMs(timestamp) / 1000);
  }

  isOlderThanMs(timestamp: string | Date, thresholdMs: number): boolean {
    return this.ageMs(timestamp) > thresholdMs;
  }

  isWithinWindow(timestamp: string | Date, windowMs: number): boolean {
    return this.ageMs(timestamp) <= windowMs;
  }

  // ITestClock methods

  setTime(time: Date | number): void {
    this.currentTime = typeof time === 'number' ? time : time.getTime();
  }

  advanceMs(ms: number): void {
    this.currentTime += ms;
  }

  advanceSeconds(seconds: number): void {
    this.currentTime += seconds * 1000;
  }

  advanceMinutes(minutes: number): void {
    this.currentTime += minutes * 60 * 1000;
  }

  advanceHours(hours: number): void {
    this.currentTime += hours * 60 * 60 * 1000;
  }

  reset(): void {
    this.currentTime = this.initialTime;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }
}

/**
 * Create a FakeClock at a specific date
 * 
 * Convenience factory for creating FakeClock with a readable date.
 * 
 * @param isoDate - ISO 8601 date string
 * @returns FakeClock set to that date
 */
export function createFakeClockAt(isoDate: string): FakeClock {
  return new FakeClock(new Date(isoDate).getTime());
}

/**
 * Create a FakeClock at current real time
 * 
 * Useful for tests that need to start at "now" but control time after.
 * 
 * @returns FakeClock set to current real time
 */
export function createFakeClockNow(): FakeClock {
  return new FakeClock(Date.now());
}

/**
 * Time constants (milliseconds)
 */
export const TIME_MS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Common window sizes (milliseconds)
 */
export const WINDOW_MS = {
  /** 5 minute window (correlation, multi-tenant detection) */
  FIVE_MINUTES: 5 * TIME_MS.MINUTE,
  /** 15 minute window (dedupe, DEGRADED warn) */
  FIFTEEN_MINUTES: 15 * TIME_MS.MINUTE,
  /** 30 minute window (cooldown, DEGRADED page) */
  THIRTY_MINUTES: 30 * TIME_MS.MINUTE,
  /** 60 minute window (flapping detection) */
  ONE_HOUR: TIME_MS.HOUR,
} as const;
