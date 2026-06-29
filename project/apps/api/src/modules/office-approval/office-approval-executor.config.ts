// P4-5B — OfficeApproval executor cron SAF config okuyucu (error-log retention deseni).
// process.env'i cron TICK anında okur (boot'ta değil); .env dosyalarına dokunulmaz. Nest/DB'siz unit-test edilebilir.
// AKTİVASYON: yalnız OFFICE_APPROVAL_EXECUTOR_ENABLED=true + API restart ile çalışır (owner-gated; default kapalı).

export interface OfficeApprovalExecutorConfig {
  /** Yalnız OFFICE_APPROVAL_EXECUTOR_ENABLED === "true" → cron iş yapar; aksi (yokluk dahil) → no-op (fail-safe KAPALI). */
  enabled: boolean;
  /** Tick başına taranacak satır üst sınırı (reconcile-pass + scan-pass ayrı ayrı uygular). */
  batchSize: number;
  /** P4-5C-1: precise stuck-RUNNING timeout (dakika). runningStartedAt bundan eski RUNNING satırlar reconcile edilir. */
  stuckTimeoutMinutes: number;
  /** P4-5C-2: bounded FAILED-retry deneme üst sınırı. retryCount >= maxAttempts → exhausted (tekrar denenmez). */
  maxAttempts: number;
  /** P4-5C-2: exponential backoff base (dakika). backoff = min(max, base × 2^(retryCount-1)). */
  backoffBaseMinutes: number;
  /** P4-5C-2: exponential backoff cap (dakika). */
  backoffMaxMinutes: number;
}

// Default'lar (env verilmezse). batchSize=50 (R5); stuckTimeoutMinutes=10. P4-5C-2: maxAttempts=3 (CHANGE_STATUS hukuki
// mutasyon, transient değil); backoff base=15 / cap=60 dk (30dk tick'e hizalı; sub-tick backoff anlamsız).
const DEFAULTS = { batchSize: 50, stuckTimeoutMinutes: 10, maxAttempts: 3, backoffBaseMinutes: 15, backoffMaxMinutes: 60 } as const;

/** Pozitif tam sayı parse; geçersiz/eksik/<=0/ondalık → fallback. */
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

/** Yalnız "true" (case-insensitive) → true; aksi (yokluk dahil) → false (fail-safe kapalı). */
function parseBool(raw: string | undefined): boolean {
  if (!raw) return false;
  return String(raw).trim().toLowerCase() === 'true';
}

export function readOfficeApprovalExecutorConfig(
  env: NodeJS.ProcessEnv = process.env,
): OfficeApprovalExecutorConfig {
  return {
    enabled: parseBool(env.OFFICE_APPROVAL_EXECUTOR_ENABLED),
    batchSize: parsePositiveInt(env.OFFICE_APPROVAL_EXECUTOR_BATCH_SIZE, DEFAULTS.batchSize),
    stuckTimeoutMinutes: parsePositiveInt(
      env.OFFICE_APPROVAL_EXECUTOR_STUCK_TIMEOUT_MINUTES,
      DEFAULTS.stuckTimeoutMinutes,
    ),
    maxAttempts: parsePositiveInt(env.OFFICE_APPROVAL_EXECUTOR_MAX_ATTEMPTS, DEFAULTS.maxAttempts),
    backoffBaseMinutes: parsePositiveInt(
      env.OFFICE_APPROVAL_EXECUTOR_BACKOFF_BASE_MINUTES,
      DEFAULTS.backoffBaseMinutes,
    ),
    backoffMaxMinutes: parsePositiveInt(
      env.OFFICE_APPROVAL_EXECUTOR_BACKOFF_MAX_MINUTES,
      DEFAULTS.backoffMaxMinutes,
    ),
  };
}
