import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';
// O-5b: hesap açma, F02 büro geneli ALLOW kayıtlarını grant servisinin AYNI kilidi ve denetim biçimiyle sona erdirir.
import { WorkScopePermissionModule } from '../work-scope-permission/work-scope-permission.module';

@Module({
  imports: [PrismaModule, OfficeApprovalModule, WorkScopePermissionModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
