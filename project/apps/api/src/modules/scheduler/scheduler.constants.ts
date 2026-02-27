/**
 * Scheduler Batch Pagination Sabitleri
 *
 * Faz 0b Stabilizasyon — Task 1.1
 * Tum degerler env-configurable.
 */

/** Tek batch'te cekilecek kayit sayisi */
export const SCHED_BATCH_SIZE = parseInt(
  process.env.SCHED_BATCH_SIZE || '50',
  10,
);

/** Tek cron run'inda maksimum batch sayisi */
export const SCHED_MAX_BATCHES = parseInt(
  process.env.SCHED_MAX_BATCHES || '10',
  10,
);

/** Tek cron run'inda islenecek maksimum toplam kayit */
export const SCHED_MAX_TOTAL = parseInt(
  process.env.SCHED_MAX_TOTAL || '500',
  10,
);
