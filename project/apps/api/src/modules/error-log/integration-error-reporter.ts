import { Injectable } from "@nestjs/common";
import { ErrorLogService, LogErrorParams } from "./error-log.service";
import { redactPii, sanitizeMetadata } from "./error-log.sanitize";

export type IntegrationSource = "UYAP" | "CRON" | "API";

export interface IntegrationErrorInput {
  /** Yalnız BACKEND INTERNAL kaynaklar. İstemci buraya erişmez (/error-logs/log → FRONTEND kuralı korunur). */
  source: IntegrationSource;
  /** İşlem adı (endpoint alanına yazılır), örn. "uyap.queryCaseStatus" / "outbox.processOutboxActions". */
  operation: string;
  error: unknown;
  tenantId?: string;
  level?: "ERROR" | "WARN";
  /** Yalnız GÜVENLİ alanlar (sanitizeMetadata whitelist'i: retryCount, durationMs, externalStatusCode, safeErrorCode...). */
  metadata?: Record<string, unknown>;
}

/**
 * PR-3: UYAP / CRON / outbox gibi backend internal kaynaklardan ErrorLog'a GÜVENLİ besleme.
 *  - source YALNIZ backend internal'dan set edilir (UYAP/CRON/API).
 *  - message/stack PII-redacted; metadata whitelist'li (ham payload/HTML/taraf verisi/TCKN yazılmaz).
 *  - report() ASLA throw ETMEZ (fire-and-forget + swallow) → çağıran UYAP/cron/outbox akışını BOZMAZ.
 *  - Dedupe/sayım PR-2b upsert'i ile otomatik (aynı entegrasyon hatası flood yaratmaz).
 */
@Injectable()
export class IntegrationErrorReporter {
  constructor(private readonly errorLogService: ErrorLogService) {}

  async report(input: IntegrationErrorInput): Promise<void> {
    try {
      const err: any = input.error;
      const rawMessage =
        typeof err?.message === "string" ? err.message : err != null ? String(err) : "";
      const entry: LogErrorParams = {
        source: input.source,
        level: input.level ?? "ERROR",
        message: redactPii(rawMessage) || "(no message)",
        stack: redactPii(typeof err?.stack === "string" ? err.stack : undefined),
        endpoint: input.operation ? input.operation.slice(0, 300) : undefined,
        statusCode: typeof err?.statusCode === "number" ? err.statusCode : undefined,
        errorName: typeof err?.name === "string" ? err.name : undefined,
        tenantId: input.tenantId,
        metadata: sanitizeMetadata({
          ...(input.metadata ?? {}),
          safeIntegrationName: input.source,
        }),
      };
      await this.errorLogService.log(entry);
    } catch {
      // swallow — internal reporting çağıran iş akışını ASLA bozmaz.
    }
  }
}
