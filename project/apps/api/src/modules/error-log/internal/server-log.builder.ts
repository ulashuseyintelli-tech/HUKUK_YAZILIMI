// PR-2a: Backend internal (ExceptionFilter) → güvenli ErrorLog kaydı. İSTEMCİ değil sunucu
// kaynaklı olduğu için source burada API/CRON/UYAP olabilir (default API). message/stack PII'den
// arındırılır; metadata yalnız güvenli internal alanlar (requestId/fingerprint) — ham body YOK.
import type { LogErrorParams } from "../error-log.service";
import { redactPii } from "../error-log.sanitize";

export interface ServerLogInput {
  status: number;
  route?: string;
  method?: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  fingerprint: string;
  name?: string;
  message?: string;
  stack?: string;
  source?: string; // default 'API'
  isPrisma?: boolean;
}

export function buildServerLogEntry(input: ServerLogInput): LogErrorParams {
  const rawMessage = input.message && input.message.length ? input.message : input.name;
  return {
    tenantId: input.tenantId,
    userId: input.userId,
    source: input.source ?? "API",
    level: "ERROR",
    message: redactPii(rawMessage) || "(no message)",
    stack: redactPii(input.stack),
    endpoint: redactPii(input.route ? input.route.slice(0, 300) : undefined),
    method: typeof input.method === "string" ? input.method.toUpperCase().slice(0, 10) : undefined,
    statusCode: input.status,
    metadata: {
      requestId: input.requestId,
      fingerprint: input.fingerprint,
      ...(input.isPrisma ? { prisma: true } : {}),
    },
  };
}
