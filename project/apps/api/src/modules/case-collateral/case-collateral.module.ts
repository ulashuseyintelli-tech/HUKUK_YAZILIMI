import { Module } from '@nestjs/common';
import { CaseCollateralController } from './case-collateral.controller';
import { CaseCollateralService } from './case-collateral.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [PrismaModule, CaseViewScopeModule], // F02 P3-D3b-1: CaseViewScopeGuard servisi (yoksa kapı 403 ile kapanır)
  controllers: [CaseCollateralController],
  providers: [CaseCollateralService],
  exports: [CaseCollateralService],
})
export class CaseCollateralModule {}
