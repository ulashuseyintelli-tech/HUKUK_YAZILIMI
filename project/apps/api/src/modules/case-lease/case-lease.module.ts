import { Module } from '@nestjs/common';
import { CaseLeaseController } from './case-lease.controller';
import { CaseLeaseService } from './case-lease.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [PrismaModule, CaseViewScopeModule], // F02 P3-D3b-1: CaseViewScopeGuard servisi (yoksa kapı 403 ile kapanır)
  controllers: [CaseLeaseController],
  providers: [CaseLeaseService],
  exports: [CaseLeaseService],
})
export class CaseLeaseModule {}
