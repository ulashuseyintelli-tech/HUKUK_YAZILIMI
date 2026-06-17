import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ExpenseBlockReasonController } from './expense-block-reason.controller';
import { ExpenseBlockReasonService } from './expense-block-reason.service';

/**
 * Masraf Blok Gerekçesi modülü (PR-1).
 * Bağımsız modül (K-M1) — mevcut expense-request/case-balance hattına dokunmaz.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ExpenseBlockReasonController],
  providers: [ExpenseBlockReasonService],
  exports: [ExpenseBlockReasonService],
})
export class ExpenseBlockReasonModule {}
