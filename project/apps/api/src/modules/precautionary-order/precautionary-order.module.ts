import { Module } from '@nestjs/common';
import { PrecautionaryOrderController } from './precautionary-order.controller';
import { PrecautionaryOrderService } from './precautionary-order.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClaimItemModule } from '../claim-item/claim-item.module';

@Module({
  imports: [PrismaModule, ClaimItemModule],
  controllers: [PrecautionaryOrderController],
  providers: [PrecautionaryOrderService],
  exports: [PrecautionaryOrderService],
})
export class PrecautionaryOrderModule {}
