import { Module, Global } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErrorLogService } from './error-log.service';
import { ErrorLogController } from './error-log.controller';
import { ErrorFloodGuard } from './internal/error-flood-guard';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { IntegrationErrorReporter } from './integration-error-reporter';
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
    // PR-2a: global ExceptionFilter. @Global modülde APP_FILTER → tüm uygulamaya kaydolur,
    // DI ile ErrorLogService + ErrorFloodGuard'a erişir.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [ErrorLogService, IntegrationErrorReporter],
})
export class ErrorLogModule {}
