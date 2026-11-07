import { Module } from '@nestjs/common';
import { GroupService } from './group.service';
import { GroupController, CaseGroupController } from './group.controller';
import { PrismaModule } from '../../prisma/prisma.module';
// F02 P3-D3: dosya alt kaynağı okuma kapısı (CaseViewScopeGuard → CaseViewScopeService).
import { CaseViewScopeModule } from '../case/case-view-scope.module';

@Module({
  imports: [PrismaModule, CaseViewScopeModule],
  controllers: [GroupController, CaseGroupController],
  providers: [GroupService],
  exports: [GroupService],
})
export class GroupModule {}
