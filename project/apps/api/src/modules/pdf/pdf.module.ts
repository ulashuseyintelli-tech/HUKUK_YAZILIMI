import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { PdfController } from './pdf.controller';
import { TemplateEngineModule } from '../template-engine/template-engine.module';
// F02 P3-D2: dosya görünüm kapsamı kapısı (CaseViewScopeGuard).
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [TemplateEngineModule, CaseViewScopeModule],
  providers: [PdfService],
  controllers: [PdfController],
  exports: [PdfService],
})
export class PdfModule {}
