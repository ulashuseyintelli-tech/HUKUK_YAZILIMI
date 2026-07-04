// P4-5C-2 — bounded FAILED-retry backoff (SAF fonksiyonlar; redrive-backoff deseni). DB/Nest'siz unit-test edilebilir.
//
// Eligibility (cron PASS-FAILED): bir FAILED satır retry'a uygun iff
//   retryCount < MAX_ATTEMPTS  AND  now - lastRetryAt >= backoff(retryCount).
// backoff = min(maxMinutes, baseMinutes × 2^(retryCount-1)) — exponential, cap'li, jitter YOK (cron sıralı tek-concurrency).
// retryCount=1 (ilk fail sonrası; markExecutionFailed increment) → base; 2 → 2×base; 3 → 4×base (cap'e kadar).

/** retryCount için gereken backoff süresi (dakika). retryCount>=1 beklenir. */
export function backoffMinutes(retryCount: number, baseMinutes: number, maxMinutes: number): number {
  const exp = Math.max(0, retryCount - 1);
  return Math.min(maxMinutes, baseMinutes * Math.pow(2, exp));
}

/**
 * FAILED satır için backoff doldu mu (retry zamanı geldi mi). lastRetryAt null/undefined → sonsuz-eski sayılır → eligible
 * (pre-migration FAILED satır; markExecutionFailed post-5C-1 her zaman lastRetryAt yazar). now çağırandan geçer (deterministik test).
 */
export function isRetryBackoffElapsed(
  lastRetryAt: Date | null | undefined,
  retryCount: number,
  baseMinutes: number,
  maxMinutes: number,
  now: Date,
): boolean {
  if (lastRetryAt == null) return true;
  const elapsedMs = now.getTime() - lastRetryAt.getTime();
  return elapsedMs >= backoffMinutes(retryCount, baseMinutes, maxMinutes) * 60_000;
}
