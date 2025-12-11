import { Module } from '@nestjs/common';
import { GroupService } from './group.service';
import { GroupController, CaseGroupController } from './group.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GroupController, CaseGroupController],
  providers: [GroupService],
  exports: [GroupService],
})
export class GroupModule {}
