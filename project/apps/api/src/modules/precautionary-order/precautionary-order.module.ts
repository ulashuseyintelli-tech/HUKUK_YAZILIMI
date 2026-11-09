import { Module } from '@nestjs/common';
import { PrecautionaryOrderController } from './precautionary-order.controller';
import { PrecautionaryOrderService } from './precautionary-order.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClaimItemModule } from '../claim-item/claim-item.module';
// F02 P3 tarama S9: okuma kapıları (CaseViewScopeGuard / CaseObjectViewScopeGuard) bu servisi ister; yoksa bayrak açıkken 403.
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [PrismaModule, ClaimItemModule, CaseViewScopeModule],
  controllers: [PrecautionaryOrderController],
  providers: [PrecautionaryOrderService],
  exports: [PrecautionaryOrderService],
})
export class PrecautionaryOrderModule {}
