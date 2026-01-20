/**
 * Clock Tests
 * 
 * Production Alerting System - Sprint 0 Gate A
 * 
 * Tests for clock interface implementations.
 * 
 * @see Requirements 1.1-1.4, 9.2, 12.2
 */

import {
  SystemClock,
  FakeClock,
  createFakeClockAt,
  createFakeClockNow,
  TIME_MS,
  WINDOW_MS,
} from '../core/clock';

describe('Clock', () => {
  describe('SystemClock', () => {
    let clock: SystemClock;

    beforeEach(() => {
      clock = new SystemClock();
    });

    it('should return current time in milliseconds', () => {
      const before = Date.now();
      const nowMs = clock.nowMs();
      const after = Date.now();

      expect(nowMs).toBeGreaterThanOrEqual(before);
      expect(nowMs).toBeLessThanOrEqual(after);
    });

    it('should return current time as ISO string', () => {
      const iso = clock.nowIso();
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should return current time as Date', () => {
      const date = clock.now();
      expect(date).toBeInstanceOf(Date);
    });

    it('should calculate window bucket correctly', () => {
      const windowMs = 5 * 60 * 1000; // 5 minutes
      const bucket = clock.windowBucket(windowMs);
      const expectedBucket = Math.floor(Date.now() / windowMs);

      expect(bucket).toBe(expectedBucket);
    });

    it('should calculate age in milliseconds', () => {
      const pastTime = new Date(Date.now() - 1000).toISOString();
      const age = clock.ageMs(pastTime);

      expect(age).toBeGreaterThanOrEqual(1000);
      expect(age).toBeLessThan(2000);
    });

    it('should calculate age in seconds', () => {
      const pastTime = new Date(Date.now() - 5000).toISOString();
      const age = clock.ageSec(pastTime);

      expect(age).toBeGreaterThanOrEqual(5);
      expect(age).toBeLessThan(7);
    });

    it('should check if timestamp is older than threshold', () => {
      const oldTime = new Date(Date.now() - 10000).toISOString();
      const recentTime = new Date(Date.now() - 1000).toISOString();

      expect(clock.isOlderThanMs(oldTime, 5000)).toBe(true);
      expect(clock.isOlderThanMs(recentTime, 5000)).toBe(false);
    });

    it('should check if timestamp is within window', () => {
      const recentTime = new Date(Date.now() - 1000).toISOString();
      const oldTime = new Date(Date.now() - 10000).toISOString();

      expect(clock.isWithinWindow(recentTime, 5000)).toBe(true);
      expect(clock.isWithinWindow(oldTime, 5000)).toBe(false);
    });
  });

  describe('FakeClock', () => {
    let clock: FakeClock;
    const initialTime = 1700000000000;

    beforeEach(() => {
      clock = new FakeClock(initialTime);
    });

    it('should return initial time', () => {
      expect(clock.nowMs()).toBe(initialTime);
    });

    it('should return time as ISO string', () => {
      const iso = clock.nowIso();
      expect(iso).toBe(new Date(initialTime).toISOString());
    });

    it('should return time as Date', () => {
      const date = clock.now();
      expect(date.getTime()).toBe(initialTime);
    });

    it('should advance time by milliseconds', () => {
      clock.advanceMs(1000);
      expect(clock.nowMs()).toBe(initialTime + 1000);
    });

    it('should advance time by seconds', () => {
      clock.advanceSeconds(5);
      expect(clock.nowMs()).toBe(initialTime + 5000);
    });

    it('should advance time by minutes', () => {
      clock.advanceMinutes(10);
      expect(clock.nowMs()).toBe(initialTime + 10 * 60 * 1000);
    });

    it('should advance time by hours', () => {
      clock.advanceHours(2);
      expect(clock.nowMs()).toBe(initialTime + 2 * 60 * 60 * 1000);
    });

    it('should set time to specific value (number)', () => {
      const newTime = 1800000000000;
      clock.setTime(newTime);
      expect(clock.nowMs()).toBe(newTime);
    });

    it('should set time to specific value (Date)', () => {
      const newTime = new Date(1800000000000);
      clock.setTime(newTime);
      expect(clock.nowMs()).toBe(newTime.getTime());
    });

    it('should reset to initial time', () => {
      clock.advanceMinutes(30);
      clock.reset();
      expect(clock.nowMs()).toBe(initialTime);
    });

    it('should calculate window bucket correctly', () => {
      const windowMs = 5 * 60 * 1000;
      const bucket = clock.windowBucket(windowMs);
      expect(bucket).toBe(Math.floor(initialTime / windowMs));
    });

    it('should calculate age correctly', () => {
      const pastTime = new Date(initialTime - 5000).toISOString();
      expect(clock.ageMs(pastTime)).toBe(5000);
      expect(clock.ageSec(pastTime)).toBe(5);
    });

    it('should check older than threshold correctly', () => {
      const pastTime = new Date(initialTime - 10000).toISOString();
      expect(clock.isOlderThanMs(pastTime, 5000)).toBe(true);
      expect(clock.isOlderThanMs(pastTime, 15000)).toBe(false);
    });

    it('should check within window correctly', () => {
      const pastTime = new Date(initialTime - 3000).toISOString();
      expect(clock.isWithinWindow(pastTime, 5000)).toBe(true);
      expect(clock.isWithinWindow(pastTime, 2000)).toBe(false);
    });

    it('should return current time via getCurrentTime', () => {
      expect(clock.getCurrentTime()).toBe(initialTime);
      clock.advanceMs(500);
      expect(clock.getCurrentTime()).toBe(initialTime + 500);
    });

    it('should default to 0 if no initial time provided', () => {
      const defaultClock = new FakeClock();
      expect(defaultClock.nowMs()).toBe(0);
    });
  });

  describe('createFakeClockAt', () => {
    it('should create clock at specific ISO date', () => {
      const clock = createFakeClockAt('2024-01-15T10:30:00.000Z');
      expect(clock.nowIso()).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('createFakeClockNow', () => {
    it('should create clock at approximately current time', () => {
      const before = Date.now();
      const clock = createFakeClockNow();
      const after = Date.now();

      expect(clock.nowMs()).toBeGreaterThanOrEqual(before);
      expect(clock.nowMs()).toBeLessThanOrEqual(after);
    });
  });

  describe('Time Constants', () => {
    it('should have correct TIME_MS values', () => {
      expect(TIME_MS.SECOND).toBe(1000);
      expect(TIME_MS.MINUTE).toBe(60 * 1000);
      expect(TIME_MS.HOUR).toBe(60 * 60 * 1000);
      expect(TIME_MS.DAY).toBe(24 * 60 * 60 * 1000);
      expect(TIME_MS.WEEK).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should have correct WINDOW_MS values', () => {
      expect(WINDOW_MS.FIVE_MINUTES).toBe(5 * 60 * 1000);
      expect(WINDOW_MS.FIFTEEN_MINUTES).toBe(15 * 60 * 1000);
      expect(WINDOW_MS.THIRTY_MINUTES).toBe(30 * 60 * 1000);
      expect(WINDOW_MS.ONE_HOUR).toBe(60 * 60 * 1000);
    });
  });

  describe('FakeClock Determinism', () => {
    it('should produce deterministic results for time-based calculations', () => {
      const clock1 = new FakeClock(1700000000000);
      const clock2 = new FakeClock(1700000000000);

      // Advance both clocks the same way
      clock1.advanceMinutes(15);
      clock2.advanceMinutes(15);

      expect(clock1.nowMs()).toBe(clock2.nowMs());
      expect(clock1.nowIso()).toBe(clock2.nowIso());
      expect(clock1.windowBucket(5 * 60 * 1000)).toBe(clock2.windowBucket(5 * 60 * 1000));
    });

    it('should allow testing DEGRADED duration thresholds', () => {
      const clock = new FakeClock(1700000000000);
      const degradedEnteredAt = clock.nowIso();

      // Simulate time passing
      clock.advanceMinutes(10);
      expect(clock.ageMs(degradedEnteredAt)).toBe(10 * 60 * 1000);
      expect(clock.isOlderThanMs(degradedEnteredAt, 15 * 60 * 1000)).toBe(false); // Not yet P2

      clock.advanceMinutes(6); // Total 16 minutes
      expect(clock.isOlderThanMs(degradedEnteredAt, 15 * 60 * 1000)).toBe(true); // Now P2

      clock.advanceMinutes(15); // Total 31 minutes
      expect(clock.isOlderThanMs(degradedEnteredAt, 30 * 60 * 1000)).toBe(true); // Now P1
    });

    it('should allow testing cooldown periods', () => {
      const clock = new FakeClock(1700000000000);
      const resolvedAt = clock.nowIso();
      const cooldownMs = 30 * 60 * 1000; // 30 minutes

      // Immediately after resolve
      expect(clock.isWithinWindow(resolvedAt, cooldownMs)).toBe(true);

      // 20 minutes later - still in cooldown
      clock.advanceMinutes(20);
      expect(clock.isWithinWindow(resolvedAt, cooldownMs)).toBe(true);

      // 35 minutes later - cooldown expired
      clock.advanceMinutes(15);
      expect(clock.isWithinWindow(resolvedAt, cooldownMs)).toBe(false);
    });

    it('should allow testing flapping windows', () => {
      const clock = new FakeClock(1700000000000);
      const flappingWindowMs = 60 * 60 * 1000; // 60 minutes

      const flapTimes: string[] = [];

      // Record 3 flaps over 30 minutes
      flapTimes.push(clock.nowIso());
      clock.advanceMinutes(10);
      flapTimes.push(clock.nowIso());
      clock.advanceMinutes(10);
      flapTimes.push(clock.nowIso());

      // All flaps should be within window
      for (const flapTime of flapTimes) {
        expect(clock.isWithinWindow(flapTime, flappingWindowMs)).toBe(true);
      }

      // Advance past window
      clock.advanceMinutes(50);

      // First flap should now be outside window
      expect(clock.isWithinWindow(flapTimes[0], flappingWindowMs)).toBe(false);
    });
  });
});
