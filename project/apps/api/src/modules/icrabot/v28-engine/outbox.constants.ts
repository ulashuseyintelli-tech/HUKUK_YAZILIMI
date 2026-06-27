export const DEFAULT_ICRABOT_OUTBOX_MAX_ATTEMPTS = 8;
export const DEFAULT_ICRABOT_OUTBOX_BATCH_SIZE = 50;
export const DEFAULT_ICRABOT_OUTBOX_RETRY_BASE_MS = 60_000;

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getIcrabotOutboxMaxAttempts(): number {
  return parsePositiveIntegerEnv(
    'ICRABOT_OUTBOX_MAX_ATTEMPTS',
    DEFAULT_ICRABOT_OUTBOX_MAX_ATTEMPTS,
  );
}

export function getIcrabotOutboxBatchSize(): number {
  return parsePositiveIntegerEnv(
    'ICRABOT_OUTBOX_BATCH_SIZE',
    DEFAULT_ICRABOT_OUTBOX_BATCH_SIZE,
  );
}

export function getIcrabotOutboxRetryBaseMs(): number {
  return parsePositiveIntegerEnv(
    'ICRABOT_OUTBOX_RETRY_BASE_MS',
    DEFAULT_ICRABOT_OUTBOX_RETRY_BASE_MS,
  );
}

export function isIcrabotOutboxCronEnabled(): boolean {
  return process.env.ICRABOT_OUTBOX_CRON_ENABLED?.toLowerCase() === 'true';
}
