import { Module } from "@nestjs/common";
import { TaskService } from "./task.service";
import { TaskController } from "./task.controller";
import { WorkScopePermissionModule } from "@/modules/work-scope-permission/work-scope-permission.module";

@Module({
  imports: [WorkScopePermissionModule],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
