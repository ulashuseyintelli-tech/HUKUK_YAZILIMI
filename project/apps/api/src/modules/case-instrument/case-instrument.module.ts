import { Module } from '@nestjs/common';
import { CaseInstrumentController } from './case-instrument.controller';
import { CaseInstrumentService } from './case-instrument.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [PrismaModule, CaseViewScopeModule], // F02 P3-D3b-1: CaseViewScopeGuard servisi (yoksa kapı 403 ile kapanır)
  controllers: [CaseInstrumentController],
  providers: [CaseInstrumentService],
  exports: [CaseInstrumentService],
})
export class CaseInstrumentModule {}
