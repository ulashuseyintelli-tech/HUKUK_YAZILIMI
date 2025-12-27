import { Module } from '@nestjs/common';
import { TemplateEngineService } from './template-engine.service';
import { TemplateEngineController } from './template-engine.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TemplateEngineController],
  providers: [TemplateEngineService],
  exports: [TemplateEngineService],
})
export class TemplateEngineModule {}
