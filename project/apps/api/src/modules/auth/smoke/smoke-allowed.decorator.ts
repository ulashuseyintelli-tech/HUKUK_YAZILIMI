import { SetMetadata } from "@nestjs/common";

/**
 * C36 — SMOKE ALLOWLIST metadata anahtarı.
 *
 * FAIL-CLOSED SÖZLEŞME: bu metadata'yı TAŞIMAYAN her route, smoke token ile
 * çağrıldığında `SmokeAuthorizationGuard` tarafından REDDEDİLİR. Yani yeni eklenen
 * bir route hiçbir şey yapmadan otomatik olarak DENY tarafındadır; izin AÇIK bir
 * eylemdir, varsayılan değildir.
 */
export const SMOKE_ALLOWED_KEY = "c36:smoke-allowed";

/**
 * Bu route'un SMOKE principal tarafından çağrılabileceğini AÇIKÇA bildirir.
 *
 * Owner hükmü geregi allowlist en fazla şunları kapsayabilir:
 *   1. smoke login
 *   2. `GET /auth/me`
 *   3. revoke / session invalidation
 *   4. (zorunluluğu kanıtlanırsa) self-credential rotation — BU SÜRÜMDE UYGULANMADI
 *
 * Business (Office/Lawyer/Staff/User admin/Case/Client/finance/approval/notification/
 * cron/file/publication/tenant-config) route'larına BU DEKORATÖR EKLENEMEZ; mimari
 * test bunu mekanik olarak zorlar.
 */
export const SmokeAllowed = () => SetMetadata(SMOKE_ALLOWED_KEY, true);
