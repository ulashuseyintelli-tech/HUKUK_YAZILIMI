import { Module } from '@nestjs/common';
import { CaseJudgmentController } from './case-judgment.controller';
import { CaseJudgmentService } from './case-judgment.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [PrismaModule, CaseViewScopeModule], // F02 P3-D3b-1: CaseViewScopeGuard servisi (yoksa kapı 403 ile kapanır)
  controllers: [CaseJudgmentController],
  providers: [CaseJudgmentService],
  exports: [CaseJudgmentService],
})
export class CaseJudgmentModule {}
