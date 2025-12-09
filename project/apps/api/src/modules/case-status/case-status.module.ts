import { Module } from '@nestjs/common';
import { CaseStatusService } from './case-status.service';
import { CaseStatusController } from './case-status.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CaseStatusController],
  providers: [CaseStatusService],
  exports: [CaseStatusService],
})
export class CaseStatusModule {}
