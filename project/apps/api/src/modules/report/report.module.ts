import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { CollectionModule } from '../collection/collection.module';

@Module({
  // G3b: CollectionModule → ReportService, kanonik mahsup kırılımı için
  // CollectionService.getCollectedBreakdown'ı kullanır.
  imports: [PrismaModule, CollectionModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
