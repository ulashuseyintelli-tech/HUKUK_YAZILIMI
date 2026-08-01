import { IntegrationErrorReporter } from "../modules/error-log/integration-error-reporter";

/**
 * W3-F04-CRON-TERMINAL-FAILURE-VISIBILITY-R01 — canonical cron terminal-failure
 * reporting call. `scheduler.service.ts`'nin halihazirda sertifikali private
 * `reportCronError()` deseninin (fire-and-forget + swallow, PR-3) paylasilan/
 * disa-aktarilan esdegeridir; ayni `IntegrationErrorReporter.report()` cagrisina
 * delege eder (ASLA throw etmez — cagiran cron akisini bozmaz).
 *
 * jobId konvansiyonu: `${moduleAdi}.${metodAdi}` (orn. `automation.updateDaysLeft`),
 * scheduler.service.ts'nin kendi `scheduler.${operation}` desenine paralel.
 *
 * `.catch(() => {})`: `IntegrationErrorReporter.report()` kendi govdesini zaten
 * try/catch ile sarar (asla reddetmez) — ama bu ek savunma, sozlesme ihlal
 * edilse dahi (orn. gelecekte bir refactor) unhandled rejection'in cron
 * akisini/process'i etkilemesini yapisal olarak imkansiz kilar.
 */
export function reportCronJobFailure(
  reporter: IntegrationErrorReporter,
  jobId: string,
  error: unknown,
  options?: { tenantId?: string; reasonCode?: string; metadata?: Record<string, unknown> },
): void {
  void reporter
    .report({
      source: "CRON",
      operation: jobId,
      error,
      tenantId: options?.tenantId,
      metadata: {
        ...(options?.metadata ?? {}),
        outcome: "FAILED_TERMINAL",
        reasonCode: options?.reasonCode ?? "UNHANDLED_EXCEPTION",
      },
    })
    .catch(() => {});
}
