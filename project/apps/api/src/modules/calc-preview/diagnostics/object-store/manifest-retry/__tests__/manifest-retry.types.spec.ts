/**
 * Manifest Retry Types Tests
 * 
 * Phase 10 - Task 10.1.4
 * 
 * Tests for backoff calculation and type contracts.
 */

import {
  BACKOFF_CONFIG,
  calculateBackoff,
  calculateNextAttemptAt,
} from '../manifest-retry.types';

describe('BACKOFF_CONFIG', () => {
  it('should have locked values', () => {
    expect(BACKOFF_CONFIG.baseMs).toBe(30_000);        // 30 seconds
    expect(BACKOFF_CONFIG.multiplier).toBe(4);         // 4x per attempt
    expect(BACKOFF_CONFIG.maxDelayMs).toBe(7_200_000); // 2 hours
    expect(BACKOFF_CONFIG.maxAttempts).toBe(7);        // 7 attempts
    expect(BACKOFF_CONFIG.leaseMs).toBe(60_000);       // 60 seconds
  });
});

describe('calculateBackoff', () => {
  // Mock Math.random for deterministic tests
  let originalRandom: () => number;
  
  beforeEach(() => {
    originalRandom = Math.random;
  });
  
  afterEach(() => {
    Math.random = originalRandom;
  });
  
  describe('base delay calculation (without jitter)', () => {
    beforeEach(() => {
      // Set jitter to 1.0 (no jitter effect)
      Math.random = () => 0.5; // 0.5 + 0.5 = 1.0
    });
    
    it('attempt 0: 30s base', () => {
      const delay = calculateBackoff(0);
      expect(delay).toBe(30_000);
    });
    
    it('attempt 1: 2m (30s * 4)', () => {
      const delay = calculateBackoff(1);
      expect(delay).toBe(120_000); // 2 minutes
    });
    
    it('attempt 2: 8m (30s * 16)', () => {
      const delay = calculateBackoff(2);
      expect(delay).toBe(480_000); // 8 minutes
    });
    
    it('attempt 3: 32m (30s * 64)', () => {
      const delay = calculateBackoff(3);
      expect(delay).toBe(1_920_000); // 32 minutes
    });
    
    it('attempt 4: 2h (capped at max)', () => {
      const delay = calculateBackoff(4);
      // 30s * 256 = 7,680,000 > 7,200,000 (max)
      expect(delay).toBe(7_200_000); // 2 hours (capped)
    });
    
    it('attempt 5: 2h (capped)', () => {
      const delay = calculateBackoff(5);
      expect(delay).toBe(7_200_000);
    });
    
    it('attempt 6: 2h (capped)', () => {
      const delay = calculateBackoff(6);
      expect(delay).toBe(7_200_000);
    });
  });
  
  describe('jitter application', () => {
    it('minimum jitter (0.5x)', () => {
      Math.random = () => 0; // 0.5 + 0 = 0.5
      const delay = calculateBackoff(0);
      expect(delay).toBe(15_000); // 30s * 0.5
    });
    
    it('maximum jitter (1.5x)', () => {
      Math.random = () => 1; // 0.5 + 1 = 1.5
      const delay = calculateBackoff(0);
      expect(delay).toBe(45_000); // 30s * 1.5
    });
    
    it('jitter range for attempt 1', () => {
      // Min: 120s * 0.5 = 60s
      Math.random = () => 0;
      expect(calculateBackoff(1)).toBe(60_000);
      
      // Max: 120s * 1.5 = 180s
      Math.random = () => 1;
      expect(calculateBackoff(1)).toBe(180_000);
    });
    
    it('jitter range for capped delay', () => {
      // Even at max delay, jitter applies
      // Min: 2h * 0.5 = 1h
      Math.random = () => 0;
      expect(calculateBackoff(5)).toBe(3_600_000);
      
      // Max: 2h * 1.5 = 3h (but base is capped at 2h)
      Math.random = () => 1;
      expect(calculateBackoff(5)).toBe(10_800_000);
    });
  });
  
  describe('cumulative delay bounds', () => {
    it('worst case cumulative delay < 12 hours', () => {
      // With max jitter (1.5x) for all attempts
      // Attempts 4,5,6 are capped at 2h * 1.5 = 3h each = 9h
      // Plus earlier attempts ~1h = ~10h total
      Math.random = () => 1;
      
      let cumulative = 0;
      for (let i = 0; i < 7; i++) {
        cumulative += calculateBackoff(i);
      }
      
      // Should be under 12 hours (realistic worst case)
      expect(cumulative).toBeLessThan(12 * 60 * 60 * 1000);
    });
    
    it('best case cumulative delay > 1 hour', () => {
      // With min jitter (0.5x) for all attempts
      Math.random = () => 0;
      
      let cumulative = 0;
      for (let i = 0; i < 7; i++) {
        cumulative += calculateBackoff(i);
      }
      
      // Should be over 1 hour
      expect(cumulative).toBeGreaterThan(1 * 60 * 60 * 1000);
    });
  });
});

describe('calculateNextAttemptAt', () => {
  let originalRandom: () => number;
  let originalNow: () => number;
  
  beforeEach(() => {
    originalRandom = Math.random;
    originalNow = Date.now;
    
    // Fixed time for tests
    Date.now = () => new Date('2026-02-02T12:00:00Z').getTime();
    // No jitter
    Math.random = () => 0.5;
  });
  
  afterEach(() => {
    Math.random = originalRandom;
    Date.now = originalNow;
  });
  
  it('returns Date object', () => {
    const result = calculateNextAttemptAt(0);
    expect(result).toBeInstanceOf(Date);
  });
  
  it('attempt 0: now + 30s', () => {
    const result = calculateNextAttemptAt(0);
    const expected = new Date('2026-02-02T12:00:30Z');
    expect(result.getTime()).toBe(expected.getTime());
  });
  
  it('attempt 1: now + 2m', () => {
    const result = calculateNextAttemptAt(1);
    const expected = new Date('2026-02-02T12:02:00Z');
    expect(result.getTime()).toBe(expected.getTime());
  });
  
  it('attempt 4: now + 2h (capped)', () => {
    const result = calculateNextAttemptAt(4);
    const expected = new Date('2026-02-02T14:00:00Z');
    expect(result.getTime()).toBe(expected.getTime());
  });
});
