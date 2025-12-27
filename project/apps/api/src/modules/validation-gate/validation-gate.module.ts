import { Module } from '@nestjs/common';
import { ValidationGateService } from './validation-gate.service';
import { ValidationGateController } from './validation-gate.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ValidationGateController],
  providers: [ValidationGateService],
  exports: [ValidationGateService],
})
export class ValidationGateModule {}
