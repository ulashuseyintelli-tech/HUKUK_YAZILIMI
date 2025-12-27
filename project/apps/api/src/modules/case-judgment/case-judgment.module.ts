import { Module } from '@nestjs/common';
import { CaseJudgmentController } from './case-judgment.controller';
import { CaseJudgmentService } from './case-judgment.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CaseJudgmentController],
  providers: [CaseJudgmentService],
  exports: [CaseJudgmentService],
})
export class CaseJudgmentModule {}
