import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { WorkScopePermissionController } from './work-scope-permission.controller';
import { WorkScopePermissionService } from './work-scope-permission.service';
import { WorkScopeViewController } from './work-scope-view.controller';

/**
 * F02-B-1 — görev / masraf "büro geneli görünüm" izinleri (PermissionGrant GLOBAL; office.tasks.view_all,
 * office.expenses.view_all). Servis dışa verilir: görev ve masraf liste kapsamı dilimleri `resolve()` ile okur.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [WorkScopePermissionController, WorkScopeViewController], // F02-B görünürlük: GET /office/view-scope (salt okuma)
  providers: [WorkScopePermissionService],
  exports: [WorkScopePermissionService],
})
export class WorkScopePermissionModule {}
