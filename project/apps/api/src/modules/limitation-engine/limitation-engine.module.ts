import { Module } from '@nestjs/common';
import { LimitationEngineService } from './limitation-engine.service';
import { LimitationEngineController } from './limitation-engine.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LimitationEngineController],
  providers: [LimitationEngineService],
  exports: [LimitationEngineService],
})
export class LimitationEngineModule {}
