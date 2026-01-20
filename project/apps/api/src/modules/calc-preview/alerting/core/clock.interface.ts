/**
 * Clock Interface
 * 
 * Production Alerting System - Sprint 0
 * 
 * Time abstraction for testability.
 * All time-dependent calculations MUST use this interface.
 * 
 * RULE: Date.now() usage is FORBIDDEN in alerting code.
 * RULE: All constructors should accept IClock, not concrete implementations.
 * 
 * @see .kiro/specs/production-alerting-system/design.md
 * @see Requirements 1.1-1.4, 9.2, 12.2
 */

/**
 * Clock interface for time operations
 * 
 * All time-dependent calculations should use this interface
 * to ensure consistent time handling and testability.
 */
export interface IClock {
  /**
   * Get current time in milliseconds since epoch
   */
  nowMs(): number;

  /**
   * Get current time as ISO 8601 string
   */
  nowIso(): string;

  /**
   * Get current time as Date object
   */
  now(): Date;

  /**
   * Calculate window bucket for given window size
   * 
   * @param windowMs - Window size in milliseconds
   * @returns Window bucket number (floor(nowMs / windowMs))
   */
  windowBucket(windowMs: number): number;

  /**
   * Calculate age in milliseconds from a timestamp
   * 
   * @param timestamp - ISO 8601 timestamp or Date
   * @returns Age in milliseconds
   */
  ageMs(timestamp: string | Date): number;

  /**
   * Calculate age in seconds from a timestamp
   * 
   * @param timestamp - ISO 8601 timestamp or Date
   * @returns Age in seconds
   */
  ageSec(timestamp: string | Date): number;

  /**
   * Check if a timestamp is older than threshold
   * 
   * @param timestamp - ISO 8601 timestamp or Date
   * @param thresholdMs - Threshold in milliseconds
   * @returns True if timestamp is older than threshold
   */
  isOlderThanMs(timestamp: string | Date, thresholdMs: number): boolean;

  /**
   * Check if a timestamp is within a time window
   * 
   * @param timestamp - ISO 8601 timestamp or Date
   * @param windowMs - Window size in milliseconds
   * @returns True if timestamp is within window
   */
  isWithinWindow(timestamp: string | Date, windowMs: number): boolean;
}

/**
 * Testable clock interface (extends IClock with time manipulation)
 * 
 * Used in tests to control time deterministically.
 */
export interface ITestClock extends IClock {
  /**
   * Set current time to specific value
   * 
   * @param time - Time to set (Date or milliseconds)
   */
  setTime(time: Date | number): void;

  /**
   * Advance time by milliseconds
   * 
   * @param ms - Milliseconds to advance
   */
  advanceMs(ms: number): void;

  /**
   * Advance time by seconds
   * 
   * @param seconds - Seconds to advance
   */
  advanceSeconds(seconds: number): void;

  /**
   * Advance time by minutes
   * 
   * @param minutes - Minutes to advance
   */
  advanceMinutes(minutes: number): void;

  /**
   * Advance time by hours
   * 
   * @param hours - Hours to advance
   */
  advanceHours(hours: number): void;

  /**
   * Reset to initial time
   */
  reset(): void;

  /**
   * Get current fake time value
   */
  getCurrentTime(): number;
}
