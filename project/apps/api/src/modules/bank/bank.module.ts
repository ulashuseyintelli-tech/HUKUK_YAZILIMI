import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { BankService } from './bank.service';
import { BankController } from './bank.controller';
import { CollectionModule } from '../collection/collection.module';
import { PermissionDiagnosticsModule } from '../permission-diagnostics/permission-diagnostics.module';

@Module({
  // G3d: banka eşleşmesi tahsilatı kanonik CollectionService'ten üretir.
  // P2b-2: BANK_TRANSFER observe hook için GuidedOpenObserveService (observe-only; finans mantığı değişmez).
  imports: [PrismaModule, ConfigModule, CollectionModule, PermissionDiagnosticsModule],
  controllers: [BankController],
  providers: [BankService],
  exports: [BankService],
})
export class BankModule {}
