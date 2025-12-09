import { Module } from '@nestjs/common';
import { RuleEngineService } from './rule-engine.service';
import { RuleEngineController } from './rule-engine.controller';
import { TcmbService } from './tcmb.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RuleEngineController],
  providers: [RuleEngineService, TcmbService],
  exports: [RuleEngineService, TcmbService],
})
export class RuleEngineModule {}
