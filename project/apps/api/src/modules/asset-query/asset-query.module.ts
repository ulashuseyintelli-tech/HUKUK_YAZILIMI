import { Module } from '@nestjs/common';
import { AssetQueryController } from './asset-query.controller';
import { AssetQueryService } from './asset-query.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CaseDebtorLifecycleGuardModule } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.module';
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  // F02 P3 tarama S4: okuma kapıları (CaseObjectViewScopeGuard) CaseViewScopeService ister; yoksa bayrak açıkken 403.
  imports: [PrismaModule, CaseDebtorLifecycleGuardModule, CaseViewScopeModule],
  controllers: [AssetQueryController],
  providers: [AssetQueryService],
  exports: [AssetQueryService],
})
export class AssetQueryModule {}
