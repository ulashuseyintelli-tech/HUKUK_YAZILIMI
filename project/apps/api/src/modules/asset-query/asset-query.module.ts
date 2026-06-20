import { Module } from '@nestjs/common';
import { AssetQueryController } from './asset-query.controller';
import { AssetQueryService } from './asset-query.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CaseDebtorLifecycleGuardModule } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.module';

@Module({
  imports: [PrismaModule, CaseDebtorLifecycleGuardModule],
  controllers: [AssetQueryController],
  providers: [AssetQueryService],
  exports: [AssetQueryService],
})
export class AssetQueryModule {}
