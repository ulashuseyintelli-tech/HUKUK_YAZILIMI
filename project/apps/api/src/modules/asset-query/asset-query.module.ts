import { Module } from '@nestjs/common';
import { AssetQueryController } from './asset-query.controller';
import { AssetQueryService } from './asset-query.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AssetQueryController],
  providers: [AssetQueryService],
  exports: [AssetQueryService],
})
export class AssetQueryModule {}
