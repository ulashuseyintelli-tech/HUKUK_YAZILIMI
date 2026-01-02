import { Module } from '@nestjs/common';
import { TemplateEngineService } from './template-engine.service';
import { TemplateEngineController } from './template-engine.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { FeeEngineModule } from '../fee-engine/fee-engine.module';

@Module({
  imports: [PrismaModule, FeeEngineModule],
  controllers: [TemplateEngineController],
  providers: [TemplateEngineService],
  exports: [TemplateEngineService],
})
export class TemplateEngineModule {}
