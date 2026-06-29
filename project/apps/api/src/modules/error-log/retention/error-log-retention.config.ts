// PR-6: Hata logu retention temizliği için SAF config okuyucu.
// process.env'i cron tick'inde okur (K5). .env dosyalarına dokunulmaz; prod default'lar
// burada gömülü, dev/local override env ile verilir. Nest/DB'siz unit-test edilebilir.

export interface ErrorLogRetentionConfig {
  /** K3: yalnız ERROR_LOG_RETENTION_ENABLED === "true" ise silme çalışır; aksi halde NO-OP. */
  enabled: boolean;
  /** Batch/chunk başına işlenecek kayıt sayısı. */
  batchSize: number;
  /** resolved fallback (source FRONTEND/API/UYAP/CRON DEĞİL) gün eşiği. */
  resolvedDays: number;
  /** resolved + source=FRONTEND gün eşiği. */
  frontendDays: number;
  /** resolved + source ∈ {API,UYAP,CRON} gün eşiği. */
  apiInternalDays: number;
  /** unresolved gün eşiği — floor uygulanmış (asla < 7). */
  unresolvedDays: number;
}

// Prod default'lar (env verilmezse).
const DEFAULTS = {
  resolvedDays: 90,
  frontendDays: 30,
  apiInternalDays: 90,
  unresolvedDays: 180,
  batchSize: 1000,
} as const;

// K4: unresolved hiçbir ortamda 7 günden aza inemez. UNRESOLVED_DAYS=1 verilse bile effective=7.
export const UNRESOLVED_FLOOR_DAYS = 7;

// API/UYAP/CRON = "internal" kaynaklar; FRONTEND ayrı; geri kalan = fallback.
export const INTERNAL_SOURCES = ['API', 'UYAP', 'CRON'] as const;

/** Pozitif tam sayı parse; geçersiz/eksik/<=0/ondalık → fallback (K: invalid → default). */
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

export function readErrorLogRetentionConfig(
  env: NodeJS.ProcessEnv = process.env,
): ErrorLogRetentionConfig {
  const unresolvedRaw = parsePositiveInt(env.ERROR_LOG_RETENTION_UNRESOLVED_DAYS, DEFAULTS.unresolvedDays);
  return {
    enabled: parseBool(env.ERROR_LOG_RETENTION_ENABLED),
    batchSize: parsePositiveInt(env.ERROR_LOG_RETENTION_BATCH_SIZE, DEFAULTS.batchSize),
    resolvedDays: parsePositiveInt(env.ERROR_LOG_RETENTION_RESOLVED_DAYS, DEFAULTS.resolvedDays),
    frontendDays: parsePositiveInt(env.ERROR_LOG_RETENTION_FRONTEND_DAYS, DEFAULTS.frontendDays),
    apiInternalDays: parsePositiveInt(env.ERROR_LOG_RETENTION_API_INTERNAL_DAYS, DEFAULTS.apiInternalDays),
    // K4 floor: env 1 verse bile max(.,7).
    unresolvedDays: Math.max(unresolvedRaw, UNRESOLVED_FLOOR_DAYS),
  };
}
