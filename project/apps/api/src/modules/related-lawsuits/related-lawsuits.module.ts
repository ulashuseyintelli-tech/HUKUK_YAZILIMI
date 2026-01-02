import { Module, forwardRef } from '@nestjs/common';
import { RelatedLawsuitsService } from './related-lawsuits.service';
import { RelatedLawsuitsController } from './related-lawsuits.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { TemplateEngineModule } from '../template-engine/template-engine.module';

@Module({
  imports: [PrismaModule, forwardRef(() => TemplateEngineModule)],
  controllers: [RelatedLawsuitsController],
  providers: [RelatedLawsuitsService],
  exports: [RelatedLawsuitsService],
})
export class RelatedLawsuitsModule {}
