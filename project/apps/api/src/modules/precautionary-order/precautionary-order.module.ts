import { Module } from '@nestjs/common';
import { PrecautionaryOrderController } from './precautionary-order.controller';
import { PrecautionaryOrderService } from './precautionary-order.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PrecautionaryOrderController],
  providers: [PrecautionaryOrderService],
  exports: [PrecautionaryOrderService],
})
export class PrecautionaryOrderModule {}
