import { Module } from '@nestjs/common';
import { CaseInstrumentController } from './case-instrument.controller';
import { CaseInstrumentService } from './case-instrument.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CaseInstrumentController],
  providers: [CaseInstrumentService],
  exports: [CaseInstrumentService],
})
export class CaseInstrumentModule {}
