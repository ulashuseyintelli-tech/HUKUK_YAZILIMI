import { Module } from '@nestjs/common';
import { PaymentInstructionController } from './payment-instruction.controller';
import { PaymentInstructionService } from './payment-instruction.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [CaseViewScopeModule, PrismaModule],
  controllers: [PaymentInstructionController],
  providers: [PaymentInstructionService],
  exports: [PaymentInstructionService],
})
export class PaymentInstructionModule {}
