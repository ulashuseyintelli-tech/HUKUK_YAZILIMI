import { Module, Global } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErrorLogService } from './error-log.service';
import { ErrorLogController } from './error-log.controller';
import { ErrorFloodGuard } from './internal/error-flood-guard';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ErrorLogController],
  providers: [
    ErrorLogService,
    ErrorFloodGuard,
    // PR-2a: global ExceptionFilter. @Global modülde APP_FILTER → tüm uygulamaya kaydolur,
    // DI ile ErrorLogService + ErrorFloodGuard'a erişir.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [ErrorLogService],
})
export class ErrorLogModule {}
