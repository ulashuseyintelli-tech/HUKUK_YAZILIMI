import { Module } from '@nestjs/common';
import { ExecutionOfficeService } from './execution-office.service';
import { ExecutionOfficeController } from './execution-office.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ExecutionOfficeController],
  providers: [ExecutionOfficeService],
  exports: [ExecutionOfficeService],
})
export class ExecutionOfficeModule {}
