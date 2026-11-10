import { Module } from '@nestjs/common';
import { CostPackageService } from './cost-package.service';
import { CostPackageController } from './cost-package.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [CaseViewScopeModule, PrismaModule],
  controllers: [CostPackageController],
  providers: [CostPackageService],
  exports: [CostPackageService],
})
export class CostPackageModule {}
