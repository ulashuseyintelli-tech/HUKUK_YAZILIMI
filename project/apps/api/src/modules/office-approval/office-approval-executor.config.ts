// P4-5B — OfficeApproval executor cron SAF config okuyucu (error-log retention deseni).
// process.env'i cron TICK anında okur (boot'ta değil); .env dosyalarına dokunulmaz. Nest/DB'siz unit-test edilebilir.
// AKTİVASYON: yalnız OFFICE_APPROVAL_EXECUTOR_ENABLED=true + API restart ile çalışır (owner-gated; default kapalı).

export interface OfficeApprovalExecutorConfig {
  /** Yalnız OFFICE_APPROVAL_EXECUTOR_ENABLED === "true" → cron iş yapar; aksi (yokluk dahil) → no-op (fail-safe KAPALI). */
  enabled: boolean;
  /** Tick başına taranacak satır üst sınırı (reconcile-pass + scan-pass ayrı ayrı uygular). */
  batchSize: number;
}

// Default'lar (env verilmezse). batchSize=50 (R5; ilk-tick blast'ı sınırlar, gerekirse env ile artırılır).
const DEFAULTS = { batchSize: 50 } as const;

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
  };
}
