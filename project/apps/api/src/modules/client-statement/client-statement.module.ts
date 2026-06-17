import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientStatementController } from './client-statement.controller';
import { ClientStatementService } from './client-statement.service';

/**
 * Müvekkil Ekstresi modülü (PR-3).
 * Bağımsız modül (K-M1) — mevcut expense-request/case-balance hattına dokunmaz (salt okur).
 */
@Module({
  imports: [PrismaModule],
  controllers: [ClientStatementController],
  providers: [ClientStatementService],
  exports: [ClientStatementService],
})
export class ClientStatementModule {}
