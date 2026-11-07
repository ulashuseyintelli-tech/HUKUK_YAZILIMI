import { Module } from '@nestjs/common';
import { TemplateEngineService } from './template-engine.service';
import { TemplateEngineController } from './template-engine.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { FeeEngineModule } from '../fee-engine/fee-engine.module';
// F02 P3-D2: dosya görünüm kapsamı kapısı + artefakt → dosya eşleşmesi (CaseViewScopeService).
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [PrismaModule, FeeEngineModule, CaseViewScopeModule],
  controllers: [TemplateEngineController],
  providers: [TemplateEngineService],
  exports: [TemplateEngineService],
})
export class TemplateEngineModule {}
