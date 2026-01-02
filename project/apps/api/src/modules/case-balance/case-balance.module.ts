import { Module } from '@nestjs/common';
import { CaseBalanceService } from './case-balance.service';
import { CaseBalanceController } from './case-balance.controller';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CaseBalanceController],
  providers: [CaseBalanceService],
  exports: [CaseBalanceService],
})
export class CaseBalanceModule {}
