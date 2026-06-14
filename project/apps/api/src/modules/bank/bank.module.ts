import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { BankService } from './bank.service';
import { BankController } from './bank.controller';
import { CollectionModule } from '../collection/collection.module';

@Module({
  // G3d: banka eşleşmesi tahsilatı kanonik CollectionService'ten üretir.
  imports: [PrismaModule, ConfigModule, CollectionModule],
  controllers: [BankController],
  providers: [BankService],
  exports: [BankService],
})
export class BankModule {}
