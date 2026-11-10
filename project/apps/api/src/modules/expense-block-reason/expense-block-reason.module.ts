import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ExpenseBlockReasonController } from './expense-block-reason.controller';
import { ExpenseBlockReasonService } from './expense-block-reason.service';
import { WorkScopePermissionModule } from '../work-scope-permission/work-scope-permission.module';

/**
 * Masraf Blok Gerekçesi modülü (PR-1).
 * Bağımsız modül (K-M1) — mevcut expense-request/case-balance hattına dokunmaz.
 */
@Module({
  imports: [PrismaModule, WorkScopePermissionModule], // F02 P3 tarama S2: masraf kapsamı çözücüsü (GET case/:caseId)
  controllers: [ExpenseBlockReasonController],
  providers: [ExpenseBlockReasonService],
  exports: [ExpenseBlockReasonService],
})
export class ExpenseBlockReasonModule {}
