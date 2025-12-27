import { Module } from '@nestjs/common';
import { CaseCollateralController } from './case-collateral.controller';
import { CaseCollateralService } from './case-collateral.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CaseCollateralController],
  providers: [CaseCollateralService],
  exports: [CaseCollateralService],
})
export class CaseCollateralModule {}
