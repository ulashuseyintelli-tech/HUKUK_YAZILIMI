import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { CollectionModule } from '../collection/collection.module';
import { ValidationGateModule } from '../validation-gate/validation-gate.module'; // D4e-8: pre-haciz risk dağılım teşhisi
// WP-4d-2: warn-only diagnostic audit (PERMISSION_WOULD_DENY) için.
import { PermissionDiagnosticsModule } from '../permission-diagnostics/permission-diagnostics.module';

@Module({
  // G3b: CollectionModule → ReportService, kanonik mahsup kırılımı için
  // CollectionService.getCollectedBreakdown'ı kullanır.
  // D4e-8: ValidationGateModule → checkPreHacizIntelligence yeniden çalıştırma (cycle yok: yalnız Prisma).
  imports: [PrismaModule, CollectionModule, ValidationGateModule, PermissionDiagnosticsModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
