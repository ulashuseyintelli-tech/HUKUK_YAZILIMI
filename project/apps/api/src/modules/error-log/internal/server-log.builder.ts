// PR-2a/2b: Backend internal (ExceptionFilter) → güvenli ErrorLog girdisi. source=API/level=ERROR.
// message/stack PII'den arındırılır. fingerprint/activeDedupeKey ARTIK ErrorLogService.log içinde
// hesaplanır (kolon); builder yalnız errorName'i taşır. metadata büyütülmez (requestId + isPrisma).
import type { LogErrorParams } from "../error-log.service";
import { redactPii } from "../error-log.sanitize";

export interface ServerLogInput {
  status: number;
  route?: string;
  method?: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  errorName?: string;
  message?: string;
  stack?: string;
  source?: string; // default 'API'
  isPrisma?: boolean;
}

export function buildServerLogEntry(input: ServerLogInput): LogErrorParams {
  const rawMessage = input.message && input.message.length ? input.message : input.errorName;
  return {
    tenantId: input.tenantId,
    userId: input.userId,
    source: input.source ?? "API",
    level: "ERROR",
    errorName: input.errorName,
    message: redactPii(rawMessage) || "(no message)",
    stack: redactPii(input.stack),
    endpoint: redactPii(input.route ? input.route.slice(0, 300) : undefined),
    method: typeof input.method === "string" ? input.method.toUpperCase().slice(0, 10) : undefined,
    statusCode: input.status,
    metadata: {
      requestId: input.requestId,
      ...(input.isPrisma ? { prisma: true } : {}),
    },
  };
}
