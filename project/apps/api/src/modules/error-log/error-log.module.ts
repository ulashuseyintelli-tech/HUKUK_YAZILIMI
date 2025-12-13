import { Module, Global } from '@nestjs/common';
import { ErrorLogService } from './error-log.service';
import { ErrorLogController } from './error-log.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ErrorLogController],
  providers: [ErrorLogService],
  exports: [ErrorLogService],
})
export class ErrorLogModule {}
