import { Module } from '@nestjs/common';
import { PaymentInstructionController } from './payment-instruction.controller';
import { PaymentInstructionService } from './payment-instruction.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentInstructionController],
  providers: [PaymentInstructionService],
  exports: [PaymentInstructionService],
})
export class PaymentInstructionModule {}
