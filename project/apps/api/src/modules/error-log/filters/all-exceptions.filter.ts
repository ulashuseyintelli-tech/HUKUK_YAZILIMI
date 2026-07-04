// PR-2a: Global backend ExceptionFilter. TÜM yakalanmamış hataları yakalar.
//  - HTTP yanıt ŞEKLİ default Nest davranışıyla AYNI korunur (HttpException.getResponse() passthrough).
//    → mevcut 4xx/validation gövdeleri (client.ts error.body.message okur) REGRESYON YEMEZ.
//  - NOISE EXCLUSION: yalnız status>=500 (sunucu hatası) ErrorLog'a yazılır; 400/404/401/403/validation HARİÇ.
//  - FLOOD GUARD: aynı fingerprint penceresinde tekrar → DB write bastırılır (ŞEMA YOK; metadata.fingerprint).
//  - LOGGING ISOLATION: loglama hattındaki HİÇBİR hata asıl HTTP yanıtını bozmaz (fire-and-forget + try/catch).
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { ErrorLogService } from "../error-log.service";
import { ErrorFloodGuard } from "../internal/error-flood-guard";
import { computeFingerprint } from "../internal/error-fingerprint";
import { buildServerLogEntry } from "../internal/server-log.builder";
import { redactPii } from "../error-log.sanitize";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly fallback = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly errorLogService: ErrorLogService,
    private readonly floodGuard: ErrorFloodGuard,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res: any = ctx.getResponse();
    const req: any = ctx.getRequest();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawPayload = isHttp
      ? exception.getResponse()
      : { statusCode: status, message: "Internal server error" };
    // Nest default davranışı: string ise {statusCode,message}, obje ise aynen geçir.
    const body = typeof rawPayload === "string" ? { statusCode: status, message: rawPayload } : rawPayload;

    // NOISE EXCLUSION: yalnız sunucu hataları (>=500) loglanır.
    if (status >= 500) {
      try {
        const err = exception as any;
        const name: string | undefined = err?.name;
        const stack: string | undefined = err?.stack;
        const message: string | undefined = err?.message;
        const isPrisma = typeof name === "string" && name.startsWith("PrismaClient");
        const tenantId: string | undefined = req?.user?.tenantId;
        const entry = buildServerLogEntry({
          status,
          route: req?.url,
          method: req?.method,
          tenantId,
          userId: req?.user?.id,
          requestId: req?.requestId,
          errorName: name,
          message,
          stack,
          isPrisma,
        });
        // PR-2b: DB persistence HER ZAMAN. Dedupe/sayım ErrorLogService.log içinde upsert ile yapılır
        // (aynı aktif olay → occurrenceCount++). FloodGuard ARTIK DB kararını VERMEZ — yoksa sayılması
        // gereken tekrarları yutardı. LOGGING ISOLATION: fire-and-forget + swallow.
        void this.errorLogService.log(entry).catch(() => undefined);
        // FloodGuard yalnız KONSOL gürültüsünü kısar (DB kararı DEĞİL).
        const consoleFp = computeFingerprint({ tenantId, source: "API", statusCode: status, name, stack });
        if (this.floodGuard.shouldPersist(consoleFp)) {
          this.fallback.error(`HTTP ${status} ${req?.method ?? ""} ${redactPii(req?.url) ?? ""}`);
        }
      } catch (e) {
        // Loglama hattındaki hata asıl yanıtı BOZMAMALI.
        this.fallback.error("error-log pipeline failed", e instanceof Error ? e.stack : String(e));
      }
    }

    if (res && !res.headersSent && typeof res.status === "function") {
      res.status(status).json(body);
    }
  }
}
