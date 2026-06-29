import { Module, Global } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErrorLogService } from './error-log.service';
import { ErrorLogController } from './error-log.controller';
import { ErrorFloodGuard } from './internal/error-flood-guard';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { IntegrationErrorReporter } from './integration-error-reporter';
import { ErrorLogRetentionService } from './retention/error-log-retention.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ErrorLogController],
  providers: [
    ErrorLogService,
    ErrorFloodGuard,
    // PR-3: UYAP/CRON/outbox internal kaynakları için güvenli besleme servisi.
    IntegrationErrorReporter,
    // PR-6: config-tabanlı retention temizliği (cron 03:30, enabled-flag, hard delete).
    ErrorLogRetentionService,
    // PR-2a: global ExceptionFilter. @Global modülde APP_FILTER → tüm uygulamaya kaydolur,
    // DI ile ErrorLogService + ErrorFloodGuard'a erişir.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [ErrorLogService, IntegrationErrorReporter],
})
export class ErrorLogModule {}
