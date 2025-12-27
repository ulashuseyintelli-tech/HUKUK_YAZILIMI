import { Module } from '@nestjs/common';
import { CaseLeaseController } from './case-lease.controller';
import { CaseLeaseService } from './case-lease.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CaseLeaseController],
  providers: [CaseLeaseService],
  exports: [CaseLeaseService],
})
export class CaseLeaseModule {}
