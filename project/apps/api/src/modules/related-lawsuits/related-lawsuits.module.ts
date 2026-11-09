import { Module, forwardRef } from '@nestjs/common';
import { RelatedLawsuitsService } from './related-lawsuits.service';
import { RelatedLawsuitsController } from './related-lawsuits.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { TemplateEngineModule } from '../template-engine/template-engine.module';
// F02 P3 tarama S8: dosya kimlikli belge üretim yollarının kapısı (CaseViewScopeGuard) bu servisi ister; yoksa bayrak açıkken 403.
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [PrismaModule, forwardRef(() => TemplateEngineModule), CaseViewScopeModule],
  controllers: [RelatedLawsuitsController],
  providers: [RelatedLawsuitsService],
  exports: [RelatedLawsuitsService],
})
export class RelatedLawsuitsModule {}
