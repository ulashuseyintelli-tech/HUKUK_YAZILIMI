/** @jest-environment node */
import { backoffMinutes, isRetryBackoffElapsed } from '../office-approval-executor-backoff';

/**
 * P4-5C-2 — bounded-retry backoff saf fonksiyon testleri. Deterministik (now param). base=15, cap=60, MAX=3 senaryosu.
 */
describe('P4-5C-2 backoffMinutes (exponential, capped)', () => {
  it('retryCount=1 → base (15)', () => expect(backoffMinutes(1, 15, 60)).toBe(15));
  it('retryCount=2 → 2×base (30)', () => expect(backoffMinutes(2, 15, 60)).toBe(30));
  it('retryCount=3 → 4×base (60, cap sınırında)', () => expect(backoffMinutes(3, 15, 60)).toBe(60));
  it('retryCount=4 → 8×base=120 ama cap 60', () => expect(backoffMinutes(4, 15, 60)).toBe(60));
  it('retryCount=0/negatif → exp=0 → base (defansif)', () => {
    expect(backoffMinutes(0, 15, 60)).toBe(15);
    expect(backoffMinutes(-5, 15, 60)).toBe(15);
  });
});

describe('P4-5C-2 isRetryBackoffElapsed', () => {
  const now = new Date(2026, 5, 29, 12, 0, 0);
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  it('lastRetryAt null → eligible (pre-migration / sonsuz-eski)', () => {
    expect(isRetryBackoffElapsed(null, 1, 15, 60, now)).toBe(true);
    expect(isRetryBackoffElapsed(undefined, 2, 15, 60, now)).toBe(true);
  });
  it('retryCount=1: 15dk geçtiyse eligible, geçmediyse değil', () => {
    expect(isRetryBackoffElapsed(minsAgo(15), 1, 15, 60, now)).toBe(true); // tam sınır
    expect(isRetryBackoffElapsed(minsAgo(20), 1, 15, 60, now)).toBe(true);
    expect(isRetryBackoffElapsed(minsAgo(14), 1, 15, 60, now)).toBe(false);
  });
  it('retryCount=2: 30dk gerekir', () => {
    expect(isRetryBackoffElapsed(minsAgo(20), 2, 15, 60, now)).toBe(false); // 20<30
    expect(isRetryBackoffElapsed(minsAgo(30), 2, 15, 60, now)).toBe(true);
  });
  it('retryCount=3: 60dk (cap) gerekir', () => {
    expect(isRetryBackoffElapsed(minsAgo(45), 3, 15, 60, now)).toBe(false);
    expect(isRetryBackoffElapsed(minsAgo(60), 3, 15, 60, now)).toBe(true);
  });
});
