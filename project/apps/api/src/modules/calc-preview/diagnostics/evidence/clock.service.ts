/**
 * Clock Service
 * 
 * Phase 8 - Sprint 2E
 * 
 * Single source of truth for time operations.
 * Prevents clock drift issues in snapshotAgeSec calculations.
 * 
 * RULE: All services accept IClock interface only (not ClockService directly)
 * This ensures testability and prevents type confusion.
 * 
 * @see .kiro/specs/whatif-simulation/requirements.md
 */

import { Injectable } from '@nestjs/common';

// ============================================================================
// Injection Tokens (Symbol-based, no global namespace collision)
// ============================================================================

/** DI token for IClock interface injection */
export const CLOCK = Symbol('IClock');

/** DI token for ISimulationClock interface injection */
export const SIMULATION_CLOCK = Symbol('ISimulationClock');

/**
 * Clock interface for time operations
 * 
 * All time-dependent calculations should use this interface
 * to ensure consistent time handling across the system.
 * 
 * RULE: All constructors should accept IClock, not ClockService
 */
export interface IClock {
  /** Get current time as Date object */
  now(): Date;
  /** Get current time as milliseconds since epoch */
  nowMs(): number;
  /** Get current time as ISO string */
  nowIso(): string;
  /** Calculate age in seconds from a timestamp */
  ageInSeconds(timestamp: string | Date): number;
  /** Check if a timestamp is older than threshold */
  isOlderThan(timestamp: string | Date, thresholdSec: number): boolean;
}

/**
 * Testable clock interface (extends IClock with time manipulation)
 * 
 * Used in tests to control time deterministically.
 */
export interface ITestClock extends IClock {
  /** Set fake time for testing */
  setFakeTime(time: Date | null): void;
  /** Advance fake time by hours */
  advanceHours(hours: number): void;
  /** Advance fake time by seconds */
  advanceSeconds(seconds: number): void;
  /** Reset to real time */
  resetToRealTime(): void;
  /** Check if using fake time */
  isUsingFakeTime(): boolean;
}

@Injectable()
export class ClockService implements IClock, ITestClock {
  private fakeTime: Date | null = null;

  now(): Date {
    return this.fakeTime ? new Date(this.fakeTime) : new Date();
  }

  nowMs(): number {
    return this.fakeTime ? this.fakeTime.getTime() : Date.now();
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  ageInSeconds(timestamp: string | Date): number {
    const then = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return Math.floor((this.nowMs() - then.getTime()) / 1000);
  }

  isOlderThan(timestamp: string | Date, thresholdSec: number): boolean {
    return this.ageInSeconds(timestamp) > thresholdSec;
  }

  // ITestClock methods
  setFakeTime(time: Date | null): void {
    this.fakeTime = time ? new Date(time) : null;
  }

  advanceHours(hours: number): void {
    if (!this.fakeTime) {
      this.fakeTime = new Date();
    }
    this.fakeTime = new Date(this.fakeTime.getTime() + hours * 60 * 60 * 1000);
  }

  advanceSeconds(seconds: number): void {
    if (!this.fakeTime) {
      this.fakeTime = new Date();
    }
    this.fakeTime = new Date(this.fakeTime.getTime() + seconds * 1000);
  }

  resetToRealTime(): void {
    this.fakeTime = null;
  }

  isUsingFakeTime(): boolean {
    return this.fakeTime !== null;
  }
}

/**
 * Mock clock for testing
 * 
 * Implements both IClock and ITestClock for full test control.
 */
export class MockClockService implements IClock, ITestClock {
  private currentTime: Date;

  constructor(initialTime?: Date) {
    this.currentTime = initialTime || new Date();
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  nowMs(): number {
    return this.currentTime.getTime();
  }

  nowIso(): string {
    return this.currentTime.toISOString();
  }

  ageInSeconds(timestamp: string | Date): number {
    const then = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return Math.floor((this.nowMs() - then.getTime()) / 1000);
  }

  isOlderThan(timestamp: string | Date, thresholdSec: number): boolean {
    return this.ageInSeconds(timestamp) > thresholdSec;
  }

  // ITestClock methods
  setFakeTime(time: Date | null): void {
    if (time) {
      this.currentTime = new Date(time);
    }
  }

  advanceHours(hours: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + hours * 60 * 60 * 1000);
  }

  advanceSeconds(seconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000);
  }

  advanceMinutes(minutes: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60 * 1000);
  }

  advanceMs(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  resetToRealTime(): void {
    this.currentTime = new Date();
  }

  isUsingFakeTime(): boolean {
    return true; // MockClockService is always "fake"
  }

  /** Alias for setFakeTime */
  setTime(time: Date): void {
    this.currentTime = new Date(time);
  }

  /** Reset to specific time */
  reset(time?: Date): void {
    this.currentTime = time || new Date();
  }
}
