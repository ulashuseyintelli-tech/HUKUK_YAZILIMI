/**
 * W3-F03-SCHEDULER-TIMEZONE-DECLARATION-R01 — canonical scheduler timezone policy.
 *
 * Runtime-bound @Cron jobs must never rely on the host/container process.env.TZ.
 * @nestjs/schedule's `timeZone` cron option is evaluated independently of
 * process.env.TZ (empirically confirmed by the pre-existing errorLogRetention
 * job, which already fires correctly at Europe/Istanbul time under the deploy
 * stack's TZ=UTC pin). That UTC pin (docker/docker-compose.prod.yml,
 * docker/Dockerfile.api) exists for an unrelated, already-ratified reason —
 * making interest/legal-deadline DATE MATH TZ-invariant
 * (.kiro/specs/legal-kernel/20-legal-time-adoption-decision.md) — and is left
 * untouched here. Process TZ and per-job cron TZ are two independent levers;
 * this module only ever governs the latter.
 *
 * Every runtime-bound cron in this codebase is a Turkish legal/business-process
 * job (Nafaka, Tebligat, İhbarname, Resmi Gazete, TCMB rate sync, ...), so a
 * single canonical value covers all of them today. `resolveSchedulerTimezone`
 * still accepts an optional job-class identifier so a future, evidenced
 * per-class exception would not require redesigning every call site.
 */

export const SCHEDULER_TIMEZONE = 'Europe/Istanbul' as const;

const VALID_SCHEDULER_TIMEZONES: ReadonlySet<string> = new Set([SCHEDULER_TIMEZONE]);

/** Resolves the canonical timezone for a scheduled job. */
export function resolveSchedulerTimezone(_jobClass?: string): string {
  return SCHEDULER_TIMEZONE;
}

/**
 * Fail-closed IANA validity + allowlist check. Never falls back silently —
 * throws on anything that is not a real, canonically-approved IANA zone.
 */
export function assertValidSchedulerTimezone(timeZone: string): void {
  if (!isParsableIanaTimezone(timeZone) || !VALID_SCHEDULER_TIMEZONES.has(timeZone)) {
    throw new Error(`INVALID_SCHEDULER_TIMEZONE: ${timeZone}`);
  }
}

function isParsableIanaTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
