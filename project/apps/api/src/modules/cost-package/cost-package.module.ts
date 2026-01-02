import { Module } from '@nestjs/common';
import { CostPackageService } from './cost-package.service';
import { CostPackageController } from './cost-package.controller';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CostPackageController],
  providers: [CostPackageService],
  exports: [CostPackageService],
})
export class CostPackageModule {}
